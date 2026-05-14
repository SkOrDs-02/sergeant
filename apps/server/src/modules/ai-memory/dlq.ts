/**
 * AI memory ingest **dead-letter queue** (DLQ) — persisting permanently-failed
 * `ai-memory-ingest` jobs у SQL для систематичного replay-у після fix-у
 * downstream-bug-у.
 *
 * Architecture:
 *
 *   processMemoryIngestJob (ingestQueue.ts)
 *     ├─ non-retryable err (4xx, invalid payload) → recordIngestDlq()
 *     └─ retryable err exhausted attempts (BullMQ failed-event) → recordIngestDlq()
 *
 *   Operator triggers replay:
 *     POST /api/internal/ai-memory-dlq/replay
 *     pnpm replay:dlq --source=finyk --since='2026-05-13' --execute
 *
 *   Replay flow:
 *     SELECT … FROM ai_memory_ingest_failed WHERE replayed_at IS NULL
 *       → enqueueMemoryIngest(payload_json)
 *       → UPDATE replayed_at = NOW(), replay_count++
 *
 * Чому SQL-DLQ, а не лише BullMQ `failed`-state:
 *   1. BullMQ `removeOnFail.age = 14d` — після 14д row зникає, replay
 *      після пізнішого triage-у недосяжний.
 *   2. SQL дає filter+sort по `source`/`user_id`/`error`/`last_attempt_at`
 *      без custom Redis-script-у.
 *   3. Replay через `enqueueMemoryIngest()` повторно проходить gating
 *      (per-source kill-switch, soft/hard budget), так само як live-flow.
 *
 * Rate-limited Sentry: DLQ-write шле warning-alert через `Sentry.captureMessage`,
 * але не частіше 1× на хвилину (per process). Anti-spam: при Voyage incident-і
 * 100s job-ів падають у DLQ за секунди — без rate-ліміту Sentry quota
 * вибух.
 */

import { query } from "../../db.js";
import { logger, serializeError } from "../../obs/logger.js";
import { Sentry } from "../../sentry.js";
import type { MemoryIngestPayload } from "./ingestQueue.js";

/**
 * Single-row представлення DLQ-record-у. Дзеркалить migration 066 schema,
 * але `id` coerced у `number` per Hard Rule #1 (pg повертає bigint як string).
 */
export interface DlqRow {
  id: number;
  userId: string;
  source: string;
  sourceRef: string | null;
  payloadJson: MemoryIngestPayload;
  errorMsg: string;
  attempts: number;
  lastAttemptAt: Date;
  replayedAt: Date | null;
  replayCount: number;
}

/**
 * Rate-limited Sentry warning state. **Per-process**, in-memory — у multi-replica
 * deployment кожна репліка тримає свій лічильник, тож з 3-х реплік за хвилину
 * максимум 3 алерти, що прийнятно (на 100s падінь — це 3 алерти, не 100).
 * Redis-side rate-limit ускладнив би модуль і додав би залежність.
 */
const sentryRateLimitState = {
  lastAlertAtMs: 0,
  /** Window у мс — 60_000 = 1 хвилина (per spec). */
  windowMs: 60_000,
  /** Counter для тестів: скільки alert-ів спробовано firе-нути у поточному вікні. */
  suppressedCount: 0,
};

/**
 * Тільки для тестів: скидає rate-limit state, щоб `vi.resetModules()` не
 * потрібен (state живе у module-level closure).
 */
export function __resetDlqRateLimit(): void {
  sentryRateLimitState.lastAlertAtMs = 0;
  sentryRateLimitState.suppressedCount = 0;
}

/**
 * Тільки для тестів: read-only snapshot rate-limiter-стану.
 */
export function __getDlqRateLimitState(): {
  lastAlertAtMs: number;
  suppressedCount: number;
} {
  return {
    lastAlertAtMs: sentryRateLimitState.lastAlertAtMs,
    suppressedCount: sentryRateLimitState.suppressedCount,
  };
}

