import type { Pool } from "pg";
import {
  monoEnrichmentDurationMs,
  monoEnrichmentProcessedTotal,
  monoEnrichmentQueueDepth,
} from "../../obs/metrics.js";
import { logger, serializeError } from "../../obs/logger.js";
import { categorizeTransaction } from "../../routes/internal/categorize.js";
import type { CategorizeResult } from "../../routes/internal/categorize.js";

/**
 * Polling consumer для outbox-таблиці `mono_ai_enrichment_queue`.
 *
 * Чому polling, а не LISTEN/NOTIFY чи Redis: міграція 013 уже містить
 * partial index `… WHERE status IN ('pending', 'failed')`, тож SELECT
 * по batch-у дешевий навіть під навантаженням. Polling легше зробити
 * resilient до міжпроцесних race-ів (multi-replica) — `FOR UPDATE SKIP
 * LOCKED` гарантує, що дві репліки ніколи не підхоплять одну row.
 *
 * Що worker робить за один tick (`runOnce`):
 *   1) Атомарно бере до `batchSize` ready-row-ів (status pending|failed,
 *      `available_at <= NOW()`), переводить їх у `processing`.
 *   2) Для кожного — JOIN-ом тягне `description/amount/mcc` з
 *      `mono_transaction`. Якщо tx видалена/відсутня — `outcome=missing_tx`,
 *      row закриваємо як `done` (немає що класифікувати).
 *   3) Викликає `categorizeTransaction()` (та сама логіка, що
 *      `/api/internal/categorize` route) → пише `ai_category_slug`,
 *      `ai_category_confidence`, `ai_categorized_at` у `mono_transaction`.
 *      `category_slug` (user-owned) НЕ чіпаємо — це окреме поле з міграції 010.
 *   4) На успіх: queue.row.status='done', processed_at=NOW().
 *      На помилку: attempts++, last_error=text, available_at=NOW()+backoff,
 *      status='failed' якщо вичерпали `maxAttempts`, інакше 'pending'.
 *
 * Backoff: 30s × 2^attempts, capped at 1h. Це дає ретраї на коротких
 * Anthropic-blip-ах і «здається» через ~16 спроб (а ми ріжемо на 5).
 *
 * Контракт безпеки (важливо для multi-replica):
 *   * `FOR UPDATE SKIP LOCKED` + UPDATE-у одній транзакції → дві репліки
 *     ніколи не пишуть одночасно у ту саму row.
 *   * `runOnce` ніколи не throw-ить — будь-яка непередбачена помилка
 *     ловиться, логується, лічиться у `monoEnrichmentProcessedTotal{outcome=failed}`,
 *     і loop їде далі. Worker сам себе не валить.
 *   * Worker свідомо не бере `pool.connect()` на весь tick — кожна row
 *     обробляється у власній короткій TX, щоб одна довга Anthropic-затримка
 *     не блокувала pool.
 */

export interface EnrichmentWorkerOptions {
  /** Скільки row-ів брати за один tick. */
  batchSize?: number;
  /** Скільки разів пробувати кожен tx до того як «здатися» (status=failed). */
  maxAttempts?: number;
  /** Інтервал між ticks. Polling-cycle старту ніколи не пересікається сам із собою. */
  intervalMs?: number;
  /** Override для DI у тестах. */
  categorize?: typeof categorizeTransaction;
  /** Override для DI у тестах. */
  now?: () => Date;
}

export interface EnrichmentTickResult {
  picked: number;
  ok: number;
  failed: number;
  missingTx: number;
}

interface QueueRow {
  id: number | string;
  user_id: string;
  mono_tx_id: string;
  attempts: number;
  description: string | null;
  amount: number | string | null;
  mcc: number | null;
}

const PICK_BATCH_SQL = `
WITH next_batch AS (
  SELECT id
    FROM mono_ai_enrichment_queue
   WHERE status IN ('pending', 'failed')
     AND available_at <= NOW()
   ORDER BY available_at, id
   LIMIT $1
   FOR UPDATE SKIP LOCKED
)
UPDATE mono_ai_enrichment_queue q
   SET status = 'processing',
       updated_at = NOW()
  FROM next_batch nb
 WHERE q.id = nb.id
RETURNING q.id, q.user_id, q.mono_tx_id, q.attempts;
`;

const FETCH_TX_SQL = `
SELECT description, amount, mcc
  FROM mono_transaction
 WHERE user_id = $1 AND mono_tx_id = $2
   AND deleted_at IS NULL;
`;

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
   SET status = $2,
       attempts = attempts + 1,
       last_error = $3,
       available_at = $4,
       updated_at = NOW()
 WHERE id = $1;
