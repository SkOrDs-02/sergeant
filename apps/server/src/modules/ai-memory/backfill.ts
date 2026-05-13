/**
 * AI memory backfill orchestrator (PR-21 follow-up).
 *
 * Контекст: PR-19 (#2605) активував `MONO_AI_MEMORY_INGEST_ENABLED` —
 * з того моменту нові finyk/chat/etc писалися у `ai_memories` через
 * BullMQ `ai-memory-ingest` queue. Старі повідомлення з `tg_topic_archive`
 * (alerts, persona posts) залишилися без embedding-у — `/recall`
 * semantic-пошук їх не бачить. Цей модуль обходить window архіву і
 * enqueue-ить chunk-ом, зберігаючи progress у
 * `ai_memory_backfill_state` (migration 063), щоб довгий run-можна було
 * pause-ити / resume-ити без дублікатів.
 *
 * Архітектура (chunked-API замість one-shot):
 *   1. CLI робить `startBackfill()` — INSERT row у `ai_memory_backfill_state`
 *      із dry_run-флагом і конфігом. Повертає `stateId`.
 *   2. Для dry-run — рахуємо total_candidates + estimated_cost, оновлюємо
 *      status='dry_run_completed', return.
 *   3. Для execute — CLI у циклі викликає `runBackfillBatch(stateId)`
 *      доки `hasMore=false`. Кожен виклик: SELECT `batch_size` rows з
 *      `tg_topic_archive` WHERE id > last_processed_id, enqueue через
 *      `enqueueMemoryIngest`, UPDATE counters + cursor.
 *   4. `finalizeBackfill()` — set completed_at + status, emit Sentry
 *      breadcrumb.
 *
 * Чому chunked, а не single-blocking endpoint:
 *   * 90-day window може мати десятки тисяч rows; single call блокував би
 *     HTTP request на хвилини.
 *   * Pause / resume — CLI може Ctrl+C і потім перезапустити з тим самим
 *     `--state-id`.
 *   * Operator-friendly progress reporting.
 *
 * Cost model:
 *   * Voyage `voyage-3.5-lite` — $0.02 per 1M input tokens (April 2026).
 *   * Rough estimate: 1 token ≈ 4 chars (English/Ukrainian mix).
 *   * Formula: `usd = sum(content_len) / 4 / 1_000_000 * 0.02`.
 *   * Перед execute порівнюємо проти `VOYAGE_DAILY_BUDGET_USD_SOFT`
 *     (default `1`). Якщо estimate > budget → abort із status='aborted_budget',
 *     CLI друкує hint підняти budget або зменшити `--days`.
 */

import type { Pool } from "pg";

import { env } from "../../env.js";
import { logger, serializeError } from "../../obs/logger.js";
import { Sentry } from "../../sentry.js";
import { enqueueMemoryIngest } from "./ingestQueue.js";
import type { MemorySource } from "./types.js";

/** Voyage `voyage-3.5-lite` price per 1M input tokens (April 2026). */
const VOYAGE_USD_PER_1M_TOKENS = 0.02;

/** Rough chars→tokens ratio для UA/EN mix; матчиться з `weekly-digest.ts` cost-estimate. */
const CHARS_PER_TOKEN = 4;

/** Operator-visible статуси у `ai_memory_backfill_state.status`. */
export type BackfillStatus =
  | "running"
  | "completed"
  | "aborted_budget"
  | "aborted_error"
  | "dry_run_completed";

/** Source-режим. `cofounder` — ADR-0031 §3 strict isolation (default). */
export type BackfillSourceMode = "cofounder" | "all";

export interface StartBackfillInput {
  founderUserId: string;
  daysWindow: number;
  sourceMode: BackfillSourceMode;
  batchSize: number;
  dryRun: boolean;
  /** Optional topic-filter (whitelist). За замовчуванням — усі топіки. */
  topicFilter?: readonly string[];
}

export interface StartBackfillOutput {
  stateId: number;
  totalCandidates: number;
  estimatedCostUsd: number;
  status: BackfillStatus;
  budgetExceeded: boolean;
  voyageBudgetSoftUsd: number;
}

export interface BackfillBatchOutput {
  stateId: number;
  processedInBatch: number;
  enqueuedInBatch: number;
  skippedDedupInBatch: number;
  cumulativeProcessed: number;
  cumulativeEnqueued: number;
  hasMore: boolean;
  lastProcessedId: number;
}

export interface BackfillBatchInput {
  stateId: number;
  founderUserId: string;
}

