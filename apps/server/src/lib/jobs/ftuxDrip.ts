import { Queue, Worker, type Job } from "bullmq";
import type { Redis as IORedisClient } from "ioredis";

import { logger, serializeError } from "../../obs/logger.js";
import {
  ftuxDripJobsEnqueuedTotal,
  ftuxDripJobsProcessedTotal,
  ftuxDripJobDurationMs,
  ftuxDripQueueDepth,
} from "../../obs/metrics.js";
import { elapsedMs } from "../timing.js";
import { BULLMQ_QUEUE_PREFIX, createBullConnection } from "./connection.js";

/**
 * Durable BullMQ-черга для FTUX-drip-листів (Day 0 / 1 / 3).
 *
 * Архітектурний зеркало `auth-mail`-черги (`./authMail.ts`), але з трьома
 * різницями:
 *   1. Job-name відповідає дню (`day_0|day_1|day_3`) і несе `day` всередині
 *      payload-у — потрібно для метрик і diff-копії.
 *   2. Day 1 / Day 3 enqueue-ються з `delay`-ом 24h / 72h. Worker BullMQ
 *      сам бере promote-делейених за допомогою власного scheduler-а.
 *   3. Без `REDIS_URL`: Day 0 шлеться синхронно через registered-dispatcher,
 *      Day 1 / Day 3 ПРОПУСКАЮТЬСЯ із warn-логом + counter
 *      `ftux_drip_jobs_enqueued_total{mode="skipped_no_redis"}`. Це fail-safe:
 *      нам не потрібна полу-функціональна in-memory-черга, яка втрачає
 *      job-и на рестарті процесу.
 *
 * Idempotency: jobId зашиває `userId` + `day` + bucket по даті — два enqueue-и
 * для одного й того ж юзера-дня (повторне натискання "sign-up" на стороні
 * клієнта, race у Better Auth callback-ах) колапсуються в один job.
 *
 * Класифікація помилок зеркальна `auth-mail`: 4xx — permanent, 5xx/429/network
 * — retryable. Skip-причини (opt-out, already-sent, user-deleted) проходять
 * як `FtuxDripSkip` і завершують job як completed з відповідним outcome-ом.
 */

export type FtuxDripDay = "day_0" | "day_1" | "day_3";

export interface FtuxDripJobData {
  kind: "ftux_drip";
  day: FtuxDripDay;
  userId: string;
  email: string;
  /** Затримка з моменту enqueue до execute. Day 0 = 0; Day 1 = 24h; Day 3 = 72h. */
  delayMs: number;
  /** Опціональний variant для A/B (в S5 поки що не виставляємо). */
  variant?: string;
}

interface FtuxDripDispatcher {
  (data: FtuxDripJobData): Promise<void>;
}

interface FtuxDripModuleState {
  queue: Queue<FtuxDripJobData> | null;
  worker: Worker<FtuxDripJobData> | null;
  queueConnection: IORedisClient | null;
  workerConnection: IORedisClient | null;
  dispatcher: FtuxDripDispatcher | null;
  inflightFallbacks: Set<Promise<void>>;
}

const state: FtuxDripModuleState = {
  queue: null,
  worker: null,
  queueConnection: null,
  workerConnection: null,
  dispatcher: null,
  inflightFallbacks: new Set(),
};

export const FTUX_DRIP_QUEUE_NAME = "ftux-drip";

/**
 * Класифікує помилку Resend на retryable / non-retryable. Зеркало логіки
 * у `authMail.ts#isRetryableMailError`. 5xx, 429, network (без HTTP-status
 * у meaning-ʼу) — retry; 4xx — permanent.
 */
export function isRetryableFtuxDripError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /Resend HTTP (\d{3})/.exec(msg);
  if (!m) return true;
  const status = Number(m[1]);
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

export function registerFtuxDripDispatcher(fn: FtuxDripDispatcher): void {
  state.dispatcher = fn;
}

function getOrCreateFtuxDripQueue(): Queue<FtuxDripJobData> | null {
  if (state.queue) return state.queue;

  const connection = createBullConnection("ftux-drip-queue");
  if (!connection) return null;
  state.queueConnection = connection;

  state.queue = new Queue<FtuxDripJobData>(FTUX_DRIP_QUEUE_NAME, {
    connection,
    prefix: BULLMQ_QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: 5,
      // 5 спроб: миттєво → 5min → 30min → 2h → 6h. Сумарно ~9 годин.
      backoff: { type: "exponential", delay: 5 * 60_000 },
      // Day 3 = 72h: тримаємо completed-job-и до 7 днів, щоб
      // post-mortem-діагностика по drop-off-у мала повну історію.
      removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });

  state.queue.on("error", (err) => {
    logger.warn({
      msg: "ftux_drip_queue_error",
      err: serializeError(err, { includeStack: false }),
    });
  });

  return state.queue;
}