/**
 * INSERT-ить permanently-failed job у `ai_memory_ingest_failed`. Idempotent:
 * якщо вже є active (NOT replayed) row для тієї ж `(user_id, source, source_ref)`
 * — `ON CONFLICT` bump-ить `attempts`/`last_attempt_at`/`error_msg`, не плодить
 * дублі (partial-UNIQUE index на migration 066).
 *
 * Caller (`processMemoryIngestJob`) очікує, що ця функція ніколи не throw-ить —
 * DB-incident на DLQ-write блокувати worker-loop неприпустимо. Усе ловимо
 * у try/catch, log + ковтаємо.
 */
export async function recordIngestDlq(input: {
  payload: MemoryIngestPayload;
  errorMsg: string;
  attempts: number;
  now?: Date;
}): Promise<void> {
  const { payload, errorMsg, attempts } = input;
  const now = input.now ?? new Date();

  try {
    if (payload.sourceRef === null) {
      // Без source_ref (chat ingest) — пишемо raw INSERT, бо partial-UNIQUE
      // index не покриває NULL source_ref. Може створитися "дубль" якщо
      // exact same chat fails двічі — це ОК, бо chat-content typically
      // різний per payload (на відміну від idempotent webhook).
      await query(
        `INSERT INTO ai_memory_ingest_failed
           (user_id, source, source_ref, payload_json, error_msg, attempts, last_attempt_at)
         VALUES ($1, $2, NULL, $3::jsonb, $4, $5, $6)`,
        [
          payload.userId,
          payload.source,
          JSON.stringify(payload),
          errorMsg,
          attempts,
          now,
        ],
        { op: "ai_memory_dlq_insert" },
      );
    } else {
      await query(
        `INSERT INTO ai_memory_ingest_failed
           (user_id, source, source_ref, payload_json, error_msg, attempts, last_attempt_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         ON CONFLICT (user_id, source, source_ref)
         WHERE source_ref IS NOT NULL AND replayed_at IS NULL
         DO UPDATE SET
           attempts        = EXCLUDED.attempts,
           error_msg       = EXCLUDED.error_msg,
           last_attempt_at = EXCLUDED.last_attempt_at`,
        [
          payload.userId,
          payload.source,
          payload.sourceRef,
          JSON.stringify(payload),
          errorMsg,
          attempts,
          now,
        ],
        { op: "ai_memory_dlq_insert" },
      );
    }
  } catch (err) {
    logger.error({
      msg: "ai_memory_ingest_dlq_insert_failed",
      source: payload.source,
      userId: payload.userId,
      sourceRef: payload.sourceRef,
      err: serializeError(err, { includeStack: false }),
    });
    // Не re-throw — DB-incident на DLQ-write не має блокувати worker-loop.
    return;
  }

  // Rate-limited Sentry warning. У worst-case (Voyage incident) 100s
  // jobs падають за секунди — без ліміту палимо Sentry-quota.
  maybeCaptureDlqSentry({
    source: payload.source,
    userId: payload.userId,
    errorMsg,
    attempts,
    now: now.getTime(),
  });
}

function maybeCaptureDlqSentry(input: {
  source: string;
  userId: string;
  errorMsg: string;
  attempts: number;
  now: number;
}): void {
  const sinceLastMs = input.now - sentryRateLimitState.lastAlertAtMs;
  if (
    sentryRateLimitState.lastAlertAtMs !== 0 &&
    sinceLastMs < sentryRateLimitState.windowMs
  ) {
    sentryRateLimitState.suppressedCount++;
    return;
  }

  const summary =
    `AI memory ingest DLQ insert (source=${input.source}, attempts=${input.attempts}). ` +
    `Suppressed since last alert: ${sentryRateLimitState.suppressedCount}.`;
  try {
    Sentry.captureMessage(summary, {
      level: "warning",
      tags: {
        op: "ai_memory_ingest_dlq",
        source: input.source,
        // `error_signature` — routing-ключ для n8n alert-dedup (PR-15 #2535).
        error_signature: "ai-memory-ingest-dlq",
      },
      extra: {
        user_id: input.userId,
        attempts: input.attempts,
        error_msg: input.errorMsg,
        suppressed_count: sentryRateLimitState.suppressedCount,
      },
    });
  } catch (err) {
    logger.warn({
      msg: "ai_memory_ingest_dlq_sentry_capture_failed",
      err: serializeError(err, { includeStack: false }),
    });
  }

  sentryRateLimitState.lastAlertAtMs = input.now;
  sentryRateLimitState.suppressedCount = 0;
}

