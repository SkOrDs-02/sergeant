/**
 * Reminder store + helpers для PR-C1b.
 *
 * Контракт із міграцією 055 (`openclaw_reminders`):
 *
 *   id BIGSERIAL PK
 *   founder_user_id TEXT (FK user.id ON DELETE CASCADE)
 *   persona TEXT NOT NULL DEFAULT 'cofounder'
 *   topic TEXT NULL
 *   reminder_text TEXT NOT NULL
 *   due_at TIMESTAMPTZ NOT NULL
 *   status TEXT CHECK IN ('pending','sent','cancelled','failed')
 *   source_invocation_id BIGINT NULL (FK openclaw_invocations.id ON DELETE SET NULL)
 *   channel TEXT CHECK IN ('telegram','whatsapp') DEFAULT 'telegram'
 *   attempts INT NOT NULL DEFAULT 0
 *   last_attempted_at TIMESTAMPTZ NULL
 *   sent_at TIMESTAMPTZ NULL
 *   cancelled_at TIMESTAMPTZ NULL
 *   metadata JSONB NOT NULL DEFAULT '{}'
 *   created_at/updated_at TIMESTAMPTZ
 *
 * Усі id-значення приходять з pg як string (BIGINT) — Hard Rule #1 вимагає
 * coerce-ити їх до `number` перед серіалізацією у JSON. Robi-мо це у
 * `mapRow()` (single source of truth).
 *
 * FSM:
 *   pending  → sent       (cron-poller успішно надіслав)
 *   pending  → cancelled  (founder скасував)
 *   pending  → failed     (attempts >= max_attempts)
 *
 * Cron-poller (див. `reminder-poller.ts`) використовує
 * `claimDueReminders()` для atomic-claim з row-locking-ом (`FOR UPDATE
 * SKIP LOCKED`) — без цього два poll-instance-и могли б подвоїти доставку.
 */

import type { Pool, PoolClient } from "pg";

// ─── Types ─────────────────────────────────────────────────────────────

export type ReminderStatus = "pending" | "sent" | "cancelled" | "failed";
export type ReminderChannel = "telegram" | "whatsapp";

