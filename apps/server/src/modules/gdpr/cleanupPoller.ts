/**
 * In-process полер для `gdpr_cleanup_queue` — драйвер batch-worker-а.
 *
 * > **Last validated:** 2026-08-28. **Status:** Active
 *
 * ЧОМУ цей файл існує. Worker `processGdprCleanupQueueBatch`
 * (`cleanupWorker.ts`, ADR-0016 § ADR-6.3) був досяжний ЛИШЕ через
 * `POST /api/internal/gdpr/cleanup-queue/process`
 * (`routes/internal/gdpr.ts`), розрахований на зовнішній Railway/n8n cron.
 * Але Railway виведено з експлуатації (ADR-0074), а n8n у проді на паузі
 * (та сама причина, що в `modules/billing/plataScheduler.ts` і
 * `modules/silpo/syncScheduler.ts`) — тож чергу НІХТО не смикав, і
 * PII-рядки, enqueue-нуті на видаленні акаунта (`modules/me/dataRights.ts`
 * → `cleanupQueue.ts`), лежали без дренажу необмежено довго. Це
 * compliance-дефект (GDPR Art. 17 «without undue delay»), який цей полер
 * закриває.
 *
 * Патерн — дзеркало `modules/webhooks/retentionPoller.ts` (Tier-A, без
 * BullMQ): `setInterval` + `unref()`, idempotent start/stop, overlap-guard
 * (tick не накладається сам на себе), помилка tick-а логгується і не валить
 * процес. Internal-ендпоінт лишається для ручних прогонів — обидва шляхи
 * кличуть той самий batch-worker, який має власний `FOR UPDATE SKIP
 * LOCKED`-lease (`claimBatch`), тож паралельний виклик безпечний.
 *
 * Кожен tick додатково семплить gauge
 * `gdpr_cleanup_queue_depth{status=pending|stuck}`: «stuck» — це
 * audit-предикат ADR-0016 (`completed_at IS NULL AND attempts > 5`), на
 * нього дивиться алерт `GdprCleanupQueueStuckRows`
 * (`ops/prometheus/rules/gdpr.yml`).
 *
 * Гейт: `GDPR_CLEANUP_POLL_INTERVAL_MS` (default — година, як у
 * retention-полера; 0 → off). Default УВІМКНЕНО свідомо: вимкнений дренаж
 * — це і є дефект, який тут лікуємо.
 */

import type { Pool } from "pg";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { gdprCleanupQueueDepth } from "../../obs/metrics.js";
import {
  processGdprCleanupQueueBatch,
  type ProcessGdprCleanupQueueResult,
} from "./cleanupWorker.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Рядків за tick. Збігається зі стелею internal-ендпоінта
 * (`routes/internal/gdpr.ts`, max 25 → default 20) — той самий rate-limit /
 * DB-load аргумент; `deadlineMs` worker-а (60s) все одно обрізає wall-clock.
 */
const DEFAULT_BATCH_LIMIT = 20;

/**
 * ISO-час останнього успішного tick-а ЦЬОГО процесу (module-level, бо
 * `/health/workers`-статус читається без доступу до інстансу полера).
 * `null` після рестарту до першого tick-а — це очікувано.
 */
let lastRunAtIso: string | null = null;

export interface GdprCleanupPollerOptions {
  pool: Pool;
  /** Інтервал у мілісекундах. Default 1 год. 0 → off. */
  intervalMs?: number | undefined;
  /** Рядків за tick. Default 20. */
  batchLimit?: number | undefined;
  /** Інʼєкція для тестів — реальний прогін бʼє у vendor-API. */
  processBatch?: typeof processGdprCleanupQueueBatch | undefined;
}

export class GdprCleanupPoller {
  private readonly pool: Pool;
  private readonly intervalMs: number;
  private readonly batchLimit: number;
  private readonly processBatch: typeof processGdprCleanupQueueBatch;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(options: GdprCleanupPollerOptions) {
    this.pool = options.pool;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.batchLimit = options.batchLimit ?? DEFAULT_BATCH_LIMIT;
    this.processBatch = options.processBatch ?? processGdprCleanupQueueBatch;
  }

