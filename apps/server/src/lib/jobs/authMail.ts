import { Queue, Worker, type Job } from "bullmq";
import type { Redis as IORedisClient } from "ioredis";

import { logger, serializeError } from "../../obs/logger.js";
import {
  authMailJobsEnqueuedTotal,
  authMailJobsProcessedTotal,
  authMailJobDurationMs,
  authMailQueueDepth,
} from "../../obs/metrics.js";
import { elapsedMs } from "../timing.js";
import {
  AUTH_MAIL_QUEUE_NAME,
  BULLMQ_QUEUE_PREFIX,
  createBullConnection,
} from "./connection.js";

/**
 * BullMQ-based durable queue для транзакційних листів Better Auth
 * (password reset / email verification). Замінює fire-and-forget
 * `void dispatchAuthTransactionalEmail(...).catch()` патерн.
 *
 * Чому durable: лист на reset-password — це **критичний** шлях. Якщо
 * Resend поверне 5xx або сервер впаде між Better-Auth-callback-ом і
 * fetch-ом, юзер залишається без листа і застряє у "перевірте пошту"
 * без жодного шансу логіна. До цього модуля такі помилки взагалі не
 * ретраїлись (catch-all лог + забути).
 *
 * Поведінка:
 * - Якщо `REDIS_URL` заданий → BullMQ Queue + Worker, з ретраями та
 *   exponential-backoff. Ретраїться **тільки** транзієнтний клас помилок
 *   (5xx, 429, network). 4xx (invalid email, blocked domain) — без ретраю.
 * - Якщо `REDIS_URL` НЕ заданий (локальний dev без redis) → in-process
 *   direct dispatch (старий fire-and-forget patten). Це збережено навмисно,
 *   щоб локальний `pnpm dev:server` не вимагав docker.
 *
 * Тести: `authMail.test.ts` мокає Queue/Worker і перевіряє контракт
 * (job-data, retry-config, processor-outcome).
 */