/**
 * Дедуплікаційний jobId. Бакетимо по `Math.floor(now/60_000)` тільки для
 * Day 0 (immediate) — щоб подвійний sign-up callback не створював 2 job-и.
 * Для Day 1 / Day 3 беремо просто `userId+day` — delay-job-и enqueue-ються
 * рівно один раз на user-creation, повторного callback-у не буває
 * (унікальний primary key на `user.id`).
 */
function buildJobId(data: FtuxDripJobData): string {
  if (data.day === "day_0") {
    const minute = Math.floor(Date.now() / 60_000);
    return `${data.day}:${data.userId}:${minute}`;
  }
  return `${data.day}:${data.userId}`;
}

/**
 * Public API: enqueue одного drip-job-а.
 * Caller-сценарії — `email/ftuxDripMail.ts#queueFtuxDripForNewUser` (3 виклики
 * на user creation). Не throw-ить — fail-mode = log + drop.
 */
export async function enqueueFtuxDripMail(
  data: FtuxDripJobData,
): Promise<void> {
  const queue = getOrCreateFtuxDripQueue();

  if (!queue) {
    // Fallback: in-process direct dispatch ТІЛЬКИ для Day 0. Day 1 / 3
    // потребують persistence — skip із warn.
    if (data.day !== "day_0") {
      logger.warn({
        msg: "ftux_drip_skipped_no_redis_persistence",
        day: data.day,
        userId: data.userId,
      });
      ftuxDripJobsEnqueuedTotal.inc({
        mode: "skipped_no_redis",
        day: data.day,
      });
      return;
    }

    if (!state.dispatcher) {
      logger.error({
        msg: "ftux_drip_no_dispatcher_registered",
        day: data.day,
      });
      return;
    }

    const fallbackPromise = state.dispatcher(data).catch((err: unknown) => {
      // FtuxDripSkip (opt-out / already-sent / user-deleted) — не помилка.
      // Identifying without import-cycle: класова назва `FtuxDripSkip` +
      // `outcome`-property. Інакше будь-яка помилка вважається retry-кандидатом.
      const skipOutcome =
        err && typeof err === "object" && "outcome" in err
          ? String((err as { outcome?: unknown }).outcome)
          : null;
      if (
        skipOutcome === "skipped_optout" ||
        skipOutcome === "skipped_already_sent" ||
        skipOutcome === "skipped_user_deleted"
      ) {
        ftuxDripJobsProcessedTotal.inc({ outcome: skipOutcome, day: data.day });
        return;
      }
      logger.error({
        msg: "ftux_drip_fallback_failed",
        day: data.day,
        err: serializeError(err, { includeStack: false }),
      });
      ftuxDripJobsProcessedTotal.inc({
        outcome: isRetryableFtuxDripError(err) ? "retry" : "permanent_fail",
        day: data.day,
      });
    });

    state.inflightFallbacks.add(fallbackPromise);
    fallbackPromise.finally(() =>
      state.inflightFallbacks.delete(fallbackPromise),
    );
    ftuxDripJobsEnqueuedTotal.inc({ mode: "fallback", day: data.day });
    return;
  }

  try {
    await queue.add(data.day, data, {
      jobId: buildJobId(data),
      delay: data.delayMs > 0 ? data.delayMs : undefined,
    });
    ftuxDripJobsEnqueuedTotal.inc({ mode: "queued", day: data.day });
  } catch (err) {
    logger.error({
      msg: "ftux_drip_enqueue_failed",
      day: data.day,
      err: serializeError(err, { includeStack: false }),
    });
    ftuxDripJobsEnqueuedTotal.inc({ mode: "enqueue_error", day: data.day });
    // Best-effort fallback ТІЛЬКИ для Day 0 (delayed-job-и не мають де
    // жити локально, тому втрата кращ-foe ніж синхронний send not-yet-due).
    if (data.day === "day_0" && state.dispatcher) {
      void state.dispatcher(data).catch((dispatchErr: unknown) => {
        logger.error({
          msg: "ftux_drip_fallback_after_enqueue_failed",
          day: data.day,
          err: serializeError(dispatchErr, { includeStack: false }),
        });
      });
    }
  }
}

/**
 * Worker processor — чиста функція, тестована окремо без Redis.
 *
 * Throw → BullMQ ретраїтиме (тільки якщо `isRetryableFtuxDripError`).
 * Resolve → job done.
 *
 * `FtuxDripSkip` (opt-out / already-sent / user-deleted) — soft-skip:
 * не throw-имо, інкрементимо outcome-counter і виходимо.
 */
