/**
 * Чистка `applied`-оп-ів журналу синку `sync_op_log` (ADR-0105 §2).
 *
 * Журнал — це черга змін, по якій пристрої дочитують «усе після N». Стан
 * користувача живе в модульних таблицях, тож оп старший за вікно потрібен
 * лише пристрою, що не синкався довше за вікно; такий пристрій отримує
 * `410 sync_cursor_expired` і відновлюється зі знімка
 * (`GET /api/v2/sync/snapshot`, клієнт — `apps/web/.../snapshotRestore.ts`).
 *
 * Що робить один тік — ОДИН SQL-запит, тобто одна транзакція:
 *   1. бере до `batchSize` найстаріших (за `id`) рядків зі
 *      `status = 'applied'` і `server_ts` старшим за вікно;
 *   2. видаляє їх;
 *   3. піднімає межу `sync_op_log_floor.floor_id` кожного зачепленого
 *      користувача до максимального видаленого `id` (`GREATEST`, межа ніколи
 *      не опускається).
 * Видалення і межа комітяться разом: pull читає межу й оп-и одним запитом
 * (`selectPullPage`), тож бачить або старий журнал зі старою межею, або
 * обрізаний із новою — ніколи «рядків уже немає, а межа ще стара» (тиха
 * втрата змін).
 *
 * Не чіпає `rejected` (їх чистить `archivePoller.ts`, 30 днів) і не залежить
 * від `LOG_ARCHIVE_ENABLED` чи бакета: архівувати `applied` нема чого
 * (ADR-0105, варіант 4 відкинуто).
 *
 * **Опт-ін.** `SYNC_OP_LOG_APPLIED_RETENTION_DAYS = 0` (дефолт) — поллер не
 * стартує взагалі. Вмикає власник (ADR-0105 §5, крок 4); відкат — `0`.
 *
 * **Партії.** 5 000 рядків на тік раз на годину (стартове число ADR-0105):
 * коротка транзакція не тримає довгих блокувань, а беклог розсмоктується за
 * кілька годин. Скан іде за первинним ключем від найменшого `id` і
 * обмежений першим «молодим» рядком (`young`), тож після розсмоктування
 * тік не проходить усю таблицю.
 *
 * AI-DANGER: видалення незворотне. Не вмикай без клієнта, що вміє 410 →
 * знімок, і не прибирай оновлення `sync_op_log_floor` з того самого
 * запиту: без межі pull тихо пропустить видалене.
 */

import type { Pool } from "pg";

import { logger } from "../../obs/logger.js";
import { waitUntilIdle } from "../../lib/pollerDrain.js";
import {
  resolveStartupDelayMs,
  scheduleStartupTick,
} from "../../lib/pollerStartupTick.js";
import {
  syncOpLogAppliedDeletedTotal,
  syncOpLogRows,
} from "../../obs/metrics.js";

/** Рядків на тік (ADR-0105 §2, стартове значення). */
export const SYNC_OP_LOG_APPLIED_RETENTION_BATCH = 5_000;

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Один тік чистки. `young` — перший за `id` рядок, ще не старший за вікно:
 * за ним старих рядків майже немає (`id` і `server_ts` ростуть разом), тож
 * скан за ключем зупиняється на ньому. Рядок, що опинився за `young` через
 * довгу транзакцію запису, дочиститься наступними тіками, коли вікно
 * зсунеться. `id = ANY(ARRAY(...))` у DELETE — щоб видалення теж ішло за
 * первинним ключем: з `USING doomed` планувальник обирав hash join із
 * повним seq scan журналу на кожному тіку (EXPLAIN на 50 тис. рядків).
 * Повертає кількість видалених рядків і зачеплених користувачів.
 */
export const SYNC_OP_LOG_APPLIED_RETENTION_SQL = `
WITH cutoff AS (
  SELECT now() - ($1::int * INTERVAL '1 day') AS ts
), young AS (
  SELECT COALESCE(
    (SELECT id FROM sync_op_log
      WHERE server_ts >= (SELECT ts FROM cutoff)
      ORDER BY id ASC
      LIMIT 1),
    9223372036854775807
  ) AS id
), doomed AS (
  SELECT id
    FROM sync_op_log
   WHERE id < (SELECT id FROM young)
     AND status = 'applied'
     AND server_ts < (SELECT ts FROM cutoff)
   ORDER BY id ASC
   LIMIT $2::int
), deleted AS (
  DELETE FROM sync_op_log l
   WHERE l.id = ANY (ARRAY(SELECT id FROM doomed))
     AND l.status = 'applied'
  RETURNING l.user_id, l.id
), floors AS (
  INSERT INTO sync_op_log_floor AS f (user_id, floor_id, updated_at)
  SELECT user_id, max(id), now() FROM deleted GROUP BY user_id
  ON CONFLICT (user_id) DO UPDATE
     SET floor_id = GREATEST(f.floor_id, EXCLUDED.floor_id),
         updated_at = now()
  RETURNING user_id
)
SELECT (SELECT count(*) FROM deleted)::int AS deleted,
       (SELECT count(*) FROM floors)::int AS users`;