/**
 * Estimate Voyage USD cost from sum of content lengths.
 * Pure function — exported для unit-test-ів.
 */
export function estimateVoyageCostUsd(totalContentChars: number): number {
  if (totalContentChars <= 0) return 0;
  const tokens = totalContentChars / CHARS_PER_TOKEN;
  return (tokens / 1_000_000) * VOYAGE_USD_PER_1M_TOKENS;
}

/**
 * Build SQL предикат для архівних rows: window-window + (опційний)
 * topic-allowlist + NOT EXISTS у `ai_memories` (dedup по source_ref).
 *
 * Exported для тестів — переконатися, що predicate не зачіпає rows, які
 * уже embedded.
 */
export function buildCandidatesPredicate(opts: {
  daysWindow: number;
  topicFilter?: readonly string[];
}): {
  whereClause: string;
  params: unknown[];
} {
  const params: unknown[] = [];
  // p1: days
  params.push(opts.daysWindow);
  let where = `sent_at > NOW() - ($1::int * INTERVAL '1 day') AND text <> ''`;
  if (opts.topicFilter && opts.topicFilter.length > 0) {
    params.push(opts.topicFilter as unknown);
    where += ` AND topic = ANY($${params.length}::text[])`;
  }
  // NOT EXISTS у ai_memories — dedup. source_ref-формат `tg_archive:<id>`.
  where += ` AND NOT EXISTS (
    SELECT 1 FROM ai_memories m
    WHERE m.source = 'cofounder'
      AND m.source_ref = 'tg_archive:' || tg_topic_archive.id::text
  )`;
  return { whereClause: where, params };
}

/**
 * Format archive row → memory payload. Exported для unit-tests.
 *
 * Source у memory — `cofounder` (ADR-0031 §3 strict isolation), source_ref
 * — `tg_archive:<row_id>` для dedup.
 */
export function buildIngestPayload(
  row: {
    id: number;
    text: string;
    topic: string;
    source: string;
    sent_at: Date;
  },
  founderUserId: string,
): {
  userId: string;
  source: MemorySource;
  sourceRef: string;
  content: string;
  metadata: Record<string, unknown>;
} {
  return {
    userId: founderUserId,
    source: "cofounder",
    sourceRef: `tg_archive:${row.id}`,
    content: row.text,
    metadata: {
      backfill: true,
      tg_topic_archive_id: row.id,
      tg_archive_source: row.source,
      tg_topic: row.topic,
      sent_at: row.sent_at.toISOString(),
    },
  };
}

/**
 * Insert state row + compute total_candidates / estimated_cost. Для
 * dry-run-у — set status='dry_run_completed' і return. Для execute —
 * status='running'.
 */
