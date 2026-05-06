/**
 * `/api/internal/alerts/*` — accountability surface for
 * `Sergeant_alert_bot` broadcasts (ADR-0038, Wave 3 §3.2).
 *
 * Architecture:
 *
 *   n8n alert WF (WF-03/15/18/22) ─POST /alerts/post─▶  server
 *                                  (idempotent INSERT — same exec retry no-op)
 *
 *   Telegram inline-keyboard click ─→ WF-104 webhook ─POST /alerts/ack─▶
 *                                  (UPDATE WHERE ack_at IS NULL)
 *
 *   WF-103 cron (every 1m)         ─POST /alerts/pending─▶
 *                                    (severity=P0, olderThanMinutes=15,
 *                                     notYetEscalated=true)
 *                                  ─POST /alerts/escalate─▶
 *                                    (UPDATE WHERE escalated_at IS NULL)
 *                                  ─DM via @OpenClaw_sergeant_bot
 *
 *   OpenClaw `/alerts pending`     ─POST /alerts/pending─▶
 *                                    (no escalation filter)
 *
 * Auth: bearer-token guard in `routes/internal/index.ts`
 * (`INTERNAL_API_KEY`). The n8n side and the console side both use the
 * same key — same pattern as `/api/internal/openclaw/*`.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import {
  listPendingAlerts,
  markAlertEscalated,
  recordAlertAck,
  recordAlertPost,
} from "../../modules/alerts/index.js";
import { recordTopicMessage } from "../../modules/topic-archive/index.js";

// ─────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────

const SEVERITY_VALUES = ["P0", "P1", "P2", "P3"] as const;
const ACK_ACTIONS = ["read", "investigating", "muted"] as const;

const PostBody = z
  .object({
    alertId: z.string().min(1).max(256),
    topic: z.string().min(1).max(64),
    severity: z.enum(SEVERITY_VALUES),
    summary: z.string().max(4000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const AckBody = z
  .object({
    alertId: z.string().min(1).max(256),
    /**
     * Telegram user id of the operator who clicked the button. BIGINT
     * domain in DB (Telegram spec: 64-bit unsigned). We accept JS number
     * here — Telegram chat-ids fit safely under `Number.MAX_SAFE_INTEGER`
     * (2^53 - 1 ≈ 9e15) but we still surface this as the canonical wire
     * type; future-proofed if Telegram ever pushes past 53 bits we'd
     * widen to string and coerce server-side.
     */
    ackByTgUserId: z.number().int(),
    ackAction: z.enum(ACK_ACTIONS),
  })
  .strict();

const PendingBody = z
  .object({
    topic: z.string().min(1).max(64).optional(),
    severity: z.enum(SEVERITY_VALUES).optional(),
    olderThanMinutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24)
      .optional(),
    notYetEscalated: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const EscalateBody = z
  .object({
    alertId: z.string().min(1).max(256),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────────

export function createAlertsInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  // ---- post ----
  r.post(
    "/api/internal/alerts/post",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(PostBody, req, res);
      if (!parsed.ok) return;
      const result = await recordAlertPost(pool, {
        alertId: parsed.data.alertId,
        topic: parsed.data.topic,
        severity: parsed.data.severity,
        summary: parsed.data.summary ?? null,
        metadata: parsed.data.metadata,
      });
      // Mirror the alert into `tg_topic_archive` so
      // `read_telegram_topic_history` can surface it (OpenClaw roadmap
      // Phase 3 / Pain P8). Skip when the alert had no `summary` —
      // empty rows are useless to the LLM. Skip on retry path
      // (`alreadyPosted`) — the archive write is idempotent on its own
      // dedupe key but we'd waste a roundtrip.
      if (parsed.data.summary && !result.alreadyPosted) {
        await recordTopicMessage(pool, {
          topic: parsed.data.topic,
          text: parsed.data.summary,
          source: "alert",
          dedupeKey: parsed.data.alertId,
          metadata: {
            severity: parsed.data.severity,
            ...(parsed.data.metadata ?? {}),
          },
        });
      }
      res.json({
        ok: true,
        id: result.id,
        alreadyPosted: result.alreadyPosted,
      });
    }),
  );

  // ---- ack ----
  r.post(
    "/api/internal/alerts/ack",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(AckBody, req, res);
      if (!parsed.ok) return;
      const result = await recordAlertAck(pool, {
        alertId: parsed.data.alertId,
        ackByTgUserId: parsed.data.ackByTgUserId,
        ackAction: parsed.data.ackAction,
      });
      if (result.notFound) {
        res.status(404).json({ error: "alert_not_found" });
        return;
      }
      res.json({
        ok: true,
        alreadyAcked: result.alreadyAcked,
      });
    }),
  );

  // ---- pending ----
  r.post(
    "/api/internal/alerts/pending",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(PendingBody, req, res);
      if (!parsed.ok) return;
      const alerts = await listPendingAlerts(pool, {
        topic: parsed.data.topic,
        severity: parsed.data.severity,
        olderThanMinutes: parsed.data.olderThanMinutes,
        notYetEscalated: parsed.data.notYetEscalated,
        limit: parsed.data.limit,
      });
      res.json({ alerts });
    }),
  );

  // ---- escalate ----
  r.post(
    "/api/internal/alerts/escalate",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(EscalateBody, req, res);
      if (!parsed.ok) return;
      const result = await markAlertEscalated(pool, parsed.data.alertId);
      if (result.notFound) {
        res.status(404).json({ error: "alert_not_found" });
        return;
      }
      res.json({
        ok: true,
        alreadyEscalated: result.alreadyEscalated,
      });
    }),
  );

  // Debug trace — same pattern as openclaw subroutes.
  r.use("/api/internal/alerts", (req, _res, next) => {
    logger.debug({
      msg: "alerts_internal_request",
      path: req.path,
      method: req.method,
    });
    next();
  });

  return r;
}
