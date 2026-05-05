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

  const limit = Math.max(1, Math.min(100, filters.limit ?? 50));
  params.push(limit);

  // eslint-disable-next-line no-restricted-syntax -- conditions[] is built from a fixed allow-list of literal SQL fragments; user input flows through $-params only.
  const result = await pool.query(
    `SELECT id, posted_at, alert_id, topic, severity, summary,
            ack_at, ack_by_tg_user_id, ack_action,
            escalated_at, metadata
       FROM tg_alert_acks
      WHERE ${conditions.join(" AND ")}
      ORDER BY posted_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return result.rows.map((r) => ({
    id: Number(r.id),
    posted_at:
      r.posted_at instanceof Date ? r.posted_at.toISOString() : r.posted_at,
    alert_id: String(r.alert_id),
    topic: String(r.topic),
    severity: r.severity as TgAlertSeverity,
    summary: r.summary,
    ack_at:
      r.ack_at instanceof Date ? r.ack_at.toISOString() : (r.ack_at ?? null),
    ack_by_tg_user_id:
      r.ack_by_tg_user_id == null ? null : Number(r.ack_by_tg_user_id),
    ack_action: r.ack_action as TgAlertAckAction | null,
    escalated_at:
      r.escalated_at instanceof Date
        ? r.escalated_at.toISOString()
        : (r.escalated_at ?? null),
    metadata: r.metadata ?? {},
  }));
}
