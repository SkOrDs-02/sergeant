/**
 * DB helpers for `tg_topic_archive` (migration 047). Backs
 * `read_telegram_topic_history` (ADR-0031 §5; OpenClaw roadmap Phase 3 /
 * Pain P8).
 *
 * Pure functions over a `pg.Pool`. No caching, no singletons. Same
 * pattern as `modules/alerts/store.ts` and `modules/openclaw/store.ts`.
 *
 * Lifecycle:
 *
 *   recordTopicMessage  — INSERT one row. Idempotent on `(topic, dedupe_key)`
 *                         when `dedupeKey` is non-null (n8n retry storm
 *                         no-ops). Returns `alreadyArchived=true` on
 *                         conflict so the caller can avoid double-logging.
 *   listTopicMessages   — SELECT newest-first with optional `since` /
 *                         `limit` filters. Drives the LLM tool
 *                         `read_telegram_topic_history` and any future
 *                         post-mortem queries.
 */

import type { Pool } from "pg";
import type { TgTopicArchiveRecord, TgTopicArchiveSource } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────
// recordTopicMessage
// ─────────────────────────────────────────────────────────────────────────

export interface RecordTopicMessageInput {
  topic: string;
  text: string;
  source: TgTopicArchiveSource;
  /**
   * Telegram message_id when known (post_to_topic returns it; alerts
   * usually do not surface it through n8n). Defaults to 0 — the value
   * is informational only, not used for dedup.
   */
  messageId?: number | null | undefined;
  /**
   * Stable retry-safe key. Pass `tg_alert_acks.alert_id` for `alert`
   * writes; pass NULL for `post_to_topic` (the partial UNIQUE index
   * treats NULLs as distinct so manual posts never collide).
   */
  dedupeKey?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  /** Override `sent_at` (test seam). Defaults to `NOW()`. */
  sentAt?: Date | undefined;
}

export interface RecordTopicMessageResult {
  /** id of the row we inserted, or of the pre-existing row on retry. */
  id: number;
  /** True when `(topic, dedupe_key)` already had a row (idempotent retry). */
  alreadyArchived: boolean;
}

/**
 * Inserts one row in `tg_topic_archive`. Idempotent for rows that supply
 * a `dedupeKey` — a second call with the same `(topic, dedupeKey)` is a
 * no-op and returns the existing row's id with `alreadyArchived=true`.
 * Rows without a `dedupeKey` always insert (NULLs are distinct under the
 * partial UNIQUE index — see migration 047 header).
 */
export async function recordTopicMessage(
  pool: Pool,
  input: RecordTopicMessageInput,
): Promise<RecordTopicMessageResult> {
  const dedupeKey = input.dedupeKey ?? null;
  const sentAtParam = input.sentAt ?? null;

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO tg_topic_archive
       (topic, message_id, text, source, dedupe_key, metadata, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, NOW()))
     ON CONFLICT (topic, dedupe_key) WHERE dedupe_key IS NOT NULL
       DO NOTHING
     RETURNING id`,
    [
      input.topic,
      input.messageId ?? 0,
      input.text,
      input.source,
      dedupeKey,
      JSON.stringify(input.metadata ?? {}),
      sentAtParam,
    ],
  );
  if (inserted.rowCount && inserted.rows[0]) {
    return { id: Number(inserted.rows[0].id), alreadyArchived: false };
  }

  // Conflict path — only reachable when `dedupeKey` was non-null. Fetch
  // the pre-existing row's id so the caller can log it. No race: the
  // partial unique index guarantees the row exists.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM tg_topic_archive
      WHERE topic = $1 AND dedupe_key = $2
      LIMIT 1`,
    [input.topic, dedupeKey],
  );
  return {
    id: Number(existing.rows[0]?.id ?? 0),
    alreadyArchived: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// listTopicMessages
// ─────────────────────────────────────────────────────────────────────────

export interface ListTopicMessagesFilters {
  topic: string;
  /** Lower-bound on `sent_at` (inclusive, ISO-8601). Optional. */
  sinceIso?: string | undefined;
  /** 1..100, default 20. */
  limit?: number | undefined;
}

/**
 * Returns archive rows newest-first, filtered by topic and optionally
 * `sinceIso`. Drives `read_telegram_topic_history`.
 *
 * Limit clamp matches the route-side Zod schema (1..100). Default 20 is
 * deliberately small — the LLM consumes these inline, and a 100-row
 * payload would blow the context budget for free-form DM.
 */
export async function listTopicMessages(
  pool: Pool,
  filters: ListTopicMessagesFilters,
): Promise<TgTopicArchiveRecord[]> {
  const conditions: string[] = ["topic = $1"];
  const params: unknown[] = [filters.topic];

  if (filters.sinceIso) {
    params.push(filters.sinceIso);
    conditions.push(`sent_at >= $${params.length}`);
  }

  const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
  params.push(limit);

  // eslint-disable-next-line no-restricted-syntax -- conditions[] is built from a fixed allow-list of literal SQL fragments; user input flows through $-params only.
  const result = await pool.query(
    `SELECT id, sent_at, topic, message_id, text, source, dedupe_key, metadata
       FROM tg_topic_archive
      WHERE ${conditions.join(" AND ")}
      ORDER BY sent_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return result.rows.map((r) => ({
    id: Number(r.id),
    sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : r.sent_at,
    topic: String(r.topic),
    messageId: Number(r.message_id ?? 0),
    text: String(r.text),
    source: r.source as TgTopicArchiveSource,
    dedupeKey: r.dedupe_key == null ? null : String(r.dedupe_key),
    metadata: r.metadata ?? {},
  }));
}