export async function startBackfill(
  pool: Pool,
  input: StartBackfillInput,
): Promise<StartBackfillOutput> {
  if (input.daysWindow <= 0) {
    throw new Error("daysWindow must be > 0");
  }
  if (input.batchSize <= 0 || input.batchSize > 1000) {
    throw new Error("batchSize must be in [1..1000]");
  }
  if (input.sourceMode !== "cofounder" && input.sourceMode !== "all") {
    throw new Error(`unsupported sourceMode: ${input.sourceMode}`);
  }
  if (input.sourceMode === "all") {
    throw new Error(
      "sourceMode='all' not yet implemented — ADR-0031 §3 strict isolation requires cofounder-only for now",
    );
  }

  const predicate = buildCandidatesPredicate({
    daysWindow: input.daysWindow,
    ...(input.topicFilter !== undefined
      ? { topicFilter: input.topicFilter }
      : {}),
  });

  // Count + sum чарів за один pass (single window-scan).
  const countSql = `
    SELECT COUNT(*)::int AS total, COALESCE(SUM(LENGTH(text)), 0)::bigint AS total_chars
    FROM tg_topic_archive
    WHERE ${predicate.whereClause}
  `;
  const countRes = await pool.query<{ total: number; total_chars: string }>(
    countSql,
    predicate.params,
  );
  const total = countRes.rows[0]?.total ?? 0;
  // pg повертає bigint як string (Hard Rule #1).
  const totalChars = Number(countRes.rows[0]?.total_chars ?? 0);
  const estimatedCostUsd = estimateVoyageCostUsd(totalChars);

  const voyageBudgetSoft = env.VOYAGE_DAILY_BUDGET_USD_SOFT;
  const budgetExceeded =
    voyageBudgetSoft > 0 && estimatedCostUsd > voyageBudgetSoft;

  // Status логіка:
  //   dry-run → одразу dry_run_completed.
  //   execute + budgetExceeded → aborted_budget (CLI потім підказує).
  //   execute + ok → running.
  let status: BackfillStatus;
  if (input.dryRun) status = "dry_run_completed";
  else if (budgetExceeded) status = "aborted_budget";
  else status = "running";

  const completedAt =
    status === "dry_run_completed" || status === "aborted_budget"
      ? "NOW()"
      : "NULL";

  const insertSql = `
    INSERT INTO ai_memory_backfill_state (
      founder_user_id, days_window, source_mode, batch_size,
      dry_run, total_candidates, estimated_cost_usd, status,
      completed_at, metadata
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7::numeric, $8,
      ${completedAt}, $9::jsonb
    )
    RETURNING id
  `;
  const meta = {
    topic_filter: input.topicFilter ?? null,
    voyage_quota_check: {
      soft_usd: voyageBudgetSoft,
      exceeded: budgetExceeded,
    },
    total_chars: totalChars,
  };
  const insertRes = await pool.query<{ id: number }>(insertSql, [
    input.founderUserId,
    input.daysWindow,
    input.sourceMode,
    input.batchSize,
    input.dryRun,
    total,
    estimatedCostUsd.toFixed(4),
    status,
    JSON.stringify(meta),
  ]);
  const stateId = insertRes.rows[0]?.id;
  if (stateId == null) {
    throw new Error("startBackfill: INSERT did not return id");
  }

  logger.info({
    msg: "ai_memory_backfill_started",
    stateId,
    founderUserId: input.founderUserId,
    daysWindow: input.daysWindow,
    sourceMode: input.sourceMode,
    batchSize: input.batchSize,
    dryRun: input.dryRun,
    totalCandidates: total,
    estimatedCostUsd,
    budgetExceeded,
    status,
  });

  if (status === "aborted_budget") {
    Sentry.addBreadcrumb({
      category: "ai-memory.backfill",
      level: "warning",
      message:
        "Backfill aborted — estimated cost exceeds VOYAGE_DAILY_BUDGET_USD_SOFT",
      data: {
        stateId,
        estimatedCostUsd,
        voyageBudgetSoftUsd: voyageBudgetSoft,
      },
    });
  }

  return {
    stateId,
    totalCandidates: total,
    estimatedCostUsd,
    status,
    budgetExceeded,
    voyageBudgetSoftUsd: voyageBudgetSoft,
  };
}

/**
 * Process one batch: SELECT next chunk after cursor → enqueue → UPDATE
 * state row. Idempotent on partial failure: state.last_processed_id
 * bump-иться тільки після успішного enqueue (BullMQ-jobId-dedup
 * захищає від double-enqueue, якщо CLI ретраїть той самий batch).
 *
 * Не throw-ить на per-row помилку enqueue-у — `enqueueMemoryIngest`
 * сам логує і inc-ить failure metric. Throw-ить лише на DB-failure.
 */