export interface AuthMailJobData {
  kind: "password_reset" | "email_verification";
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Класифікує помилку Resend на retryable / non-retryable.
 * Ретраїмо: 429, 5xx, network. Не ретраїмо: 400, 401, 403, 422 — це
 * permanent помилки конфігурації (bad email, blocked domain тощо), які
 * не виправити повторною спробою.
 */
export function isRetryableMailError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Дефолтно ретраїмо все, що НЕ виглядає як 4xx.
  // Resend errors з `dispatchAuthTransactionalEmail` мають форму
  // `Resend HTTP 503: ...`.
  const m = /Resend HTTP (\d{3})/.exec(msg);
  if (!m) return true;
  const status = Number(m[1]);
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

interface AuthMailDispatcher {
  (data: AuthMailJobData): Promise<void>;
}

/**
 * Singleton-стан модуля. Інкапсульовано так, щоб тести могли скинути
 * стан між кейсами через `__resetAuthMailQueueForTesting()`.
 */
interface AuthMailModuleState {
  queue: Queue<AuthMailJobData> | null;
  worker: Worker<AuthMailJobData> | null;
  // BullMQ ДОКУМЕНТОВАНО НЕ закриває connection-и, які були передані
  // як `{ connection }` (від disconnects лише свої внутрішні duplicate-и).
  // Тримаємо ref-и самі і quit()-имо їх у closeAuthMailModule(), інакше
  // вони висять open handles до `process.exit()`.
  queueConnection: IORedisClient | null;
  workerConnection: IORedisClient | null;
  dispatcher: AuthMailDispatcher | null;
  inflightFallbacks: Set<Promise<void>>;
}

const state: AuthMailModuleState = {
  queue: null,
  worker: null,
  queueConnection: null,
  workerConnection: null,
  dispatcher: null,
  inflightFallbacks: new Set(),
};

/**
 * Реєструє реальний sender. Викликається з `email/authTransactionalMail.ts`,
 * щоб уникнути circular import (worker → mail-dispatch → metrics).
 */
export function registerAuthMailDispatcher(fn: AuthMailDispatcher): void {
  state.dispatcher = fn;
}

/**
 * Lazy-init BullMQ Queue. Повертає null, якщо Redis недоступний — caller
 * має fallback-шлях.
 */
function getOrCreateAuthMailQueue(): Queue<AuthMailJobData> | null {
  if (state.queue) return state.queue;

  const connection = createBullConnection("auth-mail-queue");
  if (!connection) return null;
  state.queueConnection = connection;

  state.queue = new Queue<AuthMailJobData>(AUTH_MAIL_QUEUE_NAME, {
    connection,
    prefix: BULLMQ_QUEUE_PREFIX,
    defaultJobOptions: {
      // 5 спроб: миттєво → 5min → 30min → 2h → 6h. Сумарно ~9 годин.
      attempts: 5,
      backoff: { type: "exponential", delay: 5 * 60_000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });

  state.queue.on("error", (err) => {
    logger.warn({
      msg: "auth_mail_queue_error",
      err: serializeError(err, { includeStack: false }),
    });
  });

  return state.queue;
}

/**
 * Public API для callsite-ів (Better Auth callback-ів).
 * Не throw-ить — failure-режим = log + drop (як було раніше з catch-all).
 * Caller (Better Auth) НЕ блокується ні на секунду.
 */
export async function enqueueAuthMail(data: AuthMailJobData): Promise<void> {
  const queue = getOrCreateAuthMailQueue();

  if (!queue) {
    // Fallback: in-process direct dispatch. Збережено для dev-без-redis і
    // для CI / тестів, де REDIS_URL не задається.
    if (!state.dispatcher) {
      logger.error({
        msg: "auth_mail_no_dispatcher_registered",
        kind: data.kind,
      });
      return;
    }
    const fallbackPromise = state.dispatcher(data).catch((err: unknown) => {
      logger.error({
        msg: "auth_mail_fallback_failed",
        kind: data.kind,
        err: serializeError(err, { includeStack: false }),
      });
    });
    state.inflightFallbacks.add(fallbackPromise);
    fallbackPromise.finally(() =>
      state.inflightFallbacks.delete(fallbackPromise),
    );
    authMailJobsEnqueuedTotal.inc({ mode: "fallback" });
    return;
  }

  try {
    await queue.add(data.kind, data, {
      // jobId дедуплікує idempotently: якщо BullMQ вже бачив цей kind+to у
      // recent-window, новий enqueue буде no-op. Without it Better Auth
      // подвійним кліком "send reset link" створив би 2 листи.
      // 60s window: достатньо для подвійних кліків, але не для legitimate
      // re-send через 5 хвилин.
      jobId: `${data.kind}:${data.to.toLowerCase()}:${Math.floor(Date.now() / 60_000)}`,
    });
    authMailJobsEnqueuedTotal.inc({ mode: "queued" });
  } catch (err) {
    logger.error({
      msg: "auth_mail_enqueue_failed",
      kind: data.kind,
      err: serializeError(err, { includeStack: false }),
    });
    authMailJobsEnqueuedTotal.inc({ mode: "enqueue_error" });
    // Якщо BullMQ-add помер (Redis-down) — не залишаємо юзера без листа,
    // спробуємо direct-dispatch як best-effort.
    if (state.dispatcher) {
      void state.dispatcher(data).catch((dispatchErr: unknown) => {
        logger.error({
          msg: "auth_mail_fallback_after_enqueue_failed",
          kind: data.kind,
          err: serializeError(dispatchErr, { includeStack: false }),
        });
      });
    }
  }
}

/**
 * Worker processor — чиста функція, тестована окремо без Redis.
 * Throw → BullMQ ретраїтиме (тільки якщо `isRetryableMailError`).
 * Resolve → job done.
 */
export async function processAuthMailJob(
  job: Pick<Job<AuthMailJobData>, "data" | "attemptsMade" | "name">,
): Promise<void> {
  if (!state.dispatcher) {
    throw new Error(
      "processAuthMailJob: dispatcher not registered. Call registerAuthMailDispatcher() at boot.",
    );
  }
  const startedAt = process.hrtime.bigint();
  try {
    await state.dispatcher(job.data);
    authMailJobsProcessedTotal.inc({ outcome: "ok" });
    authMailJobDurationMs.observe({ outcome: "ok" }, elapsedMs(startedAt));
  } catch (err) {
    const retryable = isRetryableMailError(err);
    authMailJobsProcessedTotal.inc({
      outcome: retryable ? "retry" : "permanent_fail",
    });
    authMailJobDurationMs.observe(
      { outcome: retryable ? "retry" : "permanent_fail" },
      elapsedMs(startedAt),
    );
    if (!retryable) {
      // Ковтаємо помилку — BullMQ помітить job як completed, без ретраю.
      logger.error({
        msg: "auth_mail_permanent_failure",
        kind: job.data.kind,
        attempt: job.attemptsMade,
        err: serializeError(err, { includeStack: false }),
      });
      return;
    }
    // Re-throw → BullMQ retry з backoff.
    throw err;
  }
}

export interface StartedAuthMailWorker {
  /** Очікує inflight job-и і закриває Worker + Queue connections. */
  close(): Promise<void>;
}

/**
 * Стартує BullMQ Worker. Повертає null, якщо Redis недоступний — caller
 * (`index.ts`) розуміє, що працюємо у fallback-режимі.
 *
 * Викликається ОДИН раз на старті процесу. Multi-replica-safe: BullMQ сам
 * lease-ить job-и атомарно через Redis.
 */
export function startAuthMailWorker(): StartedAuthMailWorker | null {
  if (state.worker) return { close: () => closeAuthMailModule() };

  const connection = createBullConnection("auth-mail-worker");
  if (!connection) return null;
  state.workerConnection = connection;

  state.worker = new Worker<AuthMailJobData>(
    AUTH_MAIL_QUEUE_NAME,
    processAuthMailJob,
    {
      connection,
      prefix: BULLMQ_QUEUE_PREFIX,
      concurrency: 5,
      // Якщо job впав, BullMQ затримує наступну спробу за `backoff` policy
      // з `defaultJobOptions`.
    },
  );

  state.worker.on("failed", (job, err) => {
    logger.warn({
      msg: "auth_mail_job_failed",
      kind: job?.data.kind,
      attempt: job?.attemptsMade,
      err: serializeError(err, { includeStack: false }),
    });
  });

  // Periodic depth sampling. Не on-event, бо BullMQ не emit-ить per-state
  // зміни доступно — простіше polling.
  const sampleInterval = setInterval(() => {
    void sampleAuthMailQueueDepth().catch(() => {
      /* metrics-only, ignore */
    });
  }, 30_000);
  if (typeof sampleInterval.unref === "function") sampleInterval.unref();

  return {
    async close() {
      clearInterval(sampleInterval);
      await closeAuthMailModule();
    },
  };
}

async function sampleAuthMailQueueDepth(): Promise<void> {
  if (!state.queue) return;
  const counts = await state.queue.getJobCounts(
    "waiting",
    "active",
    "delayed",
    "failed",
  );
  authMailQueueDepth.reset();
  for (const [status, count] of Object.entries(counts)) {
    authMailQueueDepth.set({ status }, count ?? 0);
  }
}

async function closeAuthMailModule(): Promise<void> {
  // Дочекатись inflight fallback-dispatch-ів — у кейсі коли Redis відсутній
  // взагалі. У normal-mode цей set порожній.
  if (state.inflightFallbacks.size > 0) {
    await Promise.allSettled([...state.inflightFallbacks]);
  }

  if (state.worker) {
    try {
      await state.worker.close();
    } catch (err) {
      logger.warn({
        msg: "auth_mail_worker_close_error",
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
        msg: "auth_mail_queue_close_error",
        err: serializeError(err, { includeStack: false }),
      });
    }
    state.queue = null;
  }

  // BullMQ.close() НЕ закриває externally-provided ioredis-connection-и
  // (які ми самі створили через createBullConnection). Без quit() вони
  // висіли б open handles до самого process.exit() (vitest-handle-leak +
  // брудний shutdown на Railway).
  await closeBullConnection(state.workerConnection, "auth-mail-worker");
  state.workerConnection = null;
  await closeBullConnection(state.queueConnection, "auth-mail-queue");
  state.queueConnection = null;
}

async function closeBullConnection(
  connection: IORedisClient | null,
  name: string,
): Promise<void> {
  if (!connection) return;
  try {
    // quit() відправляє QUIT-команду і чекає ack-у. Якщо Redis вже
    // недоступний або сокет порваний — quit() режектить, є fallback
    // на disconnect() (форсує close без graceful-handshake-у).
    await connection.quit();
  } catch {
    try {
      connection.disconnect();
    } catch (err) {
      logger.warn({
        msg: "auth_mail_connection_close_error",
        connection: name,
        err: serializeError(err, { includeStack: false }),
      });
    }
  }
}

/**
 * ТІЛЬКИ для тестів — скидає module-state так, щоб vi.resetModules() не
 * потрібен. Не експортується у production-код-paths.
 */
export function __resetAuthMailQueueForTesting(): void {
  state.queue = null;
  state.worker = null;
  state.queueConnection = null;
  state.workerConnection = null;
  state.dispatcher = null;
  state.inflightFallbacks.clear();
}