export interface SyncOpLogAppliedRetentionOptions {
  pool: Pool;
  /** Вікно в днях; `< 1` — поллер вимкнений. */
  retentionDays: number;
  /** Інтервал тіку, мс. Дефолт 1 год; `0` вимикає поллер. */
  intervalMs?: number;
  /** Рядків на тік. Дефолт {@link SYNC_OP_LOG_APPLIED_RETENTION_BATCH}. */
  batchSize?: number;
  /** Затримка стартового тіку, мс (див. `pollerStartupTick.ts`). */
  startDelayMs?: number | undefined;
}

export interface SyncOpLogAppliedRetentionResult {
  deleted: number;
  users: number;
}

export class SyncOpLogAppliedRetentionPoller {
  private readonly pool: Pool;
  private readonly retentionDays: number;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly startDelayMs: number;
  private timer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(options: SyncOpLogAppliedRetentionOptions) {
    this.pool = options.pool;
    this.retentionDays =
      Number.isFinite(options.retentionDays) && options.retentionDays >= 1
        ? Math.floor(options.retentionDays)
        : 0;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.batchSize = options.batchSize ?? SYNC_OP_LOG_APPLIED_RETENTION_BATCH;
    this.startDelayMs = resolveStartupDelayMs(options.startDelayMs);
  }

  get enabled(): boolean {
    return this.retentionDays > 0 && this.intervalMs > 0;
  }

  start(): void {
    if (this.timer) return;
    if (!this.enabled) {
      logger.info({
        msg: "sync_op_log_retention_disabled",
        retentionDays: this.retentionDays,
        intervalMs: this.intervalMs,
      });
      return;
    }
    logger.info({
      msg: "sync_op_log_retention_started",
      retentionDays: this.retentionDays,
      intervalMs: this.intervalMs,
      batchSize: this.batchSize,
    });
    const onTickError = (err: unknown): void => {
      logger.error({
        msg: "sync_op_log_retention_tick_failed",
        err: err instanceof Error ? err.message : String(err),
      });
    };
    this.timer = setInterval(() => {
      void this.runOnce().catch(onTickError);
    }, this.intervalMs);
    this.timer.unref?.();
    // Деплоїв буває більше, ніж годин: інтервал від старту процесу інакше
    // міг би не дожити до першого тіку (rel-19).
    this.startTimer = scheduleStartupTick(
      this.startDelayMs,
      () => this.runOnce(),
      onTickError,
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const drain = await waitUntilIdle(() => this.running);
    this.stopping = false;
    if (!drain.idle) {
      logger.warn({
        msg: "sync_op_log_retention_stop_timeout",
        waitedMs: drain.waitedMs,
      });
    }
  }

  /** Один тік. Публічний для тестів; вимкнений поллер нічого не робить. */
  async runOnce(): Promise<SyncOpLogAppliedRetentionResult> {
    const result: SyncOpLogAppliedRetentionResult = { deleted: 0, users: 0 };
    if (!this.enabled || this.running || this.stopping) return result;
    this.running = true;
    try {
      const res = await this.pool.query<{ deleted: number; users: number }>(
        SYNC_OP_LOG_APPLIED_RETENTION_SQL,
        [this.retentionDays, this.batchSize],
      );
      result.deleted = Number(res.rows[0]?.deleted ?? 0);
      result.users = Number(res.rows[0]?.users ?? 0);
      if (result.deleted > 0) {
        syncOpLogAppliedDeletedTotal.inc(result.deleted);
        logger.info({
          msg: "sync_op_log_retention_batch_done",
          deleted: result.deleted,
          users: result.users,
          retentionDays: this.retentionDays,
        });
      }
      await this.sampleTableSize();
      return result;
    } finally {
      this.running = false;
    }
  }

  /** Оцінка розміру журналу без скану; збій метрики не валить тік. */
  private async sampleTableSize(): Promise<void> {
    try {
      const res = await this.pool.query<{ rows: string | number | null }>(
        `SELECT reltuples::bigint AS rows
           FROM pg_class
          WHERE oid = 'sync_op_log'::regclass`,
      );
      const rows = Number(res.rows[0]?.rows ?? -1);
      if (Number.isFinite(rows) && rows >= 0) syncOpLogRows.set(rows);
    } catch {
      /* метрика ніколи не має ламати чистку */
    }
  }
}
