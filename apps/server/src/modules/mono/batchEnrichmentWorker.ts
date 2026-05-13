/**
 * Status: Active.
 *
 * Hourly batch worker для MCC-fallback (PR-18 з pr-plan-2026-05, WF-06
 * mono optimization).
 *
 * Чому окремий worker, а не модифікація `enrichmentWorker.ts`:
 *   * Per-row enrichment-worker (PR #1251) має короткий tick (~5s) і
 *     батчить 5 row-ів у пам'яті. Batch-worker — це інший цикл життя
 *     (hourly), інший lock-domain (in-memory FIFO замість DB SKIP LOCKED).
 *   * Per-row worker лишається для MCC, які rule-based fast-path вирішує
 *     детерміністично (миттєвий write-back). Batch-worker — тільки для
 *     unknown MCC, які потрапили у `unknownQueue`.
 *
 * Контракт за один tick:
 *   1. `drainBatch(MCC_BATCH_MAX_SIZE)` → items із буфера. Якщо пусто —
 *      no-op (idempotency).
 *   2. `buildBatchPrompt(items)` → один Anthropic-виклик на ВЕСЬ batch.
 *      Promise з timeout-ом = `intervalMs / 6` (макс 10 хв), щоб не
 *      перекривати наступний tick.
 *   3. `parseBatchResponse(text, items)` → `{ ok, missing }`.
 *      Для кожного `ok` item: `WRITE_BACK_SQL` (як у per-row worker-і)
 *        + `MARK_DONE_SQL` для queue.row.id.
 *      Для кожного `missing` item: `returnToBuffer` (повторна спроба
 *        наступного tick-у).
 *   4. Якщо Anthropic-call throw-ить (5xx, timeout, parse-throw на
 *      response level) — ВЕСЬ batch redirect-имо назад у per-row queue
 *      через `MARK_RETRY_SQL` (status='pending', available_at=NOW(),
 *      attempts++). Це і є fallback із specs PR-18 п.4.
 *
 * Safety:
 *   * Worker НІКОЛИ не throw-ить — все ловиться, лічиться у метриках.
 *   * `MARK_DONE_SQL` / `MARK_RETRY_SQL` визначені у `enrichmentWorker.ts`,
 *     але повторно імпортувати їх через ESM — простіше скопіювати literals,
 *     ніж рефакторити публічний API чужого модуля. Це коротко і явно.
 */

import type { Pool } from "pg";
import { env } from "../../env.js";
import { anthropicMessages } from "../../lib/anthropic.js";
import {
  buildBatchPrompt,
  parseBatchResponse,
} from "../../lib/mcc/batchPrompt.js";
import {
  currentBufferSize,
  drainBatch,
  returnToBuffer,
  type UnknownMccItem,
} from "../../lib/mcc/unknownQueue.js";
import { logger, serializeError } from "../../obs/logger.js";
import {
  monoMccBatchDurationMs,
  monoMccBatchProcessedTotal,
  monoMccBatchSize,
} from "../../obs/metrics.js";

const WRITE_BACK_SQL = `
UPDATE mono_transaction
   SET ai_category_slug = $3,
       ai_category_confidence = $4,
       ai_categorized_at = NOW()
 WHERE user_id = $1 AND mono_tx_id = $2;
`;

const MARK_DONE_SQL = `
UPDATE mono_ai_enrichment_queue
   SET status = 'done',
       processed_at = NOW(),
       updated_at = NOW(),
       last_error = NULL
 WHERE id = $1;
`;

const MARK_RETRY_SQL = `
UPDATE mono_ai_enrichment_queue
   SET status = 'pending',
       attempts = attempts + 1,
       last_error = $2,
       available_at = NOW(),
       updated_at = NOW()
 WHERE id = $1;
`;

/**
 * Скільки разів item може провалити Anthropic-batch parse (бути у `missing`)
 * перш ніж його redirect у per-row queue. Без цього cap-у item, який Claude
 * чомусь не може класифікувати, висітиме у буфер-і навіки.
 */
const MAX_BUFFER_MISSED_TICKS = 3;