  /** Запускає cron-loop. Idempotent — повторні start-и не дублюють timer. */
  start(): void {
    if (this.timer) return;
    if (this.intervalMs <= 0) {
      logger.info({
        msg: "gdpr_cleanup_poller_disabled",
        reason: "interval_zero",
        intervalMs: this.intervalMs,
      });
      return;
    }
    logger.info({
      msg: "gdpr_cleanup_poller_started",
      intervalMs: this.intervalMs,
      batchLimit: this.batchLimit,
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((err: unknown) => {
        logger.error({
          msg: "gdpr_cleanup_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  /** Зупиняє loop. Idempotent; чекає поки in-flight tick завершиться. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.running) {
      await new Promise((r) => setTimeout(r, 20));
    }
    this.stopping = false;
    logger.info({ msg: "gdpr_cleanup_poller_stopped" });
  }

  /**
   * Один cleanup-tick: batch-worker + семпл метрик. Public для тестів.
   *
   * Re-entrancy: якщо tick уже запущений (повільні vendor-HTTP-виклики),
   * повторний виклик повертає `null` без блокування — worker-ів lease і так
   * захищає від double-processing, але нема сенсу палити зайвий batch.
   */
  async runOnce(): Promise<ProcessGdprCleanupQueueResult | null> {
    if (this.running || this.stopping) {
      return null;
    }
    this.running = true;
    try {
      const result = await this.processBatch(this.pool, {
        limit: this.batchLimit,
      });
      lastRunAtIso = new Date().toISOString();
      if (result.processed > 0 || result.purged > 0) {
        logger.info({ msg: "gdpr_cleanup_tick", ...result });
      }
      await sampleGdprCleanupQueueDepth(this.pool);
      return result;
    } finally {
      this.running = false;
    }
  }
}

/**
 * Семпл gauge-ів `gdpr_cleanup_queue_depth{status=pending|stuck}`. Помилка
 * семплу — warn, не throw: метрики не мають валити tick, який щойно
 * успішно подренував чергу.
 */
async function sampleGdprCleanupQueueDepth(
  pool: Pick<Pool, "query">,
): Promise<void> {
  try {
    const { rows } = await pool.query<{
      pending: number | string;
      stuck: number | string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE completed_at IS NULL)::bigint AS pending,
         COUNT(*) FILTER (WHERE completed_at IS NULL AND attempts > 5)::bigint AS stuck
       FROM gdpr_cleanup_queue`,
    );
    // Hard Rule #1 — pg віддає bigint як string; коерсимо в number.
    const pending = Number(rows[0]?.pending ?? 0) || 0;
    const stuck = Number(rows[0]?.stuck ?? 0) || 0;
    gdprCleanupQueueDepth.set({ status: "pending" }, pending);
    gdprCleanupQueueDepth.set({ status: "stuck" }, stuck);
  } catch (err) {
    logger.warn({
      msg: "gdpr_cleanup_depth_sample_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Snapshot стану `gdpr_cleanup_queue` для `/health/workers` — та сама роль,
 * що `getMonoEnrichmentWorkerStatus` (`modules/mono/enrichmentWorker.ts`).
 * Один дешевий SQL; на фейлі — `queueDepth: null` + `error`, без throw
 * (health-endpoint має лишатись reachable у DB-incident).
 */
export interface GdprCleanupWorkerStatus {
  enabled: boolean;
  intervalMs: number;
  /** ISO-час останнього успішного tick-а цього процесу; null до першого. */
  lastRunAt: string | null;
  queueDepth: {
    pending: number;
    /** ADR-0016 audit-предикат: completed_at IS NULL AND attempts > 5. */
    stuck: number;
    completed: number;
    total: number;
  } | null;
  error?: string;
}

export async function getGdprCleanupWorkerStatus(
  pool: Pool,
): Promise<GdprCleanupWorkerStatus> {
  const intervalMs = env.GDPR_CLEANUP_POLL_INTERVAL_MS;
  const enabled = intervalMs > 0;
  try {
    const { rows } = await pool.query<{
      pending: number | string;
      stuck: number | string;
      completed: number | string;
      total: number | string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE completed_at IS NULL)::bigint AS pending,
         COUNT(*) FILTER (WHERE completed_at IS NULL AND attempts > 5)::bigint AS stuck,
         COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::bigint AS completed,
         COUNT(*)::bigint AS total
       FROM gdpr_cleanup_queue`,
    );
    const row = rows[0];
    return {
      enabled,
      intervalMs,
      lastRunAt: lastRunAtIso,
      queueDepth: {
        // Hard Rule #1 — bigint → number.
        pending: Number(row?.pending ?? 0) || 0,
        stuck: Number(row?.stuck ?? 0) || 0,
        completed: Number(row?.completed ?? 0) || 0,
        total: Number(row?.total ?? 0) || 0,
      },
    };
  } catch (err) {
    return {
      enabled,
      intervalMs,
      lastRunAt: lastRunAtIso,
      queueDepth: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