export interface ReminderRecord {
  id: number;
  founderUserId: string;
  persona: string;
  topic: string | null;
  reminderText: string;
  dueAt: string;
  status: ReminderStatus;
  sourceInvocationId: number | null;
  channel: ReminderChannel;
  attempts: number;
  lastAttemptedAt: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface RawReminderRow {
  id: string;
  founder_user_id: string;
  persona: string;
  topic: string | null;
  reminder_text: string;
  due_at: Date | string;
  status: ReminderStatus;
  source_invocation_id: string | null;
  channel: ReminderChannel;
  attempts: number;
  last_attempted_at: Date | string | null;
  sent_at: Date | string | null;
  cancelled_at: Date | string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: RawReminderRow): ReminderRecord {
  // Hard Rule #1: BIGINT → number у serializer. Reminder IDs lez <2^53.
  return {
    id: Number(row.id),
    founderUserId: row.founder_user_id,
    persona: row.persona,
    topic: row.topic,
    reminderText: row.reminder_text,
    dueAt: toIso(row.due_at) ?? "",
    status: row.status,
    sourceInvocationId:
      row.source_invocation_id === null
        ? null
        : Number(row.source_invocation_id),
    channel: row.channel,
    attempts: row.attempts,
    lastAttemptedAt: toIso(row.last_attempted_at),
    sentAt: toIso(row.sent_at),
    cancelledAt: toIso(row.cancelled_at),
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
}

// ─── set_reminder ──────────────────────────────────────────────────────

export interface SetReminderInput {
  founderUserId: string;
  reminderText: string;
  /** ISO-8601 with offset (`2026-05-15T09:00+03:00`). */
  dueAtIso: string;
  persona?: string | undefined;
  topic?: string | null | undefined;
  channel?: ReminderChannel | undefined;
  sourceInvocationId?: number | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export class ReminderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReminderValidationError";
  }
}

/**
 * Створює row у `openclaw_reminders` зі status='pending'.
 * Парс `dueAtIso` через `Date` ctor; rejects NaN.
 *
 * Повертає створену row у JSON-serializable формі.
 */
export async function setReminder(
  pool: Pool,
  input: SetReminderInput,
): Promise<ReminderRecord> {
  const dueAt = new Date(input.dueAtIso);
  if (Number.isNaN(dueAt.getTime())) {
    throw new ReminderValidationError(
      `dueAtIso is not a valid ISO-8601 timestamp: ${input.dueAtIso}`,
    );
  }
  const persona = (input.persona ?? "cofounder").trim() || "cofounder";
  const channel: ReminderChannel = input.channel ?? "telegram";

  const result = await pool.query<RawReminderRow>(
    `INSERT INTO openclaw_reminders (
       founder_user_id, persona, topic, reminder_text,
       due_at, source_invocation_id, channel, metadata
     )
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8::jsonb)
     RETURNING *`,
    [
      input.founderUserId,
      persona,
      input.topic ?? null,
      input.reminderText,
      dueAt.toISOString(),
      input.sourceInvocationId ?? null,
      channel,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("setReminder: INSERT RETURNING returned no rows");
  }
  return mapRow(row);
}

// ─── list-due / claim ──────────────────────────────────────────────────

export interface ListDueOptions {
  /** Hard cap на batch-size. */
  limit?: number | undefined;
  /** Override часу для тестів; default — `NOW()` у БД. */
  nowIso?: string | undefined;
}

/**
 * Read-only список pending reminder-ів, чий `due_at <= now`. НЕ змінює стан;
 * caller-у бажано використати `claimDueReminders()` для atomic-claim
 * (cron-poller). Цей метод корисний для UI/debug (`/reminders/list-due`).
 */
export async function listDueReminders(
  pool: Pool,
  options: ListDueOptions = {},
): Promise<ReminderRecord[]> {
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const now = options.nowIso ?? new Date().toISOString();
  const result = await pool.query<RawReminderRow>(
    `SELECT *
       FROM openclaw_reminders
      WHERE status = 'pending'
        AND due_at <= $1::timestamptz
      ORDER BY due_at ASC
      LIMIT $2`,
    [now, limit],
  );
  return result.rows.map(mapRow);
}

/**
 * Atomic-claim due reminder-ів для cron-poller-а. Використовує
 * `FOR UPDATE SKIP LOCKED` всередині транзакції, щоб два конкурентні
 * poller-instance-и не подвоїли доставку:
 *
 *   BEGIN
 *     SELECT id FROM openclaw_reminders
 *      WHERE status='pending' AND due_at <= now
 *      ORDER BY due_at ASC LIMIT N
 *      FOR UPDATE SKIP LOCKED;
 *     UPDATE openclaw_reminders
 *        SET attempts = attempts + 1,
 *            last_attempted_at = NOW()
 *      WHERE id = ANY($ids);
 *   COMMIT
 *
 * Caller (poller) потім робить delivery + викликає `markSent` / `markFailed`.
 */
export async function claimDueReminders(
  pool: Pool,
  options: ListDueOptions = {},
): Promise<ReminderRecord[]> {
  const limit = Math.max(1, Math.min(200, options.limit ?? 20));
  const now = options.nowIso ?? new Date().toISOString();

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{ id: string }>(
      `SELECT id
         FROM openclaw_reminders
        WHERE status = 'pending'
          AND due_at <= $1::timestamptz
        ORDER BY due_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [now, limit],
    );
    if (selected.rows.length === 0) {
      await client.query("COMMIT");
      return [];
    }
    const ids = selected.rows.map((r) => r.id);
    const updated = await client.query<RawReminderRow>(
      `UPDATE openclaw_reminders
          SET attempts          = attempts + 1,
              last_attempted_at = NOW(),
              updated_at        = NOW()
        WHERE id = ANY($1::bigint[])
        RETURNING *`,
      [ids],
    );
    await client.query("COMMIT");
    return updated.rows.map(mapRow);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ─── State transitions ────────────────────────────────────────────────

export async function markReminderSent(
  pool: Pool,
  reminderId: number,
): Promise<ReminderRecord | null> {
  const result = await pool.query<RawReminderRow>(
    `UPDATE openclaw_reminders
        SET status     = 'sent',
            sent_at    = NOW(),
            updated_at = NOW()
      WHERE id = $1
        AND status = 'pending'
      RETURNING *`,
    [reminderId],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function markReminderFailed(
  pool: Pool,
  reminderId: number,
  reason?: string,
): Promise<ReminderRecord | null> {
  const result = await pool.query<RawReminderRow>(
    `UPDATE openclaw_reminders
        SET status     = 'failed',
            metadata   = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('failure_reason', $2::text),
            updated_at = NOW()
      WHERE id = $1
        AND status = 'pending'
      RETURNING *`,
    [reminderId, reason ?? "unknown"],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function markReminderCancelled(
  pool: Pool,
  reminderId: number,
  founderUserId: string,
): Promise<ReminderRecord | null> {
  const result = await pool.query<RawReminderRow>(
    `UPDATE openclaw_reminders
        SET status       = 'cancelled',
            cancelled_at = NOW(),
            updated_at   = NOW()
      WHERE id = $1
        AND founder_user_id = $2
        AND status = 'pending'
      RETURNING *`,
    [reminderId, founderUserId],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

// ─── Founder-scoped listing ───────────────────────────────────────────

export interface ListFounderRemindersOptions {
  founderUserId: string;
  statuses?: ReminderStatus[] | undefined;
  limit?: number | undefined;
}

export async function listFounderReminders(
  pool: Pool,
  options: ListFounderRemindersOptions,
): Promise<ReminderRecord[]> {
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const statuses =
    options.statuses && options.statuses.length > 0
      ? options.statuses
      : (["pending", "sent", "cancelled", "failed"] as const);
  const result = await pool.query<RawReminderRow>(
    `SELECT *
       FROM openclaw_reminders
      WHERE founder_user_id = $1
        AND status = ANY($2::text[])
      ORDER BY due_at DESC
      LIMIT $3`,
    [options.founderUserId, statuses, limit],
  );
  return result.rows.map(mapRow);
}