export interface BatchWorkerOptions {
  /** Розмір batch-у; за замовч. — `env.MCC_BATCH_MAX_SIZE`. */
  batchSize?: number;
  /** Інтервал між tick-ами (мс); за замовч. — `env.MCC_BATCH_INTERVAL_MS`. */
  intervalMs?: number;
  /** Override для DI у тестах. */
  anthropic?: typeof anthropicMessages;
  /** Override для DI у тестах. */
  now?: () => Date;
}

export interface BatchTickResult {
  drained: number;
  ok: number;
  missing: number;
  requeued: number;
  failedTotal: number;
}

export async function runMccBatchTick(
  pool: Pool,
  opts: BatchWorkerOptions = {},
): Promise<BatchTickResult> {
  const t0 = Date.now();
  const result: BatchTickResult = {
    drained: 0,
    ok: 0,
    missing: 0,
    requeued: 0,
    failedTotal: 0,
  };

  const batchSize = opts.batchSize ?? env.MCC_BATCH_MAX_SIZE;
  const anthropic = opts.anthropic ?? anthropicMessages;
  const apiKey = env.ANTHROPIC_API_KEY;

  const items = drainBatch(batchSize);
  result.drained = items.length;
  if (items.length === 0) {
    // Idempotent no-op для порожнього буфер-у.
    return result;
  }
  monoMccBatchSize.observe(items.length);

  if (!apiKey) {
    // Anthropic не сконфігурований — повертаємо ВСЕ у per-row queue (там
    // worker сам розбереться, або відмовиться). Логіруємо як warn, бо це
    // теоретично можливо при config-drift-і у Railway.
    await requeueAll(pool, items, "no_api_key", result);
    monoMccBatchDurationMs.observe({ outcome: "failed" }, Date.now() - t0);
    return result;
  }

  const prompt = buildBatchPrompt(items);
  try {
    const { response, data } = await anthropic(
      apiKey,
      {
        model: "claude-haiku-4-5-20251001",
        // ~10 tokens per output item: `{"i":N,"c":"X","conf":0.9}` ≈ 25 chars
        // ≈ 8-12 tokens (incl. JSON syntax). 100 items × 12 + buffer = 1500.
        max_tokens: Math.min(2_000, Math.max(200, items.length * 15)),
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      },
      {
        endpoint: "internal/mcc-batch",
        // Більший timeout ніж per-row (15s), бо output довший. Все ще
        // менший за `intervalMs / 6` для типового 1h-tick-у.
        timeoutMs: 60_000,
      },
    );

    if (!response?.ok) {
      throw new Error(
        `mcc_batch: upstream not ok (status=${response?.status ?? 0})`,
      );
    }
    const text =
      (
        data as {
          content?: Array<{ type: string; text?: string }>;
        }
      ).content?.[0]?.text ?? "";

    const parsed = parseBatchResponse(text, items);

    // Write-back успіхи.
    for (const [index, cat] of parsed.ok.entries()) {
      const item = items[index];
      if (!item) continue;
      try {
        await pool.query(WRITE_BACK_SQL, [
          item.userId,
          item.monoTxId,
          cat.category,
          cat.confidence,
        ]);
        await pool.query(MARK_DONE_SQL, [item.queueId]);
        monoMccBatchProcessedTotal.inc({ outcome: "ok" });
        result.ok += 1;
      } catch (err) {
        logger.warn({
          msg: "mono_mcc_batch_write_back_failed",
          queueId: item.queueId,
          monoTxId: item.monoTxId,
          err: serializeError(err, { includeStack: false }),
        });
        // Item уже не у буфер-і, але DB-write провалився — redirect у
        // per-row queue, щоб не загубити.
        await requeueAll(
          pool,
          [item],
          err instanceof Error ? err.message : String(err),
          result,
        );
      }
    }

    // Missing items: повертаємо у буфер з лічильником attempts. Коли
    // attempts перевищує `MAX_BUFFER_MISSED_TICKS` — redirect у per-row.
    const toReturn: UnknownMccItem[] = [];
    const toRequeue: UnknownMccItem[] = [];
    for (const item of parsed.missing) {
      const nextAttempts = item.attempts + 1;
      if (nextAttempts >= MAX_BUFFER_MISSED_TICKS) {
        toRequeue.push(item);
      } else {
        toReturn.push({ ...item, attempts: nextAttempts });
      }
    }
    if (toReturn.length > 0) {
      returnToBuffer(toReturn);
      monoMccBatchProcessedTotal.inc({ outcome: "missing" }, toReturn.length);
      result.missing += toReturn.length;
    }
    if (toRequeue.length > 0) {
      await requeueAll(pool, toRequeue, "missed_batch_ticks_exceeded", result);
    }

    monoMccBatchDurationMs.observe({ outcome: "ok" }, Date.now() - t0);
    return result;
  } catch (err) {
    // Anthropic-fail → ВЕСЬ batch у per-row queue, як specs.
    const lastError = (err instanceof Error ? err.message : String(err)).slice(
      0,
      500,
    );
    await requeueAll(pool, items, lastError, result);
    monoMccBatchDurationMs.observe({ outcome: "failed" }, Date.now() - t0);
    logger.warn({
      msg: "mono_mcc_batch_tick_failed",
      batchSize: items.length,
      err: serializeError(err, { includeStack: false }),
    });
    return result;
  }
}

