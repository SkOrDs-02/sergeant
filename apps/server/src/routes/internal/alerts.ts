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
import { env } from "../../env/env.js";
import { parseBody } from "../../http/validate.js";
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
  r.post("/api/internal/alerts/post", async (req, res) => {
    const parsed = parseBody(PostBody, req);
    const result = await recordAlertPost(pool, {
      alertId: parsed.alertId,
      topic: parsed.topic,
      severity: parsed.severity,
      summary: parsed.summary ?? null,
      metadata: parsed.metadata,
    });
    // Mirror the alert into `tg_topic_archive` so
    // `read_telegram_topic_history` can surface it (OpenClaw roadmap
    // Phase 3 / Pain P8). Skip when the alert had no `summary` —
    // empty rows are useless to the LLM. Skip on retry path
    // (`alreadyPosted`) — the archive write is idempotent on its own
    // dedupe key but we'd waste a roundtrip.
    if (parsed.summary && !result.alreadyPosted) {
      await recordTopicMessage(pool, {
        topic: parsed.topic,
        text: parsed.summary,
        source: "alert",
        dedupeKey: parsed.alertId,
        metadata: {
          severity: parsed.severity,
          ...(parsed.metadata ?? {}),
        },
      });
    }
    res.json({
      ok: true,
      id: result.id,
      alreadyPosted: result.alreadyPosted,
    });
  });

  // ---- ack ----
  r.post("/api/internal/alerts/ack", async (req, res) => {
    const parsed = parseBody(AckBody, req);
    const result = await recordAlertAck(pool, {
      alertId: parsed.alertId,
      ackByTgUserId: parsed.ackByTgUserId,
      ackAction: parsed.ackAction,
    });
    if (result.notFound) {
      res.status(404).json({ error: "alert_not_found" });
      return;
    }
    res.json({
      ok: true,
      alreadyAcked: result.alreadyAcked,
    });
  });

  // ---- pending ----
  r.post("/api/internal/alerts/pending", async (req, res) => {
    const parsed = parseBody(PendingBody, req);
    const alerts = await listPendingAlerts(pool, {
      topic: parsed.topic,
      severity: parsed.severity,
      olderThanMinutes: parsed.olderThanMinutes,
      notYetEscalated: parsed.notYetEscalated,
      limit: parsed.limit,
    });
    res.json({ alerts });
  });

  // ---- history (OpenClaw `/alerts history <days>`) ----
  r.post("/api/internal/alerts/history", async (req, res) => {
    const parsed = parseBody(HistoryBody, req);
    const result = await getAlertHistoryStats(pool, {
      ...(parsed.days != null ? { daysBack: parsed.days } : {}),
      ...(parsed.limit != null ? { limit: parsed.limit } : {}),
    });
    res.json(result);
  });

  // ---- send (O4 / B.1 deduped shipper) ----
  r.post("/api/internal/alerts/send", async (req, res) => {
    const parsed = parseBody(SendBody, req);

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
    if (parsed.founderUserId) {
      const muteGuard = await isFounderMuted(pool, {
        founderUserId: parsed.founderUserId,
      });
      if (muteGuard.muted) {
        if (parsed.severity === "P0") {
          Sentry.addBreadcrumb({
            category: "openclaw.mute",
            message: "openclaw-muted-override-critical",
            level: "warning",
            data: {
              alertId: parsed.alertId,
              topic: parsed.topic,
              severity: parsed.severity,
              mutedUntilIso: muteGuard.mutedUntilIso,
            },
          });
        } else {
          Sentry.addBreadcrumb({
            category: "openclaw.mute",
            message: "openclaw-muted-skip",
            level: "info",
            data: {
              alertId: parsed.alertId,
              topic: parsed.topic,
              severity: parsed.severity,
              mutedUntilIso: muteGuard.mutedUntilIso,
            },
          });
          logger.info({
            msg: "alerts_send_skipped_muted",
            alertId: parsed.alertId,
            severity: parsed.severity,
            mutedUntilIso: muteGuard.mutedUntilIso,
          });
          res.status(200).json({
            action: "skipped_muted",
            alertId: parsed.alertId,
            mutedUntilIso: muteGuard.mutedUntilIso,
          });
          return;
        }
      }
    }

    const result = await postOrEditDedupedAlert(pool, client, {
      alertId: parsed.alertId,
      topic: parsed.topic,
      severity: parsed.severity,
      summary: parsed.summary ?? null,
      metadata: parsed.metadata,
      dedupSignature: parsed.dedupSignature ?? null,
      chatId: parsed.chatId,
      messageThreadId: parsed.messageThreadId,
      text: parsed.text,
      disableNotification: parsed.disableNotification,
      windowMs: parsed.windowMs ?? DEFAULT_DEDUP_WINDOW_MS,
    });

    // Дзеркаляться в archive тільки при першому відправленні (аналог логіки
    // в `/alerts/post`). `edited`/`sent_after_edit_failure`/етц. — вже
    // відомі алерти, archive-рядок вже є.
    if (result.action === "sent" && !result.alreadyPosted && parsed.summary) {
      await recordTopicMessage(pool, {
        topic: parsed.topic,
        text: parsed.summary,
        source: "alert",
        dedupeKey: parsed.alertId,
        metadata: {
          severity: parsed.severity,
          ...(parsed.metadata ?? {}),
        },
      });
    }

    res.status(result.action === "error" ? 502 : 200).json(result);
  });

  // ---- escalate (T1 — WF-103 DM founder) ----
  r.post("/api/internal/alerts/escalate", async (req, res) => {
    const parsed = parseBody(EscalateBody, req);
    const result = await markAlertEscalated(pool, parsed.alertId);
    if (result.notFound) {
      res.status(404).json({ error: "alert_not_found" });
      return;
    }
    res.json({
      ok: true,
      alreadyEscalated: result.alreadyEscalated,
    });
  });

  // ---- repeat (T2 — WF-105 repeat-ping cron, 60min) ----
  r.post("/api/internal/alerts/repeat", async (req, res) => {
    const parsed = parseBody(RepeatBody, req);
    const result = await markAlertRepeated(pool, parsed.alertId);
    if (result.notFound) {
      res.status(404).json({ error: "alert_not_found" });
      return;
    }
    res.json({
      ok: true,
      alreadyRepeated: result.alreadyRepeated,
    });
  });

  // ---- sentry-warn (T3 — WF-106 sentry-warn cron, 120min) ----
  r.post("/api/internal/alerts/sentry-warn", async (req, res) => {
    const parsed = parseBody(SentryWarnBody, req);
    const result = await markAlertSentryWarned(pool, parsed.alertId);
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
        Sentry.captureMessage(`unacked-alert-escalation: ${parsed.alertId}`, {
          level: "warning",
          tags: {
            kind: "unacked-alert-escalation",
            alertId: parsed.alertId,
          },
        });
      } catch (err) {
        // Capture failure must NOT block the DB transition — the row is
        // already stamped, so the cron will not retry. Log so opsfolk
        // can spot Sentry-side outages.
        logger.warn({
          msg: "alert_sentry_warn_capture_failed",
          alertId: parsed.alertId,
          err: (err as Error)?.message,
        });
      }
    }
    res.json({
      ok: true,
      alreadySentryWarned: result.alreadySentryWarned,
    });
  });

  // ---- snooze (T2 inline-keyboard «🕐 1h» / «🕓 4h») ----
  r.post("/api/internal/alerts/snooze", async (req, res) => {
    const parsed = parseBody(SnoozeBody, req);
    const snoozedUntilAt = new Date(
      Date.now() + parsed.durationMinutes * 60_000,
    );
    const result = await markAlertSnoozed(pool, {
      alertId: parsed.alertId,
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
  });

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
  const token = env.SERGEANT_ALERT_BOT_TOKEN;
  if (!token) return null;
  return createTelegramApiClient(token);
}