/**
 * Маркує DLQ-row як replayed (bump `replay_count`). Викликається після
 * успішного `enqueueMemoryIngest()` у replay-flow.
 *
 * Не throw-ить — replay best-effort, DB-incident після успішного enqueue
 * логуємо, але не падаємо (job уже у Redis, write-loss audit-trail acceptable).
 */
export async function markDlqRowReplayed(id: number): Promise<void> {
  try {
    await query(
      `UPDATE ai_memory_ingest_failed
         SET replayed_at  = NOW(),
             replay_count = replay_count + 1
       WHERE id = $1`,
      [id],
      { op: "ai_memory_dlq_mark_replayed" },
    );
  } catch (err) {
    logger.warn({
      msg: "ai_memory_ingest_dlq_mark_replayed_failed",
      id,
      err: serializeError(err, { includeStack: false }),
    });
  }
}

export interface ListDlqRowsOptions {
  source?: string;
  since?: Date;
  ids?: number[];
  limit: number;
  includeReplayed?: boolean;
}

/**
 * SELECT-ить DLQ-rows під replay. За замовчуванням повертає лише active
 * (`replayed_at IS NULL`) failures — operator має explicit `includeReplayed`
 * щоб бачити вже replay-нуті rows у audit-mode.
 *
 * Coerce `id`/`attempts`/`replay_count` з `bigint`/`numeric`-string у
 * `number` per Hard Rule #1.
 */
export async function listDlqRows(opts: ListDlqRowsOptions): Promise<DlqRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts.ids && opts.ids.length > 0) {
    values.push(opts.ids);
    where.push(`id = ANY($${values.length}::bigint[])`);
  } else {
    if (!opts.includeReplayed) {
      where.push(`replayed_at IS NULL`);
    }
    if (opts.source) {
      values.push(opts.source);
      where.push(`source = $${values.length}`);
    }
    if (opts.since) {
      values.push(opts.since);
      where.push(`last_attempt_at >= $${values.length}`);
    }
  }

  values.push(opts.limit);
  const limitParam = `$${values.length}`;
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  // eslint-disable-next-line no-restricted-syntax -- `whereSql`/`limitParam` побудовані з constant SQL fragments + $N-placeholders; user input у `values` flows тільки через bind-params.
  const result = await query<{
    id: string;
    user_id: string;
    source: string;
    source_ref: string | null;
    payload_json: MemoryIngestPayload;
    error_msg: string;
    attempts: number;
    last_attempt_at: Date;
    replayed_at: Date | null;
    replay_count: number;
  }>(
    `SELECT id, user_id, source, source_ref, payload_json, error_msg, attempts,
            last_attempt_at, replayed_at, replay_count
       FROM ai_memory_ingest_failed
       ${whereSql}
       ORDER BY last_attempt_at DESC
       LIMIT ${limitParam}`,
    values,
    { op: "ai_memory_dlq_list" },
  );

  return result.rows.map((r) => ({
    id: Number(r.id),
    userId: r.user_id,
    source: r.source,
    sourceRef: r.source_ref,
    payloadJson: r.payload_json,
    errorMsg: r.error_msg,
    attempts: Number(r.attempts),
    lastAttemptAt: r.last_attempt_at,
    replayedAt: r.replayed_at,
    replayCount: Number(r.replay_count),
  }));
}
