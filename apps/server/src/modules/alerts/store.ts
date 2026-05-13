/**
 * DB helpers for `tg_alert_acks` (ADR-0038, Wave 3 §3.2).
 *
 * Pure functions over a `pg.Pool`. No caching, no singletons. Caller
 * brings its own pool — same pattern as `modules/openclaw/store.ts`.
 *
 * Lifecycle (one row per `alert_id`):
 *
 *   recordAlertPost   — INSERT … ON CONFLICT DO NOTHING.
 *                        Returns `alreadyPosted=true` on retry.
 *   recordAlertAck    — UPDATE … WHERE alert_id=$1 AND ack_at IS NULL.
 *                        First click wins; later clicks no-op.
 *   markAlertEscalated — UPDATE … WHERE alert_id=$1 AND escalated_at
 *                        IS NULL. WF-103 cron-safe.
 *   listPendingAlerts — SELECT … WHERE ack_at IS NULL [+ filters].
 *                        Drives `/alerts pending` slash + WF-103 cron.
 */

import type { Pool } from "pg";
import type {
  TgAlertAckAction,
  TgAlertAckRecord,
  TgAlertSeverity,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────
// recordAlertPost
// ─────────────────────────────────────────────────────────────────────────

export interface RecordAlertPostInput {
  alertId: string;
  topic: string;
  severity: TgAlertSeverity;
  summary?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RecordAlertPostResult {
  /** id of the row we inserted, or of the pre-existing row on retry. */
  id: number;
  /** True when the same `alertId` already had a row (idempotent retry). */
  alreadyPosted: boolean;
}

/**
 * Inserts one row in `tg_alert_acks`. Idempotent — a second call with the
 * same `alertId` is a no-op and returns the existing row's id with
 * `alreadyPosted=true`. Why: n8n retry storms (60 s Telegram timeout +
 * automatic re-execute) must NOT duplicate alert rows nor reset
 * `posted_at` (which would break the WF-103 TTA / escalation metric).
 */
export async function recordAlertPost(
  pool: Pool,
  input: RecordAlertPostInput,
): Promise<RecordAlertPostResult> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO tg_alert_acks (alert_id, topic, severity, summary, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (alert_id) DO NOTHING
     RETURNING id`,
    [
      input.alertId,
      input.topic,
      input.severity,
      input.summary ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  if (inserted.rowCount && inserted.rows[0]) {
    return { id: Number(inserted.rows[0].id), alreadyPosted: false };
  }
  // Conflict path — fetch the pre-existing row's id so the caller can
  // log it. No race here: the unique key guarantees the row exists.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tg_alert_acks WHERE alert_id = $1`,
    [input.alertId],
  );
  return {
    id: Number(existing.rows[0]?.id ?? 0),
    alreadyPosted: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// recordAlertAck
// ─────────────────────────────────────────────────────────────────────────

export interface RecordAlertAckInput {
  alertId: string;
  ackByTgUserId: number;
  ackAction: TgAlertAckAction;
}

export interface RecordAlertAckResult {
  /** True when the alert exists and we recorded the ack. */
  ok: boolean;
  /** True when `ack_at` was already populated; the caller may surface a "already acknowledged" hint. */
  alreadyAcked: boolean;
  /** True when the `alertId` is unknown — caller should respond 404. */
  notFound: boolean;
}

/**
 * Marks an alert as acknowledged. Idempotent — if `ack_at` is already
 * populated, returns `alreadyAcked=true` without touching the row.
 *
 * Race-safe: the WHERE-clause `ack_at IS NULL` ensures only the first
 * click wins. A second click landing 50 ms later would update zero rows
 * and we report `alreadyAcked=true` to the caller (which is what the
 * Telegram callback handler should surface as "already acked by …").
 */
export async function recordAlertAck(
  pool: Pool,
  input: RecordAlertAckInput,
): Promise<RecordAlertAckResult> {
  const updated = await pool.query<{ id: string }>(
    `UPDATE tg_alert_acks
        SET ack_at = NOW(),
            ack_by_tg_user_id = $2,
            ack_action = $3
      WHERE alert_id = $1 AND ack_at IS NULL
      RETURNING id`,
    [input.alertId, input.ackByTgUserId, input.ackAction],
  );
  if (updated.rowCount && updated.rows[0]) {
    return { ok: true, alreadyAcked: false, notFound: false };
  }
  // Either the row exists with `ack_at` already set OR it does not exist
  // at all. We disambiguate via a follow-up SELECT so the route can
  // 404 vs 200-with-hint correctly.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tg_alert_acks WHERE alert_id = $1`,
    [input.alertId],
  );
  if (existing.rowCount && existing.rows[0]) {
    return { ok: true, alreadyAcked: true, notFound: false };
  }
  return { ok: false, alreadyAcked: false, notFound: true };
}

// ─────────────────────────────────────────────────────────────────────────
// markAlertEscalated
// ─────────────────────────────────────────────────────────────────────────

export interface MarkAlertEscalatedResult {
  ok: boolean;
  alreadyEscalated: boolean;
  notFound: boolean;
}

/**
 * Marks an alert as escalated (WF-103 cron has DM-pinged the founder).
 * Idempotent — second call with same `alertId` returns
 * `alreadyEscalated=true` without re-stamping `escalated_at`.
 *
 * Race vs. user-ack: WF-103 query already filters
 * `WHERE ack_at IS NULL AND escalated_at IS NULL`, so if the user clicks
 * an ack button between query-time and this UPDATE, the WHERE here would
 * still match (we do NOT filter on `ack_at` here intentionally — once
 * the cron decided to escalate, we record that to keep the audit-trail
 * complete). Net effect: at most one DM per alert, even under race.
 */
export async function markAlertEscalated(
  pool: Pool,
  alertId: string,
): Promise<MarkAlertEscalatedResult> {
  const updated = await pool.query<{ id: string }>(
    `UPDATE tg_alert_acks
        SET escalated_at = NOW()
      WHERE alert_id = $1 AND escalated_at IS NULL
      RETURNING id`,
    [alertId],
  );
  if (updated.rowCount && updated.rows[0]) {
    return { ok: true, alreadyEscalated: false, notFound: false };
  }
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tg_alert_acks WHERE alert_id = $1`,
    [alertId],
  );
  if (existing.rowCount && existing.rows[0]) {
    return { ok: true, alreadyEscalated: true, notFound: false };
  }
  return { ok: false, alreadyEscalated: false, notFound: true };
}

// ─────────────────────────────────────────────────────────────────────────
// listPendingAlerts
// ─────────────────────────────────────────────────────────────────────────

export interface ListPendingAlertsFilters {
  /** Optional forum-topic filter (`incidents`, `revenue`, …). */
  topic?: string | undefined;
  /** Optional severity filter (P0..P3). */
  severity?: TgAlertSeverity | undefined;
  /**
   * Lower-bound on `posted_at` — alert must be older than this many
   * minutes. WF-103 escalation cron passes `15`. `/alerts pending`
   * slash passes `0` to surface everything.
   */
  olderThanMinutes?: number | undefined;
  /**
   * When true, exclude rows that already have `escalated_at` set. WF-103
   * passes `true` to avoid double-DM.
   */
  notYetEscalated?: boolean | undefined;
  /**
   * When true, exclude rows that already have `repeated_at` set. WF-105
   * Tier-2 repeat-ping cron passes `true` to avoid double-repeat.
   */
  notYetRepeated?: boolean | undefined;
  /**
   * When true, exclude rows that already have `sentry_warned_at` set.
   * WF-106 Tier-3 sentry-warn cron passes `true` to avoid duplicate
   * Sentry events.
   */
  notYetSentryWarned?: boolean | undefined;
  /**
   * When true, exclude rows whose `snoozed_until_at` is in the future.
   * WF-105/WF-106 both pass `true` so operator-snooze suppresses tier-cron
   * actions until the snooze expires.
   */
  notSnoozed?: boolean | undefined;
  /** 1..100, default 50. */
  limit?: number | undefined;
}

/**
 * Returns un-acked alert rows newest-first, with optional filters. Drives
 * both the WF-103 escalation cron AND the `/alerts pending` OpenClaw
 * slash command — different filter combinations yield each use case:
 *
 *   - WF-103: `{ severity: 'P0', olderThanMinutes: 15, notYetEscalated: true }`
 *   - /alerts pending: `{}`
 */
export async function listPendingAlerts(
  pool: Pool,
  filters: ListPendingAlertsFilters,
): Promise<TgAlertAckRecord[]> {
  const conditions: string[] = ["ack_at IS NULL"];
  const params: unknown[] = [];

  if (filters.topic) {
    params.push(filters.topic);
    conditions.push(`topic = $${params.length}`);
  }
  if (filters.severity) {
    params.push(filters.severity);
    conditions.push(`severity = $${params.length}`);
  }
  if (filters.olderThanMinutes && filters.olderThanMinutes > 0) {
    params.push(filters.olderThanMinutes);
    // Use parametrised interval — `make_interval(mins => $N)` keeps the
    // server out of any SQL-injection concern even if a future caller
    // forgets to clamp.
    conditions.push(
      `posted_at < NOW() - make_interval(mins => $${params.length})`,
    );
  }
  if (filters.notYetEscalated) {
    conditions.push(`escalated_at IS NULL`);
  }
  if (filters.notYetRepeated) {
    conditions.push(`repeated_at IS NULL`);
  }
  if (filters.notYetSentryWarned) {
    conditions.push(`sentry_warned_at IS NULL`);
  }
  if (filters.notSnoozed) {
    conditions.push(`(snoozed_until_at IS NULL OR snoozed_until_at < NOW())`);
  }

  const limit = Math.max(1, Math.min(100, filters.limit ?? 50));
  params.push(limit);

  // eslint-disable-next-line no-restricted-syntax -- conditions[] is built from a fixed allow-list of literal SQL fragments; user input flows through $-params only.
  const result = await pool.query(
    `SELECT id, posted_at, alert_id, topic, severity, summary,
            ack_at, ack_by_tg_user_id, ack_action,
            escalated_at, repeated_at, sentry_warned_at, snoozed_until_at,
            metadata,
            dedup_signature, occurrence_count, last_occurrence_at,
            telegram_chat_id, telegram_message_id
       FROM tg_alert_acks
      WHERE ${conditions.join(" AND ")}
      ORDER BY posted_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return result.rows.map(mapRowToRecord);
}

// ───────────────────────────────────────────────────────────────────────
// getAlertHistoryStats — `/alerts history` debug command
// ───────────────────────────────────────────────────────────────────────

export interface AlertHistoryWorkflowStats {
  /**
   * First `:`-segment of `alert_id` — n8n workflow identifier
   * (e.g. `wf-15`, `wf08`, `wf98`). Free-form string; we just split, not
   * validate, so legacy/test alerts with unusual shapes still show up.
   */
  workflowId: string;
  /** Total rows in window (acked + unacked). */
  total: number;
  /** Subset where `ack_at IS NOT NULL`. */
  acked: number;
  /** Subset where `escalated_at IS NOT NULL` (T1 DM-ping fired). */
  escalated: number;
  /** Subset where `repeated_at IS NOT NULL` (T2 repeat-broadcast fired). */
  repeated: number;
  /** Subset where `sentry_warned_at IS NOT NULL` (T3 Sentry event fired). */
  sentryWarned: number;
  /**
   * Ack ratio as a 0..100 integer. `total - acked` is the "still
   * unanswered after the window" count — a workflow with a low `ackRate`
   * is a tuning candidate (either too noisy, or too low-signal to merit
   * an alert at all).
   */
  ackRatePct: number;
  /**
   * Average minutes between `posted_at` and `ack_at` (acked rows only).
   * `null` when the workflow had no acked rows in the window. Rounded to
   * one decimal place; nullable to keep the type honest.
   */
  avgTtaMinutes: number | null;
}

export interface AlertHistorySummary {
  daysBack: number;
  total: number;
  acked: number;
  escalated: number;
  repeated: number;
  sentryWarned: number;
  ackRatePct: number;
  avgTtaMinutes: number | null;
  /**
   * How many distinct `workflowId`s contributed rows in the window —
   * useful in the slash-command footer ("12 workflows fired alerts").
   */
  workflowCount: number;
}

export interface GetAlertHistoryStatsInput {
  /** Look-back window in whole days. Caller clamps; we still defensively
   *  clamp 1..30 for safety. Default 7. */
  daysBack?: number;
  /** Max rows in the top-N table. 1..50, default 10. */
  limit?: number;
}

export interface AlertHistoryStatsResult {
  workflows: AlertHistoryWorkflowStats[];
  summary: AlertHistorySummary;
}

/**
 * Aggregates `tg_alert_acks` over the last N days for the `/alerts history`
 * slash-command. Group key is `split_part(alert_id, ':', 1)` — the n8n
 * workflow id (e.g. `wf-15`, `wf98`). Returns:
 *
 *   - `workflows`: top-N noisiest workflows by `total`, with per-status
 *     counts, ack ratio, and avg TTA (time-to-ack, minutes).
 *   - `summary`: overall aggregates across the full window (not limited
 *     to the top-N) so the slash-command footer can show "X/Y acked" for
 *     the whole period.
 *
 * Implementation notes:
 *   - Two queries (top-N + window-total) so the summary stays correct
 *     even when there are >50 distinct workflows.
 *   - `COUNT(col)` counts non-NULLs — exactly what we want for acked /
 *     escalated / repeated / sentry-warned breakdown.
 *   - `EXTRACT(EPOCH FROM ack_at - posted_at) / 60` gives TTA minutes;
 *     `FILTER (WHERE ack_at IS NOT NULL)` keeps the AVG sane (NULL when
 *     no rows match — pg returns NULL, we map to `null`).
 *   - `posted_at >= NOW() - make_interval(days => $1)` keeps the SQL
 *     injection-safe even when caller forgets to clamp.
 */
export async function getAlertHistoryStats(
  pool: Pool,
  input: GetAlertHistoryStatsInput = {},
): Promise<AlertHistoryStatsResult> {
  const daysBack = Math.max(1, Math.min(30, Math.round(input.daysBack ?? 7)));
  const limit = Math.max(1, Math.min(50, Math.round(input.limit ?? 10)));

  const topWorkflowsResult = await pool.query<{
    workflow_id: string;
    total: string;
    acked: string;
    escalated: string;
    repeated: string;
    sentry_warned: string;
    avg_tta_minutes: string | null;
  }>(
    `SELECT
        split_part(alert_id, ':', 1) AS workflow_id,
        COUNT(*) AS total,
        COUNT(ack_at) AS acked,
        COUNT(escalated_at) AS escalated,
        COUNT(repeated_at) AS repeated,
        COUNT(sentry_warned_at) AS sentry_warned,
        AVG(EXTRACT(EPOCH FROM (ack_at - posted_at)) / 60.0)
          FILTER (WHERE ack_at IS NOT NULL) AS avg_tta_minutes
       FROM tg_alert_acks
      WHERE posted_at >= NOW() - make_interval(days => $1)
      GROUP BY workflow_id
      ORDER BY total DESC, workflow_id ASC
      LIMIT $2`,
    [daysBack, limit],
  );

  const summaryResult = await pool.query<{
    total: string;
    acked: string;
    escalated: string;
    repeated: string;
    sentry_warned: string;
    avg_tta_minutes: string | null;
    workflow_count: string;
  }>(
    `SELECT
        COUNT(*) AS total,
        COUNT(ack_at) AS acked,
        COUNT(escalated_at) AS escalated,
        COUNT(repeated_at) AS repeated,
        COUNT(sentry_warned_at) AS sentry_warned,
        AVG(EXTRACT(EPOCH FROM (ack_at - posted_at)) / 60.0)
          FILTER (WHERE ack_at IS NOT NULL) AS avg_tta_minutes,
        COUNT(DISTINCT split_part(alert_id, ':', 1)) AS workflow_count
       FROM tg_alert_acks
      WHERE posted_at >= NOW() - make_interval(days => $1)`,
    [daysBack],
  );

  const summaryRow = summaryResult.rows[0];
  const summaryTotal = summaryRow ? Number(summaryRow.total) : 0;
  const summaryAcked = summaryRow ? Number(summaryRow.acked) : 0;

  const workflows: AlertHistoryWorkflowStats[] = topWorkflowsResult.rows.map(
    (row) => {
      const total = Number(row.total);
      const acked = Number(row.acked);
      const avgTta =
        row.avg_tta_minutes == null ? null : Number(row.avg_tta_minutes);
      return {
        workflowId: row.workflow_id || "(unknown)",
        total,
        acked,
        escalated: Number(row.escalated),
        repeated: Number(row.repeated),
        sentryWarned: Number(row.sentry_warned),
        ackRatePct: total === 0 ? 0 : Math.round((acked / total) * 100),
        avgTtaMinutes:
          avgTta == null || !Number.isFinite(avgTta)
            ? null
            : Math.round(avgTta * 10) / 10,
      };
    },
  );

  const summaryAvgTta = summaryRow?.avg_tta_minutes
    ? Number(summaryRow.avg_tta_minutes)
    : null;

  return {
    workflows,
    summary: {
      daysBack,
      total: summaryTotal,
      acked: summaryAcked,
      escalated: summaryRow ? Number(summaryRow.escalated) : 0,
      repeated: summaryRow ? Number(summaryRow.repeated) : 0,
      sentryWarned: summaryRow ? Number(summaryRow.sentry_warned) : 0,
      ackRatePct:
        summaryTotal === 0
          ? 0
          : Math.round((summaryAcked / summaryTotal) * 100),
      avgTtaMinutes:
        summaryAvgTta == null || !Number.isFinite(summaryAvgTta)
          ? null
          : Math.round(summaryAvgTta * 10) / 10,
      workflowCount: summaryRow ? Number(summaryRow.workflow_count) : 0,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// markAlertRepeated / markAlertSentryWarned / markAlertSnoozed
// (Sprint 6 / escalation tiers — T2 + T3 + snooze)
// ───────────────────────────────────────────────────────────────────────

export interface MarkAlertRepeatedResult {
  ok: boolean;
  alreadyRepeated: boolean;
  notFound: boolean;
}

/**
 * Marks an alert as Tier-2 repeated (WF-105 cron has posted the [⚠ REPEAT]
 * broadcast to the topic). Idempotent — second call with same `alertId`
 * returns `alreadyRepeated=true` without re-stamping `repeated_at`.
 *
 * Race vs. user-ack: WF-105 query already filters `WHERE ack_at IS NULL`,
 * but a click landing between SELECT and this UPDATE would still match
 * (we do NOT filter on `ack_at` here intentionally — once the cron decided
 * to repeat, we record that for audit-trail completeness). Net effect: at
 * most one repeat-broadcast per alert, even under race.
 */
export async function markAlertRepeated(
  pool: Pool,
  alertId: string,
): Promise<MarkAlertRepeatedResult> {
  const updated = await pool.query<{ id: string }>(
    `UPDATE tg_alert_acks
        SET repeated_at = NOW()
      WHERE alert_id = $1 AND repeated_at IS NULL
      RETURNING id`,
    [alertId],
  );
  if (updated.rowCount && updated.rows[0]) {
    return { ok: true, alreadyRepeated: false, notFound: false };
  }
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tg_alert_acks WHERE alert_id = $1`,
    [alertId],
  );
  if (existing.rowCount && existing.rows[0]) {
    return { ok: true, alreadyRepeated: true, notFound: false };
  }
  return { ok: false, alreadyRepeated: false, notFound: true };
}

export interface MarkAlertSentryWarnedResult {
  ok: boolean;
  alreadySentryWarned: boolean;
  notFound: boolean;
}

/**
 * Marks an alert as Tier-3 Sentry-warned (WF-106 cron has captured a
 * Sentry warning event). Idempotent — second call with same `alertId`
 * returns `alreadySentryWarned=true` without re-stamping or re-capturing.
 *
 * Caller (route) is responsible for the actual `Sentry.captureMessage`;
 * this function only records the DB transition. Splitting them keeps
 * the store unit-testable without a Sentry mock.
 */
export async function markAlertSentryWarned(
  pool: Pool,
  alertId: string,
): Promise<MarkAlertSentryWarnedResult> {
  const updated = await pool.query<{ id: string }>(
    `UPDATE tg_alert_acks
        SET sentry_warned_at = NOW()
      WHERE alert_id = $1 AND sentry_warned_at IS NULL
      RETURNING id`,
    [alertId],
  );
  if (updated.rowCount && updated.rows[0]) {
    return { ok: true, alreadySentryWarned: false, notFound: false };
  }
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tg_alert_acks WHERE alert_id = $1`,
    [alertId],
  );
  if (existing.rowCount && existing.rows[0]) {
    return { ok: true, alreadySentryWarned: true, notFound: false };
  }
  return { ok: false, alreadySentryWarned: false, notFound: true };
}

export interface MarkAlertSnoozedInput {
  alertId: string;
  /** Absolute timestamp at which the snooze expires. */
  snoozedUntilAt: Date;
}

export interface MarkAlertSnoozedResult {
  ok: boolean;
  notFound: boolean;
  /** ISO-8601 of the persisted `snoozed_until_at`, or null on notFound. */
  snoozedUntilAt: string | null;
}

/**
 * Records an operator snooze. UNLIKE the other transitions, snooze is
 * NOT one-shot — a second click extends the window (latest-write-wins)
 * because operators may up-grade a 1h snooze to 4h.
 */
export async function markAlertSnoozed(
  pool: Pool,
  input: MarkAlertSnoozedInput,
): Promise<MarkAlertSnoozedResult> {
  const updated = await pool.query<{ snoozed_until_at: Date | string }>(
    `UPDATE tg_alert_acks
        SET snoozed_until_at = $2
      WHERE alert_id = $1
      RETURNING snoozed_until_at`,
    [input.alertId, input.snoozedUntilAt],
  );
  const row = updated.rows[0];
  if (!updated.rowCount || !row) {
    return { ok: false, notFound: true, snoozedUntilAt: null };
  }
  return {
    ok: true,
    notFound: false,
    snoozedUntilAt:
      row.snoozed_until_at instanceof Date
        ? row.snoozed_until_at.toISOString()
        : String(row.snoozed_until_at),
  };
}

// ──────────────────────────────────────────────────────────────────────
// findRecentDedupMatch / incrementOccurrence / recordTelegramMessage
// (O4 / B.1 — sprint-roadmap §1.2, telegram-improvements-roadmap §4.2)
// ──────────────────────────────────────────────────────────────────────

export interface FindRecentDedupMatchInput {
  topic: string;
  dedupSignature: string;
  /** Lookback window in milliseconds (10 хв = 600_000 default). */
  windowMs: number;
}

/**
 * Returns the most recent `tg_alert_acks` row matching `(topic,
 * dedup_signature)` that fired within the last `windowMs`, or `null`.
 *
 * “Fresh” визначається як `last_occurrence_at >= NOW() - windowMs`. Беремо
 * `last_occurrence_at`, а не `posted_at`, бо вікно має sliding-поведінку:
 * кожний occurrence подовжує життя групи. Якщо 10 хв без нового дубля —
 * наступний alert піде окремим рядком.
 *
 * NULL-якщо матч не знайдено — калер повинен викликати `recordAlertPost`
 * як для нової групи.
 */
export async function findRecentDedupMatch(
  pool: Pool,
  input: FindRecentDedupMatchInput,
): Promise<TgAlertAckRecord | null> {
  const result = await pool.query(
    `SELECT id, posted_at, alert_id, topic, severity, summary,
            ack_at, ack_by_tg_user_id, ack_action,
            escalated_at, repeated_at, sentry_warned_at, snoozed_until_at,
            metadata,
            dedup_signature, occurrence_count, last_occurrence_at,
            telegram_chat_id, telegram_message_id
       FROM tg_alert_acks
      WHERE topic = $1
        AND dedup_signature = $2
        AND last_occurrence_at IS NOT NULL
        AND last_occurrence_at >= NOW() - make_interval(secs => $3::double precision)
      ORDER BY last_occurrence_at DESC
      LIMIT 1`,
    [input.topic, input.dedupSignature, input.windowMs / 1000],
  );
  if (!result.rowCount || !result.rows[0]) return null;
  return mapRowToRecord(result.rows[0]);
}

export interface IncrementOccurrenceResult {
  /** Новий occurrence_count після інкременту. */
  occurrenceCount: number;
  /** Новий `last_occurrence_at` (ISO-8601). */
  lastOccurrenceAt: string;
}

/**
 * Атомарно інкрементує `occurrence_count` і виставляє `last_occurrence_at
 * = NOW()` для рядка з даним id. Повертає новий лічильник + час, щоб
 * caller міг скласти новий message-text для editMessageText.
 *
 * Race-safe навіть під concurrent calls для одного id: SQL UPDATE з
 * `occurrence_count = occurrence_count + 1` атомарний на row-level lock
 * (без потреби у SELECT … FOR UPDATE).
 *
 * Якщо рядок не знайдено (race з видаленням, тощо) — повертає NaN-
 * лічильник + порожній рядок як guard-value, caller має fallback на
 * full sendMessage.
 */
export async function incrementOccurrence(
  pool: Pool,
  id: number,
): Promise<IncrementOccurrenceResult> {
  const result = await pool.query<{
    occurrence_count: number;
    last_occurrence_at: Date | string;
  }>(
    `UPDATE tg_alert_acks
        SET occurrence_count = occurrence_count + 1,
            last_occurrence_at = NOW()
      WHERE id = $1
      RETURNING occurrence_count, last_occurrence_at`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    return { occurrenceCount: Number.NaN, lastOccurrenceAt: "" };
  }
  return {
    occurrenceCount: Number(row.occurrence_count),
    lastOccurrenceAt:
      row.last_occurrence_at instanceof Date
        ? row.last_occurrence_at.toISOString()
        : String(row.last_occurrence_at),
  };
}

export interface RecordTelegramMessageInput {
  alertId: string;
  telegramChatId: number;
  telegramMessageId: number;
}

/**
 * Записує `(chat_id, message_id)` відправленого в Telegram повідомлення в row
 * `tg_alert_acks` за `alert_id`. Також виставляє `last_occurrence_at = NOW()`
 * якщо воно ще не виставлене — це відбьє слайдинг-вікно від першого сенд-у.
 *
 * Ідемпотентно: записуємо тільки якщо `telegram_message_id IS NULL` —
 * якщо n8n ретрайить send-ї і записує двічі, перший message_id перемагає
 * (editMessageText потім буде для першого, а друге повідомлення вже stale).
 */
export async function recordTelegramMessage(
  pool: Pool,
  input: RecordTelegramMessageInput,
): Promise<{ ok: boolean }> {
  const result = await pool.query<{ id: string }>(
    `UPDATE tg_alert_acks
        SET telegram_chat_id = $2,
            telegram_message_id = $3,
            last_occurrence_at = COALESCE(last_occurrence_at, NOW())
      WHERE alert_id = $1
        AND telegram_message_id IS NULL
      RETURNING id`,
    [input.alertId, input.telegramChatId, input.telegramMessageId],
  );
  return { ok: Boolean(result.rowCount && result.rows[0]) };
}

// ──────────────────────────────────────────────────────────────────────
// row → record mapping helper (shared by listPendingAlerts +
// findRecentDedupMatch)
// ──────────────────────────────────────────────────────────────────────

function mapRowToRecord(r: Record<string, unknown>): TgAlertAckRecord {
  return {
    id: Number(r["id"]),
    posted_at:
      r["posted_at"] instanceof Date
        ? r["posted_at"].toISOString()
        : String(r["posted_at"]),
    alert_id: String(r["alert_id"]),
    topic: String(r["topic"]),
    severity: r["severity"] as TgAlertSeverity,
    summary: (r["summary"] as string | null) ?? null,
    ack_at:
      r["ack_at"] instanceof Date
        ? r["ack_at"].toISOString()
        : ((r["ack_at"] as string | null) ?? null),
    ack_by_tg_user_id:
      r["ack_by_tg_user_id"] == null ? null : Number(r["ack_by_tg_user_id"]),
    ack_action: r["ack_action"] as TgAlertAckAction | null,
    escalated_at:
      r["escalated_at"] instanceof Date
        ? r["escalated_at"].toISOString()
        : ((r["escalated_at"] as string | null) ?? null),
    repeated_at:
      r["repeated_at"] instanceof Date
        ? r["repeated_at"].toISOString()
        : ((r["repeated_at"] as string | null) ?? null),
    sentry_warned_at:
      r["sentry_warned_at"] instanceof Date
        ? r["sentry_warned_at"].toISOString()
        : ((r["sentry_warned_at"] as string | null) ?? null),
    snoozed_until_at:
      r["snoozed_until_at"] instanceof Date
        ? r["snoozed_until_at"].toISOString()
        : ((r["snoozed_until_at"] as string | null) ?? null),
    metadata: (r["metadata"] as Record<string, unknown> | null) ?? {},
    dedup_signature: (r["dedup_signature"] as string | null) ?? null,
    occurrence_count:
      r["occurrence_count"] == null ? 1 : Number(r["occurrence_count"]),
    last_occurrence_at:
      r["last_occurrence_at"] instanceof Date
        ? r["last_occurrence_at"].toISOString()
        : ((r["last_occurrence_at"] as string | null) ?? null),
    telegram_chat_id:
      r["telegram_chat_id"] == null ? null : Number(r["telegram_chat_id"]),
    telegram_message_id:
      r["telegram_message_id"] == null
        ? null
        : Number(r["telegram_message_id"]),
  };
}