export async function processFtuxDripJob(
  job: Pick<Job<FtuxDripJobData>, "data" | "attemptsMade" | "name">,
): Promise<void> {
  if (!state.dispatcher) {
    throw new Error(
      "processFtuxDripJob: dispatcher not registered. Call registerFtuxDripDispatcher() at boot.",
    );
  }
  const startedAt = process.hrtime.bigint();
  try {
    await state.dispatcher(job.data);
    ftuxDripJobsProcessedTotal.inc({ outcome: "ok", day: job.data.day });
    ftuxDripJobDurationMs.observe(
      { outcome: "ok", day: job.data.day },
      elapsedMs(startedAt),
    );
  } catch (err) {
    // Soft-skip (opt-out / idempotency / user-deleted).
    const skipOutcome =
      err && typeof err === "object" && "outcome" in err
        ? String((err as { outcome?: unknown }).outcome)
        : null;
    if (
      skipOutcome === "skipped_optout" ||
      skipOutcome === "skipped_already_sent" ||
      skipOutcome === "skipped_user_deleted"
    ) {
      ftuxDripJobsProcessedTotal.inc({
        outcome: skipOutcome,
        day: job.data.day,
      });
      ftuxDripJobDurationMs.observe(
        { outcome: skipOutcome, day: job.data.day },
        elapsedMs(startedAt),
      );
      return;
    }

    const retryable = isRetryableFtuxDripError(err);
    ftuxDripJobsProcessedTotal.inc({
      outcome: retryable ? "retry" : "permanent_fail",
      day: job.data.day,
    });
    ftuxDripJobDurationMs.observe(
      { outcome: retryable ? "retry" : "permanent_fail", day: job.data.day },
      elapsedMs(startedAt),
    );
    if (!retryable) {
      logger.error({
        msg: "ftux_drip_permanent_failure",
        day: job.data.day,
        attempt: job.attemptsMade,
        err: serializeError(err, { includeStack: false }),
      });
      return;
    }
    throw err;
  }
}

export interface StartedFtuxDripWorker {
  close(): Promise<void>;
}

export function startFtuxDripWorker(): StartedFtuxDripWorker | null {
  if (state.worker) return { close: () => closeFtuxDripModule() };

  const connection = createBullConnection("ftux-drip-worker");
  if (!connection) return null;
  state.workerConnection = connection;

  state.worker = new Worker<FtuxDripJobData>(
    FTUX_DRIP_QUEUE_NAME,
    processFtuxDripJob,
    {
      connection,
      prefix: BULLMQ_QUEUE_PREFIX,
      // 3 одночасно: drip-листи легкі, але мережевий fetch до Resend
      // витягує main-loop, не хочеться займати весь worker-pool у
      // sustained-burst-і (наприклад, при back-fill-у legacy-юзерів).
      concurrency: 3,
    },
  );

  state.worker.on("failed", (job, err) => {
    logger.warn({
      msg: "ftux_drip_job_failed",
      day: job?.data.day,
      attempt: job?.attemptsMade,
      err: serializeError(err, { includeStack: false }),
    });
  });

  const sampleInterval = setInterval(() => {
    void sampleFtuxDripQueueDepth().catch(() => {
      /* metrics-only, ignore */
    });
  }, 30_000);
  if (typeof sampleInterval.unref === "function") sampleInterval.unref();

  return {
    async close() {
      clearInterval(sampleInterval);
      await closeFtuxDripModule();
    },
  };
}

async function sampleFtuxDripQueueDepth(): Promise<void> {
  if (!state.queue) return;
  const counts = await state.queue.getJobCounts(
    "waiting",
    "active",
    "delayed",
    "failed",
  );
  ftuxDripQueueDepth.reset();
  for (const [status, count] of Object.entries(counts)) {
    ftuxDripQueueDepth.set({ status }, count ?? 0);
  }
}

async function closeFtuxDripModule(): Promise<void> {
  if (state.inflightFallbacks.size > 0) {
    await Promise.allSettled([...state.inflightFallbacks]);
  }
  if (state.worker) {
    try {
      await state.worker.close();
    } catch (err) {
      logger.warn({
        msg: "ftux_drip_worker_close_error",
        err: serializeError(err, { includeStack: false }),
      });
    }
    state.worker = null;
  }
  if (state.queue) {
    try {
      await state.queue.close();
    } catch (err) {
      logger.warn({
        msg: "ftux_drip_queue_close_error",
        err: serializeError(err, { includeStack: false }),
      });
    }
    state.queue = null;
  }
  await closeBullConnection(state.workerConnection, "ftux-drip-worker");
  state.workerConnection = null;
  await closeBullConnection(state.queueConnection, "ftux-drip-queue");
  state.queueConnection = null;
}

async function closeBullConnection(
  connection: IORedisClient | null,
  name: string,
): Promise<void> {
  if (!connection) return;
  try {
    await connection.quit();
  } catch {
    try {
      connection.disconnect();
    } catch (err) {
      logger.warn({
        msg: "ftux_drip_connection_close_error",
        connection: name,
        err: serializeError(err, { includeStack: false }),
      });
    }
  }
}

/** ТІЛЬКИ для тестів. */
export function __resetFtuxDripQueueForTesting(): void {
  state.queue = null;
  state.worker = null;
  state.queueConnection = null;
  state.workerConnection = null;
  state.dispatcher = null;
  state.inflightFallbacks.clear();
}
