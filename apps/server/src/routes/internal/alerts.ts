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
import { Sentry } from "../../sentry.js";
import {
  createTelegramApiClient,
  DEFAULT_DEDUP_WINDOW_MS,
  getAlertHistoryStats,
  listPendingAlerts,
  markAlertEscalated,
  markAlertRepeated,
  markAlertSentryWarned,
  markAlertSnoozed,
  postOrEditDedupedAlert,
  recordAlertAck,
  recordAlertPost,
  type TelegramApiClient,
} from "../../modules/alerts/index.js";
import { isFounderMuted } from "../../modules/openclaw/index.js";
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
    notYetRepeated: z.boolean().optional(),
    notYetSentryWarned: z.boolean().optional(),
    notSnoozed: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const EscalateBody = z
  .object({
    alertId: z.string().min(1).max(256),
  })
  .strict();

// Sprint 6 / Tier 2: repeat-ping body. Caller (WF-105) just passes alertId;
// server marks `repeated_at` and returns ok. The actual re-broadcast to the
// topic is owned by n8n — server stays out of the Telegram send path here
// (separation pattern, same as `/alerts/escalate`).
const RepeatBody = z
  .object({
    alertId: z.string().min(1).max(256),
  })
  .strict();

// Sprint 6 / Tier 3: sentry-warn body. Caller (WF-106) just passes alertId;
// server captures the Sentry warning event AND marks `sentry_warned_at`.
// Splitting means the n8n side does not need a Sentry SDK.
const SentryWarnBody = z
  .object({
    alertId: z.string().min(1).max(256),
  })
  .strict();

// Sprint 6 / snooze: operator pressed «🕐 1h» / «🕓 4h» on a T2 repeat-
// message. WF-104 callback router POSTs here. `durationMinutes` is the
// canonical wire type; map `"1h" → 60` / `"4h" → 240` on the n8n side.
const SnoozeBody = z
  .object({
    alertId: z.string().min(1).max(256),
    durationMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
  })
  .strict();

