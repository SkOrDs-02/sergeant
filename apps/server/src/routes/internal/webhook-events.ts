/**
 * `/api/internal/webhook-events/record` — PR-28 webhook replay log.
 *
 * Architecture:
 *
 *   n8n WF-01 / 02 / 06 / 15 webhook trigger
 *     └─ POST /api/internal/webhook-events/record  ◀── ця точка ВХОДУ ─┐
 *         (server-side recordWebhookEvent helper)                       │
 *         → INSERT n8n_webhook_events (...) RETURNING id, received_at  │
 *     └─ existing business logic (filter / categorize / telegram-post)
 *
 *   In-process retention cron (apps/server/src/index.ts)
 *     └─ DELETE-ить рядки старші за `WEBHOOK_EVENTS_RETENTION_DAYS`
 *
 * Чому HTTP-endpoint, а не raw INSERT з n8n postgres-node:
 *   * sanitization headers (`SAFE_HEADER_ALLOWLIST` у `recordWebhookEvent`)
 *     централізована в TS — n8n не дублює allowlist у JSON-конфігах.
 *   * size cap (`PayloadTooLargeError`) і bigint-coercion (Hard Rule #1)
 *     теж живуть у одному місці.
 *   * Зміни policy (наприклад, додати `x-stripe-event-id` у allowlist)
 *     deploy-ляться разом із server-кодом, без редеплою n8n.
 *
 * Auth: bearer-token guard у `routes/internal/index.ts` (`INTERNAL_API_KEY`).
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import {
  HeadersTooLargeError,
  PayloadTooLargeError,
  recordWebhookEvent,
} from "../../modules/webhooks/recordWebhookEvent.js";

const RecordBody = z
  .object({
    workflowId: z.string().min(1).max(128),
    source: z.string().min(1).max(64),
    /** Raw webhook body (parsed JSON). Будь-яка форма JSON-у — JSONB у БД. */
    payload: z.unknown(),
    /** Optional headers map. Сервер сам відфільтрує до safe-allowlist-у. */
    headers: z
      .record(
        z.string(),
        z.union([z.string(), z.array(z.string()), z.undefined()]),
      )
      .optional(),
  })
  .strict();

export function createWebhookEventsInternalRouter({
  pool,
}: {
  pool: Pool;
}): Router {
  const r = Router();

  r.post(
    "/api/internal/webhook-events/record",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(RecordBody, req, res);
      if (!parsed.ok) return;
      try {
        const result = await recordWebhookEvent(pool, {
          workflowId: parsed.data.workflowId,
          source: parsed.data.source,
          payload: parsed.data.payload,
          ...(parsed.data.headers !== undefined
            ? { headers: parsed.data.headers }
            : {}),
        });
        res.json({
          ok: true,
          id: result.id,
          receivedAt: result.receivedAt.toISOString(),
        });
      } catch (err) {
        if (
          err instanceof PayloadTooLargeError ||
          err instanceof HeadersTooLargeError
        ) {
          logger.warn({
            msg: "webhook_events_record_rejected_too_large",
            workflowId: parsed.data.workflowId,
            source: parsed.data.source,
            err: err.message,
            code: err.code,
          });
          res.status(413).json({ error: err.code, message: err.message });
          return;
        }
        throw err;
      }
    }),
  );

  return r;
}