`;

function backoffMs(attempts: number): number {
  // 30s × 2^attempts, capped at 1h. attempts тут = current row.attempts
  // (ще не інкрементований у ходячому tick-у).
  const base = 30_000 * Math.pow(2, Math.max(0, attempts));
  return Math.min(base, 60 * 60 * 1000);
}

/**
 * Один tick worker-а: підняти batch, обробити, вийти. Безпечно викликати
 * вручну з тестів. Ніколи не throw-ить (всі помилки ловляться всередині).
 */
export async function runEnrichmentTick(
  pool: Pool,
  opts: EnrichmentWorkerOptions = {},
): Promise<EnrichmentTickResult> {
  const batchSize = opts.batchSize ?? 5;
  const maxAttempts = opts.maxAttempts ?? 5;
  const categorize = opts.categorize ?? categorizeTransaction;

  const result: EnrichmentTickResult = {
    picked: 0,
    ok: 0,
    failed: 0,
    missingTx: 0,
  };

  let picked: QueueRow[] = [];
  try {
    const pickRes = await pool.query<{
      id: number | string;
      user_id: string;
      mono_tx_id: string;
      attempts: number;
    }>(PICK_BATCH_SQL, [batchSize]);
    picked = pickRes.rows.map((r) => ({
      // `id` — BIGSERIAL → bigint → string у pg. Hard Rule #1.
      id: Number(r.id),
      // user_id / mono_tx_id — TEXT-колонки (nanoid юзер-ід, монобанк tx-ід).
      // Лінтер flag-ає їх по імені — реально вони не bigint.
      // eslint-disable-next-line sergeant-design/no-bigint-string -- TEXT column, not bigint
      user_id: r.user_id,
      // eslint-disable-next-line sergeant-design/no-bigint-string -- TEXT column, not bigint
      mono_tx_id: r.mono_tx_id,
      attempts: Number(r.attempts) || 0,
      description: null,
      amount: null,
      mcc: null,
    }));
  } catch (err) {
    logger.error({
      msg: "mono_enrichment_pick_failed",
      err: serializeError(err, { includeStack: false }),
    });
    return result;
  }

  result.picked = picked.length;
  if (picked.length === 0) return result;

  for (const row of picked) {
    const t0 = Date.now();
    try {
      const txRes = await pool.query<{
        description: string | null;
        amount: number | string | null;
        mcc: number | null;
      }>(FETCH_TX_SQL, [row.user_id, row.mono_tx_id]);
      const tx = txRes.rows[0];

      if (!tx) {
        // Tx видалена між webhook-ом і моментом обробки. Закриваємо row,
        // інакше worker нескінченно ретраїтиме привид.
        await pool.query(MARK_DONE_SQL, [row.id]);
        monoEnrichmentProcessedTotal.inc({ outcome: "missing_tx" });
        result.missingTx += 1;
        continue;
      }

      if (!tx.description || tx.description.trim().length === 0) {
        // Без description Claude не може класифікувати. Закриваємо як skipped.
        await pool.query(MARK_DONE_SQL, [row.id]);
        monoEnrichmentProcessedTotal.inc({ outcome: "skipped" });
        continue;
      }

      const cat: CategorizeResult = await categorize({
        description: tx.description,
        amount: tx.amount != null ? Number(tx.amount) : null,
        mcc: tx.mcc,
      });

      await pool.query(WRITE_BACK_SQL, [
        row.user_id,
        row.mono_tx_id,
        cat.category,
        cat.confidence,
      ]);
      await pool.query(MARK_DONE_SQL, [row.id]);

      monoEnrichmentProcessedTotal.inc({ outcome: "ok" });
      monoEnrichmentDurationMs.observe({ outcome: "ok" }, Date.now() - t0);
      result.ok += 1;
    } catch (err) {
      const willGiveUp = row.attempts + 1 >= maxAttempts;
      const status = willGiveUp ? "failed" : "pending";
      const availableAt = new Date(Date.now() + backoffMs(row.attempts));
      const lastError = (
        err instanceof Error ? err.message : String(err)
      ).slice(0, 500);
      try {
        await pool.query(MARK_RETRY_SQL, [
          row.id,
          status,
          lastError,
          availableAt,
        ]);
      } catch (retryErr) {
        // Якщо навіть UPDATE row впав — лог, переходимо до наступної.
        logger.error({
          msg: "mono_enrichment_mark_retry_failed",
          rowId: row.id,
          err: serializeError(retryErr, { includeStack: false }),
        });
      }
      monoEnrichmentProcessedTotal.inc({ outcome: "failed" });
      monoEnrichmentDurationMs.observe({ outcome: "failed" }, Date.now() - t0);
      result.failed += 1;
      logger.warn({
        msg: "mono_enrichment_row_failed",
        rowId: row.id,
        userId: row.user_id,
        monoTxId: row.mono_tx_id,
        attempts: row.attempts + 1,
        willGiveUp,
        err: serializeError(err, { includeStack: false }),
      });
    }
  }

  return result;
}

/**
 * Семплінг queue-depth-метрики. Окрема функція, бо її викликаємо рідше
 * за tick-loop (раз на 30с достатньо для дашборду — depth не змінюється
 * блискавично).
 */
export async function sampleEnrichmentQueueDepth(pool: Pool): Promise<void> {
  try {
    const res = await pool.query<{ status: string; count: number | string }>(
      `SELECT status, COUNT(*)::bigint AS count
         FROM mono_ai_enrichment_queue
        GROUP BY status`,
    );
    // Reset усі лейбли, щоб не лишався застарілий gauge для статусу,
    // який тимчасово зник із SQL-результату (наприклад, всі pending → done).
    monoEnrichmentQueueDepth.reset();
    for (const r of res.rows) {
      monoEnrichmentQueueDepth.set({ status: r.status }, Number(r.count) || 0);
    }
  } catch (err) {
    logger.warn({
      msg: "mono_enrichment_depth_sample_failed",
      err: serializeError(err, { includeStack: false }),
    });
  }
}

export interface StartedWorker {
  stop: () => Promise<void>;
}

/**
 * Стартує periodic-loop. Повертає `stop()`, який зупиняє loop і чекає,
 * поки in-flight tick завершиться (важливо для graceful shutdown).
 */
export function startMonoEnrichmentWorker(
  pool: Pool,
  opts: EnrichmentWorkerOptions = {},
): StartedWorker {
  const intervalMs = opts.intervalMs ?? 5_000;
  const depthIntervalMs = 30_000;

  let stopping = false;
  let tickTimeout: NodeJS.Timeout | null = null;
  let sampleTimeout: NodeJS.Timeout | null = null;
  // Тримаємо ОСТАННЮ inflight-операцію кожного циклу (tick / sample). Цикли
  // self-scheduling (див. нижче), тож одночасно у польоті може бути
  // максимум 1 tick + 1 sample. Зберігаємо обидві promise-и, щоб stop()
  // дочекався їх обох перед `pool.end()`.
  let inflightTick: Promise<unknown> = Promise.resolve();
  let inflightSample: Promise<unknown> = Promise.resolve();

  const runTick = async (): Promise<void> => {
    if (stopping) return;
    try {
      await runEnrichmentTick(pool, opts);
    } catch (err) {
      // runEnrichmentTick сам ніколи не throw-ить, але для safety.
      logger.error({
        msg: "mono_enrichment_tick_unexpected_error",
        err: serializeError(err, { includeStack: false }),
      });
    }
  };

  const runSample = async (): Promise<void> => {
    if (stopping) return;
    try {
      await sampleEnrichmentQueueDepth(pool);
    } catch {
      /* sampleEnrichmentQueueDepth ловить помилки сам — тут лише safety */
    }
  };

  /**
   * Self-scheduling loop замість `setInterval`:
   * - `setInterval` стріляв би кожні `intervalMs` НЕЗАЛЕЖНО від того,
   *   завершився попередній tick чи ні. Для нашого Anthropic-flow одна
   *   ітерація може зайняти 75+ секунд (5 row × 15 s timeout), і
   *   setInterval встиг би пере-затерти `inflight` 15 разів. Stop() тоді
   *   awaitить лише ОСТАННІЙ tick, а попередні 14 — abandoned, і коли
   *   index.ts викличе pool.end() одразу після stop(), ці tick-и
   *   отримають ECONNRESET → queue.row застрягне у status='processing'
   *   назавжди (Devin Review знайшов це у PR #1251).
   * - `setTimeout`-loop запускає НАСТУПНИЙ tick тільки після завершення
   *   попереднього. Гарантовано non-overlap, гарантовано stop() ловить
   *   справжній in-flight, без extra book-keeping (Set<Promise>).
   */
  const scheduleTick = (): void => {
    if (stopping) return;
    tickTimeout = setTimeout(() => {
      tickTimeout = null;
      inflightTick = runTick().finally(() => {
        scheduleTick();
      });
    }, intervalMs);
    if (tickTimeout && typeof tickTimeout.unref === "function") {
      tickTimeout.unref();
    }
  };

  const scheduleSample = (): void => {
    if (stopping) return;
    sampleTimeout = setTimeout(() => {
      sampleTimeout = null;
      inflightSample = runSample().finally(() => {
        scheduleSample();
      });
    }, depthIntervalMs);
    if (sampleTimeout && typeof sampleTimeout.unref === "function") {
      sampleTimeout.unref();
    }
  };

  // Перший прогін одразу, щоб не чекати першого інтервалу.
  inflightTick = runTick().finally(() => {
    scheduleTick();
  });
  inflightSample = runSample().finally(() => {
    scheduleSample();
  });

  logger.info({
    msg: "mono_enrichment_worker_started",
    batchSize: opts.batchSize ?? 5,
    intervalMs,
  });

  return {
    async stop() {
      stopping = true;
      if (tickTimeout) {
        clearTimeout(tickTimeout);
        tickTimeout = null;
      }
      if (sampleTimeout) {
        clearTimeout(sampleTimeout);
        sampleTimeout = null;
      }
      // Чекаємо ОБИДВІ inflight-операції — і tick, і sample. Без цього
      // sample, який ходить раз на 30с, може опинитися посеред pool.end()
      // → ECONNRESET у логах при graceful shutdown.
      try {
        await Promise.allSettled([inflightTick, inflightSample]);
      } catch {
        /* swallow — allSettled не throw-ить, але про всяк */
      }
      logger.info({ msg: "mono_enrichment_worker_stopped" });
    },
  };
}
