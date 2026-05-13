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
import { env } from "../../env.js";
import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import {
  n8nWebhookReplayAttemptsTotal,
  n8nWebhookReplayDurationMs,
} from "../../obs/metrics.js";
import {
  HeadersTooLargeError,
  PayloadTooLargeError,
  recordWebhookEvent,
} from "../../modules/webhooks/recordWebhookEvent.js";
import {
  listReplayableEvents,
  replayWebhookEvent,
  REPLAYABLE_WORKFLOW_IDS,
  ReplayHttpError,
  UnknownWorkflowError,
  type ReplayableEvent,
} from "../../modules/webhooks/replayWebhookEvent.js";

/**
 * Map error → Prometheus `outcome` label. Cardinality-bound enum
 * (5 values total); unknown-shape err → "error" bucket для catch-all.
 */
function replayOutcomeFromError(err: unknown): string {
  if (err instanceof ReplayHttpError) return "http_error";
  if (err instanceof UnknownWorkflowError) return "unknown_workflow";
  if (
    err instanceof Error &&
    (err.name === "AbortError" || /timeout/i.test(err.message))
  ) {
    return "timeout";
  }
  return "error";
}

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

/**
 * PR-29 — schema для `POST /api/internal/webhook-events/replay`.
 *
 * - `eventIds` точкове — за списком ID-ями (mutually exclusive з `since`,
 *   але формально не вимагаємо: коли обидва — `eventIds` precedence).
 * - `since` — ISO datetime; події `received_at >= since`.
 * - Default — events за останні 24h по workflow-id-у.
 * - `dryRun` default `true` (safety-first); CLI має явно передати `false`.
 */
const ReplayBody = z
  .object({
    workflowId: z.string().min(1).max(128),
    eventIds: z.array(z.number().int().positive()).optional(),
    since: z.string().datetime().optional(),
    limit: z.number().int().positive().max(1000).optional(),
    dryRun: z.boolean().optional().default(true),
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

  r.post(
    "/api/internal/webhook-events/replay",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(ReplayBody, req, res);
      if (!parsed.ok) return;

      const { workflowId, eventIds, since, limit, dryRun } = parsed.data;

      // Fail-fast якщо n8n webhook host не сконфігуровано — execute-режим
      // не зможе зробити жодного запиту. Dry-run все одно дозволяємо
      // (operator може запланувати replay перед налаштуванням host-а).
      if (!dryRun && !env.N8N_WEBHOOK_BASE_URL) {
        res.status(503).json({
          error: "not_configured",
          message:
            "N8N_WEBHOOK_BASE_URL не виставлений; execute-replay недоступний. Передайте dryRun=true для перегляду кандидатів.",
        });
        return;
      }

      let candidates: ReplayableEvent[];
      try {
        candidates = await listReplayableEvents(pool, {
          workflowId,
          ...(eventIds && eventIds.length > 0 ? { eventIds } : {}),
          ...(since ? { since: new Date(since) } : {}),
          ...(limit !== undefined ? { limit } : {}),
        });
      } catch (err) {
        if (err instanceof UnknownWorkflowError) {
          res.status(400).json({
            error: err.code,
            message: err.message,
            allowedWorkflowIds: REPLAYABLE_WORKFLOW_IDS,
          });
          return;
        }
        throw err;
      }

      const plan = candidates.map((c) => ({
        id: c.id,
        workflowId: c.workflowId,
        source: c.source,
        receivedAt: c.receivedAt.toISOString(),
        processedAt: c.processedAt ? c.processedAt.toISOString() : null,
        replayCount: c.replayCount,
        lastReplayedAt: c.lastReplayedAt
          ? c.lastReplayedAt.toISOString()
          : null,
      }));

      if (dryRun) {
        res.json({
          ok: true,
          dryRun: true,
          workflowId,
          count: plan.length,
          events: plan,
        });
        return;
      }

      // Execute-режим — fail-soft per-event.
      type ReplayOutcome =
        | { id: number; ok: true; status: number; replayCount: number }
        | { id: number; ok: false; code: string; message: string };

      const outcomes: ReplayOutcome[] = [];
      let successes = 0;
      for (const event of candidates) {
        const startedAt = Date.now();
        let observedOutcome = "ok";
        try {
          const out = await replayWebhookEvent(pool, {
            event,
            n8nWebhookBaseUrl: env.N8N_WEBHOOK_BASE_URL,
          });
          outcomes.push({
            id: out.id,
            ok: true,
            status: out.status,
            replayCount: out.replayCount,
          });
          successes += 1;
        } catch (err) {
          observedOutcome = replayOutcomeFromError(err);
          if (err instanceof ReplayHttpError) {
            outcomes.push({
              id: event.id,
              ok: false,
              code: err.code,
              message: `HTTP ${err.status}: ${err.body.slice(0, 200)}`,
            });
            continue;
          }
          if (err instanceof UnknownWorkflowError) {
            outcomes.push({
              id: event.id,
              ok: false,
              code: err.code,
              message: err.message,
            });
            continue;
          }
          // Mережеві / DOMException AbortError / unexpected — fail-soft
          // на event-рівні, інші event-и продовжують.
          const message = err instanceof Error ? err.message : String(err);
          logger.warn({
            msg: "webhook_events_replay_event_failed",
            eventId: event.id,
            workflowId,
            err: message,
          });
          outcomes.push({
            id: event.id,
            ok: false,
            code: "REPLAY_FAILED",
            message,
          });
        } finally {
          n8nWebhookReplayAttemptsTotal.inc({
            workflow_id: workflowId,
            outcome: observedOutcome,
          });
          n8nWebhookReplayDurationMs.observe(
            { workflow_id: workflowId, outcome: observedOutcome },
            Date.now() - startedAt,
          );
        }
      }

      logger.info({
        msg: "webhook_events_replay_completed",
        workflowId,
        total: candidates.length,
        successes,
        failures: candidates.length - successes,
      });

      res.json({
        ok: true,
        dryRun: false,
        workflowId,
        total: candidates.length,
        successes,
        failures: candidates.length - successes,
        outcomes,
      });
    }),
  );

  return r;
}
