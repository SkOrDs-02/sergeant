/**
 * Hard-delete cleanup for soft-deleted AI memory rows.
 *
 * Контекст: `/forget` slash-команда (PR-23) робить soft-delete через
 * `UPDATE ai_memories SET deleted_at = NOW()` (migration 067). Це дає
 * 7-денне recovery-window: founder може випадково видалити стратегічно
 * важливу row-у і ops-команда може зробити `UPDATE ... deleted_at = NULL`
 * до того, як cron видалить її hard.
 *
 * Цей модуль — purgable function, що hard-видаляє rows коли
 * `deleted_at < NOW() - INTERVAL '7 days'`. Викликається або:
 *   * BullMQ scheduler у `apps/server/src/index.ts` (production), або
 *   * Manually через ops-CLI (`pnpm exec node --input-type=module -e ...`).
 *
 * Чому 7 днів:
 *   * Backup retention у Postgres-managed: PITR window — 7 днів. До
 *     закінчення цього вікна founder може повертати row-у через
 *     point-in-time-restore (DR-procedure, не self-service).
 *   * Після 7 днів recoverability вже залежить від external backup-у;
 *     hard-delete очищує table-bloat.
 *
 * Idempotency:
 *   * `DELETE` за `deleted_at < threshold` — natural idempotency. Якщо
 *     cron перерватиметься між батчами і запуститься заново, він просто
 *     видалить пів-видалених rows-аркуш.
 *
 * Batching:
 *   * Hard-delete з partitioned table — каскадиться по 32 партиціях,
 *     кожен DELETE на parent йде окремим SQL до партиції. 1000-row-batch
 *     блокує ~5s; робимо `LIMIT 1000` + loop, щоб не тримати lock на
 *     hot-path індексі довше за необхідне.
 */

import type { Pool } from "pg";

import { logger, serializeError } from "../../obs/logger.js";
import { Sentry } from "../../sentry.js";

/** Default 7-day retention перед hard-delete. */
export const SOFT_DELETE_RETENTION_DAYS = 7;

/** Per-batch row cap to keep lock-windows bounded. */
const HARD_DELETE_BATCH_SIZE = 1000;

export interface ForgetCleanupResult {
  /** Total rows hard-deleted across all batches. */
  deletedCount: number;
  /** Кількість batch-loop iterations (для observability). */
  batches: number;
  /** Whether cron reached `deletedCount == 0` (false якщо stop-нув early). */
  drained: boolean;
}

export interface ForgetCleanupOptions {
  /** Custom retention; defaults to `SOFT_DELETE_RETENTION_DAYS`. */
  retentionDays?: number;
  /** Max batches per run; safety cap проти runaway loop. Default 100. */
  maxBatches?: number;
  /**
   * Optional override for "now" — для testing. Прод-cron не передає.
   * ISO 8601 string.
   */
  nowIso?: string;
}

/**
 * Hard-deletes all `ai_memories` rows with `deleted_at < now - retentionDays`.
 *
 * Returns aggregate stats. Errors propagate (caller — cron — приймає рішення
 * retry / alert).
 */
export async function runForgetCleanup(
  pool: Pool,
  options: ForgetCleanupOptions = {},
): Promise<ForgetCleanupResult> {
  const retentionDays = options.retentionDays ?? SOFT_DELETE_RETENTION_DAYS;
  const maxBatches = options.maxBatches ?? 100;
  const nowParam = options.nowIso ?? null;

  let totalDeleted = 0;
  let batches = 0;
  let drained = false;

  try {
    for (let i = 0; i < maxBatches; i++) {
      batches += 1;
      // Use a CTE to fetch a deterministic batch by ctid (partition-local),
      // then DELETE рядки за тим самим ctid. Це уникає `LIMIT` обмеження
      // на UPDATE/DELETE з PARTITION BY HASH parent-у (не всі версії
      // Postgres приймають LIMIT на partitioned-DELETE).
      const result = await pool.query<{ deleted_count: string }>(
        `WITH victims AS (
           SELECT ctid, tableoid
             FROM ai_memories
            WHERE deleted_at IS NOT NULL
              AND deleted_at < COALESCE($2::timestamptz, NOW())
                              - ($1 || ' days')::interval
            LIMIT $3
         )
         DELETE FROM ai_memories AS m
          USING victims v
          WHERE m.ctid = v.ctid AND m.tableoid = v.tableoid
         RETURNING 1`,
        [String(retentionDays), nowParam, HARD_DELETE_BATCH_SIZE],
      );
      const batchDeleted = result.rowCount ?? 0;
      totalDeleted += batchDeleted;
      if (batchDeleted < HARD_DELETE_BATCH_SIZE) {
        drained = true;
        break;
      }
    }

    logger.info({
      msg: "ai_memory_forget_cleanup_completed",
      retentionDays,
      totalDeleted,
      batches,
      drained,
    });

    Sentry.addBreadcrumb({
      category: "ai-memory-forget",
      level: "info",
      message: "forget.cleanup.completed",
      data: {
        retention_days: retentionDays,
        total_deleted: totalDeleted,
        batches,
        drained,
      },
    });

    return { deletedCount: totalDeleted, batches, drained };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({
      msg: "ai_memory_forget_cleanup_failed",
      retentionDays,
      totalDeleted,
      batches,
      err: serializeError(error),
    });
    Sentry.captureException(error, {
      tags: { module: "ai-memory-forget-cleanup" },
      extra: { retentionDays, totalDeleted, batches },
    });
    throw error;
  }
}