/**
 * Helper: redirect items у per-row queue через `MARK_RETRY_SQL`. Збільшує
 * `attempts` у queue.row на 1; per-row worker сам вирішить, чи це фейловий
 * retry, чи `failed`-стан. Не throw-ить — UPDATE-помилку лиш логіруємо.
 */
async function requeueAll(
  pool: Pool,
  items: UnknownMccItem[],
  lastError: string,
  result: BatchTickResult,
): Promise<void> {
  for (const item of items) {
    try {
      await pool.query(MARK_RETRY_SQL, [item.queueId, lastError.slice(0, 500)]);
      monoMccBatchProcessedTotal.inc({ outcome: "requeued" });
      result.requeued += 1;
    } catch (err) {
      monoMccBatchProcessedTotal.inc({ outcome: "failed" });
      result.failedTotal += 1;
      logger.warn({
        msg: "mono_mcc_batch_requeue_failed",
        queueId: item.queueId,
        err: serializeError(err, { includeStack: false }),
      });
    }
  }
}

export interface StartedBatchWorker {
  stop: () => Promise<void>;
}

/**
 * Стартує self-scheduling loop. Той самий шаблон, що `startMonoEnrichmentWorker`:
 * setTimeout-chain → гарантовано non-overlap; `stop()` дочікується inflight tick.
 */
export function startMonoMccBatchWorker(
  pool: Pool,
  opts: BatchWorkerOptions = {},
): StartedBatchWorker {
  const intervalMs = opts.intervalMs ?? env.MCC_BATCH_INTERVAL_MS;

  let stopping = false;
  let tickTimeout: NodeJS.Timeout | null = null;
  let inflight: Promise<unknown> = Promise.resolve();

  const runTick = async (): Promise<void> => {
    if (stopping) return;
    try {
      await runMccBatchTick(pool, opts);
    } catch (err) {
      // runMccBatchTick сам ніколи не throw-ить, але safety net.
      logger.error({
        msg: "mono_mcc_batch_tick_unexpected_error",
        err: serializeError(err, { includeStack: false }),
      });
    }
  };

  const scheduleTick = (): void => {
    if (stopping) return;
    tickTimeout = setTimeout(() => {
      tickTimeout = null;
      inflight = runTick().finally(() => {
        scheduleTick();
      });
    }, intervalMs);
    if (tickTimeout && typeof tickTimeout.unref === "function") {
      tickTimeout.unref();
    }
  };

  // НЕ робимо одразу `runTick()` — на старті процесу буфер пустий, перший
  // run-tick через `intervalMs` дає час webhook-у наповнити буфер.
  scheduleTick();

  logger.info({
    msg: "mono_mcc_batch_worker_started",
    intervalMs,
    batchSize: opts.batchSize ?? env.MCC_BATCH_MAX_SIZE,
    initialBufferDepth: currentBufferSize(),
  });

  return {
    async stop() {
      stopping = true;
      if (tickTimeout) {
        clearTimeout(tickTimeout);
        tickTimeout = null;
      }
      try {
        await Promise.allSettled([inflight]);
      } catch {
        /* allSettled ніколи не throw-ить */
      }
      logger.info({ msg: "mono_mcc_batch_worker_stopped" });
    },
  };
}