export async function runBackfillBatch(
  pool: Pool,
  input: BackfillBatchInput,
): Promise<BackfillBatchOutput> {
  // Load state row.
  const stateRes = await pool.query<{
    id: number;
    days_window: number;
    batch_size: number;
    last_processed_id: string; // bigint as string
    processed_count: number;
    enqueued_count: number;
    skipped_dedup_count: number;
    dry_run: boolean;
    status: BackfillStatus;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, days_window, batch_size, last_processed_id, processed_count,
            enqueued_count, skipped_dedup_count, dry_run, status, metadata
     FROM ai_memory_backfill_state
     WHERE id = $1 AND founder_user_id = $2`,
    [input.stateId, input.founderUserId],
  );
  const state = stateRes.rows[0];
  if (!state) {
    throw new Error(`runBackfillBatch: state row ${input.stateId} not found`);
  }
  if (state.status !== "running") {
    throw new Error(
      `runBackfillBatch: state ${input.stateId} status=${state.status}, expected 'running'`,
    );
  }

  const topicFilterRaw = (state.metadata as { topic_filter?: unknown })
    .topic_filter;
  const topicFilter = Array.isArray(topicFilterRaw)
    ? (topicFilterRaw as string[])
    : undefined;
  const predicate = buildCandidatesPredicate({
    daysWindow: state.days_window,
    ...(topicFilter !== undefined ? { topicFilter } : {}),
  });

  // Append cursor: `id > last_processed_id`. ORDER BY id для stable
  // forward-scan.
  const cursor = Number(state.last_processed_id);
  const limit = state.batch_size;
  const cursorParamIdx = predicate.params.length + 1;
  const limitParamIdx = cursorParamIdx + 1;
  const selectSql = `
    SELECT id, text, topic, source, sent_at
    FROM tg_topic_archive
    WHERE ${predicate.whereClause}
      AND id > $${cursorParamIdx}::bigint
    ORDER BY id ASC
    LIMIT $${limitParamIdx}::int
  `;
  const rowsRes = await pool.query<{
    id: string; // bigint as string
    text: string;
    topic: string;
    source: string;
    sent_at: Date;
  }>(selectSql, [...predicate.params, cursor, limit]);

  let enqueued = 0;
  let skippedDedup = 0;
  let maxId = cursor;

  for (const row of rowsRes.rows) {
    const id = Number(row.id);
    if (id > maxId) maxId = id;
    if (!row.text || row.text.trim().length === 0) {
      skippedDedup += 1;
      continue;
    }
    const payload = buildIngestPayload(
      {
        id,
        text: row.text,
        topic: row.topic,
        source: row.source,
        sent_at: row.sent_at,
      },
      input.founderUserId,
    );
    try {
      await enqueueMemoryIngest(payload);
      enqueued += 1;
    } catch (err) {
      // enqueueMemoryIngest вже логує + inc-ить failure metric і
      // повертає void; throw тут означало б що Redis Queue.add впав із
      // вийнятком, що не злапали внутрішнім try/catch. Не падаємо
      // backfill-у через одну row — рахуємо як skipped і їдемо далі.
      logger.warn({
        msg: "ai_memory_backfill_enqueue_throw",
        stateId: input.stateId,
        rowId: id,
        err: serializeError(err, { includeStack: false }),
      });
      skippedDedup += 1;
    }
  }

  const processedInBatch = rowsRes.rows.length;
  const cumulativeProcessed = state.processed_count + processedInBatch;
  const cumulativeEnqueued = state.enqueued_count + enqueued;
  const cumulativeSkipped = state.skipped_dedup_count + skippedDedup;

  // Bump cursor + counters. Якщо batch був порожнім, last_processed_id
  // лишається попереднім, але hasMore = false.
  await pool.query(
    `UPDATE ai_memory_backfill_state
       SET last_processed_id = $1::bigint,
           processed_count = $2,
           enqueued_count = $3,
           skipped_dedup_count = $4
     WHERE id = $5`,
    [
      maxId,
      cumulativeProcessed,
      cumulativeEnqueued,
      cumulativeSkipped,
      input.stateId,
    ],
  );

  const hasMore = processedInBatch === limit;

  // Operator-visible progress log — раз на batch (CLI робить агрегацію
  // на кожні 100 batch-ів окремо).
  logger.info({
    msg: "ai_memory_backfill_batch_done",
    stateId: input.stateId,
    processedInBatch,
    enqueuedInBatch: enqueued,
    skippedDedupInBatch: skippedDedup,
    cumulativeProcessed,
    cumulativeEnqueued,
    lastProcessedId: maxId,
    hasMore,
  });

  return {
    stateId: input.stateId,
    processedInBatch,
    enqueuedInBatch: enqueued,
    skippedDedupInBatch: skippedDedup,
    cumulativeProcessed,
    cumulativeEnqueued,
    hasMore,
    lastProcessedId: maxId,
  };
}

/**
 * Mark run завершеним. Викликає Sentry breadcrumb на completion (опера-
 * тор бачить у post-mortem-і чи backfill closed cleanly).
 */
export async function finalizeBackfill(
  pool: Pool,
  input: {
    stateId: number;
    founderUserId: string;
    status: BackfillStatus;
    error?: string;
  },
): Promise<void> {
  await pool.query(
    `UPDATE ai_memory_backfill_state
       SET completed_at = NOW(),
           status = $1,
           error = $2
     WHERE id = $3 AND founder_user_id = $4`,
    [input.status, input.error ?? null, input.stateId, input.founderUserId],
  );

  Sentry.addBreadcrumb({
    category: "ai-memory.backfill",
    level: input.status === "completed" ? "info" : "warning",
    message: `Backfill finalized: ${input.status}`,
    data: {
      stateId: input.stateId,
      ...(input.error ? { error: input.error } : {}),
    },
  });

  logger.info({
    msg: "ai_memory_backfill_finalized",
    stateId: input.stateId,
    status: input.status,
    ...(input.error ? { error: input.error } : {}),
  });
}
