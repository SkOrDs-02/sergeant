/**
 * Handler `POST /api/ai-memory/event-sync` — PostHog → AI memory dual-fire.
 *
 * Caller: web `apps/web/src/core/observability/productMemorySync.ts` дзеркалить
 * allowlisted analytics events. Server: валідує event-name + payload, дзвонить
 * `recordProductMemoryEvent`, повертає 202 / 200 / 4xx.
 *
 * Status codes:
 *   - 202 — event у allowlist, ingest enqueued (best-effort: повертаємо
 *           навіть якщо `recordProductMemoryEvent` логуючи fail-нувся
 *           всередині — клієнт нічого не може з цим зробити).
 *   - 200 + `{ok:false, reason:"event_not_synced"}` — event поза allowlist;
 *           НЕ помилка для клієнта (web `trackEvent` дрібнить десятки
 *           подій, sync викликається безумовно — нам зручно сказати "пас"
 *           замість 4xx).
 *   - 400 — schema-fail (відсутній eventName/payload, погані типи).
 *   - 401 — без сесії (router middleware).
 *   - 503 — `AI_MEMORY_ENABLED=false`.
 */

import type { Request, Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { env } from "../../env.js";
import { validateBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import {
  isProductMemoryEvent,
  recordProductMemoryEvent,
  type ProductMemoryEventName,
} from "./eventSync.js";

type WithSessionUser = Request & { user?: { id: string } };

const MAX_EVENT_NAME_LEN = 80;

/**
 * Zod schema. `payload` навмисно `z.record(z.string(), z.unknown())` —
 * жорсткіша валідація живе в event-mapper-і; route шар — anti-DoS
 * (rejected huge/malformed objects).
 */
function buildEventSyncSchema() {
  return z
    .object({
      eventName: z.string().min(1).max(MAX_EVENT_NAME_LEN),
      payload: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();
}

export function buildEventSyncHandler(pool: Pool) {
  return async function eventSyncHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!env.AI_MEMORY_ENABLED) {
      res.status(503).json({
        error: "AI memory вимкнено на сервері",
        code: "AI_MEMORY_DISABLED",
      });
      return;
    }

    const parsed = validateBody(buildEventSyncSchema(), req, res);
    if (!parsed.ok) return;
    const { eventName, payload } = parsed.data;

    if (!isProductMemoryEvent(eventName)) {
      // Не 4xx — web sync-shim дзвонить безумовно; відмова з 4xx
      // забруднила б browser console + Sentry чужими `network error`
      // breadcrumbs.
      res.status(200).json({ ok: false, reason: "event_not_synced" });
      return;
    }

    const userId = (req as WithSessionUser).user!.id;

    try {
      const result = await recordProductMemoryEvent(pool, {
        userId,
        eventName: eventName as ProductMemoryEventName,
        payload,
      });
      logger.info({
        msg: "ai_memory_event_sync_ok",
        userId,
        eventName,
        enqueued: result.enqueued,
        contentLength: result.contentLength,
      });
      res.status(202).json({
        ok: true,
        enqueued: result.enqueued,
        sourceRef: result.sourceRef,
      });
    } catch (err) {
      logger.error({
        msg: "ai_memory_event_sync_unexpected_error",
        userId,
        eventName,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({
        error: "Не вдалося обробити event-sync",
        code: "EVENT_SYNC_FAILED",
      });
    }
  };
}