// `/alerts history` debug command (founder DM only). Reads aggregated
// stats from `tg_alert_acks`: top-N noisiest workflows + summary. `days`
// caps at 30 (matches `tg_alert_acks` retention thinking — we don't keep
// raw alert rows forever; 30d window covers month-end ops review).
const HistoryBody = z
  .object({
    days: z.number().int().min(1).max(30).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

// O4 / B.1 — deduped-shipper endpoint. n8n WF callers переходять зі своїх
// "самостійних sendMessage" на цей endpoint — server сам сенд-ить в Telegram
// або робить editMessageText, залежно від dedup-матчу в 10-min вікні.
const SendBody = z
  .object({
    alertId: z.string().min(1).max(256),
    topic: z.string().min(1).max(64),
    severity: z.enum(SEVERITY_VALUES),
    summary: z.string().max(4000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    /**
     * Stable hash for grouping (e.g. "wf-15:railway-deploy-failed:api").
     * NULL/missing → no dedup, behaves like старий sendMessage.
     */
    dedupSignature: z.string().min(1).max(256).optional().nullable(),
    chatId: z.union([z.number().int(), z.string().min(1).max(64)]),
    messageThreadId: z.number().int().optional(),
    text: z.string().min(1).max(4096),
    disableNotification: z.boolean().optional(),
    /**
     * Optional. Якщо supplied, server перевіряє `openclaw_mute_state`
     * (PR /mute Phase 5b) перед send. Non-P0 при активному mute →
     * silently skip з breadcrumb `[openclaw-muted-skip]`. P0 при
     * mute → proceed з breadcrumb `[openclaw-muted-override-critical]`.
     * Topic-channel callers (ops/eng/incidents) НЕ передають це поле —
     * mute стосується тільки founder DM-ів (WF-103 escalations,
     * SAB direct-to-founder pings).
     */
    founderUserId: z.string().min(1).max(128).optional(),
    /** Override window. Необов'язково — default 600_000 ms (10 хв). */
    windowMs: z
      .number()
      .int()
      .min(60_000)
      .max(24 * 60 * 60_000)
      .optional(),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────────

export interface CreateAlertsInternalRouterOptions {
  pool: Pool;
  /**
   * Injectable Telegram client. Default — fetch-based client за
   * `SERGEANT_ALERT_BOT_TOKEN`. Tests передають мок.
   */
  telegramClient?: TelegramApiClient | undefined;
}

export function createAlertsInternalRouter({
  pool,
  telegramClient,
}: CreateAlertsInternalRouterOptions): Router {
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

  // ---- history (OpenClaw `/alerts history <days>`) ----
  r.post(
    "/api/internal/alerts/history",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(HistoryBody, req, res);
      if (!parsed.ok) return;
      const result = await getAlertHistoryStats(pool, {
        ...(parsed.data.days != null ? { daysBack: parsed.data.days } : {}),
        ...(parsed.data.limit != null ? { limit: parsed.data.limit } : {}),
      });
      res.json(result);
    }),
  );

  // ---- send (O4 / B.1 deduped shipper) ----
  r.post(
    "/api/internal/alerts/send",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(SendBody, req, res);
      if (!parsed.ok) return;

      const client = telegramClient ?? defaultAlertBotTelegramClient();
      if (!client) {
        res.status(503).json({
          ok: false,
          error: "telegram_not_configured",
          note: "SERGEANT_ALERT_BOT_TOKEN env не виставлений.",
        });
        return;
      }

      // PR /mute (Phase 5b): founder DM "do not disturb" gate.
      // Caller передає `founderUserId` лише для DM-channel-ів (WF-103
      // escalation, SAB direct-to-founder). Topic-channel-и
      // (ops/eng/incidents) skip-ають це поле — їх mute не торкається.
      // P0 (critical) bypass-ить mute з breadcrumb-ом для audit-trail.
      if (parsed.data.founderUserId) {
        const muteGuard = await isFounderMuted(pool, {
          founderUserId: parsed.data.founderUserId,
        });
        if (muteGuard.muted) {
          if (parsed.data.severity === "P0") {
            Sentry.addBreadcrumb({
              category: "openclaw.mute",
              message: "openclaw-muted-override-critical",
              level: "warning",
              data: {
                alertId: parsed.data.alertId,
                topic: parsed.data.topic,
                severity: parsed.data.severity,
                mutedUntilIso: muteGuard.mutedUntilIso,
              },
            });
          } else {
            Sentry.addBreadcrumb({
              category: "openclaw.mute",
              message: "openclaw-muted-skip",
              level: "info",
              data: {
                alertId: parsed.data.alertId,
                topic: parsed.data.topic,
                severity: parsed.data.severity,
                mutedUntilIso: muteGuard.mutedUntilIso,
              },
            });
            logger.info({
              msg: "alerts_send_skipped_muted",
              alertId: parsed.data.alertId,
              severity: parsed.data.severity,
              mutedUntilIso: muteGuard.mutedUntilIso,
            });
            res.status(200).json({
              action: "skipped_muted",
              alertId: parsed.data.alertId,
              mutedUntilIso: muteGuard.mutedUntilIso,
            });
            return;
          }
        }
      }

      const result = await postOrEditDedupedAlert(pool, client, {
        alertId: parsed.data.alertId,
        topic: parsed.data.topic,
        severity: parsed.data.severity,
        summary: parsed.data.summary ?? null,
        metadata: parsed.data.metadata,
        dedupSignature: parsed.data.dedupSignature ?? null,
        chatId: parsed.data.chatId,
        messageThreadId: parsed.data.messageThreadId,
        text: parsed.data.text,
        disableNotification: parsed.data.disableNotification,
        windowMs: parsed.data.windowMs ?? DEFAULT_DEDUP_WINDOW_MS,
      });

      // Дзеркаляться в archive тільки при першому відправленні (аналог логіки
      // в `/alerts/post`). `edited`/`sent_after_edit_failure`/етц. — вже
      // відомі алерти, archive-рядок вже є.
      if (
        result.action === "sent" &&
        !result.alreadyPosted &&
        parsed.data.summary
      ) {
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

      res.status(result.action === "error" ? 502 : 200).json(result);
    }),
  );

  // ---- escalate (T1 — WF-103 DM founder) ----
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

  // ---- repeat (T2 — WF-105 repeat-ping cron, 60min) ----
  r.post(
    "/api/internal/alerts/repeat",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(RepeatBody, req, res);
      if (!parsed.ok) return;
      const result = await markAlertRepeated(pool, parsed.data.alertId);
      if (result.notFound) {
        res.status(404).json({ error: "alert_not_found" });
        return;
      }
      res.json({
        ok: true,
        alreadyRepeated: result.alreadyRepeated,
      });
    }),
  );

  // ---- sentry-warn (T3 — WF-106 sentry-warn cron, 120min) ----
  r.post(
    "/api/internal/alerts/sentry-warn",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(SentryWarnBody, req, res);
      if (!parsed.ok) return;
      const result = await markAlertSentryWarned(pool, parsed.data.alertId);
      if (result.notFound) {
        res.status(404).json({ error: "alert_not_found" });
        return;
      }
      // Idempotency — if cron retries within the same tick, do not re-fire
      // the Sentry event. Cron-side `notYetSentryWarned=true` filter should
      // prevent this, but defence-in-depth: row was already stamped on a
      // prior successful response.
      if (!result.alreadySentryWarned) {
        try {
          Sentry.captureMessage(
            `unacked-alert-escalation: ${parsed.data.alertId}`,
            {
              level: "warning",
              tags: {
                kind: "unacked-alert-escalation",
                alertId: parsed.data.alertId,
              },
            },
          );
        } catch (err) {
          // Capture failure must NOT block the DB transition — the row is
          // already stamped, so the cron will not retry. Log so opsfolk
          // can spot Sentry-side outages.
          logger.warn({
            msg: "alert_sentry_warn_capture_failed",
            alertId: parsed.data.alertId,
            err: (err as Error)?.message,
          });
        }
      }
      res.json({
        ok: true,
        alreadySentryWarned: result.alreadySentryWarned,
      });
    }),
  );

  // ---- snooze (T2 inline-keyboard «🕐 1h» / «🕓 4h») ----
  r.post(
    "/api/internal/alerts/snooze",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(SnoozeBody, req, res);
      if (!parsed.ok) return;
      const snoozedUntilAt = new Date(
        Date.now() + parsed.data.durationMinutes * 60_000,
      );
      const result = await markAlertSnoozed(pool, {
        alertId: parsed.data.alertId,
        snoozedUntilAt,
      });
      if (result.notFound) {
        res.status(404).json({ error: "alert_not_found" });
        return;
      }
      res.json({
        ok: true,
        snoozedUntilAt: result.snoozedUntilAt,
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

/**
 * Lazy-construct the default fetch-based Telegram client for the alert
 * bot. Returns null when the env var is missing — the route surfaces a
 * 503 in that case. We construct lazily так that boot не падає коли
 * сервер deploy-ється у середовище без alert-бота (місцевий dev).
 */
function defaultAlertBotTelegramClient(): TelegramApiClient | null {
  const token = process.env["SERGEANT_ALERT_BOT_TOKEN"];
  if (!token) return null;
  return createTelegramApiClient(token);
}
