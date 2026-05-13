/**
 * Async-черга AI memory ingestion (PR2 з ADR-0028). Producer-и (mono-webhook,
 * weekly-digest, `POST /api/ai-memory/ingest`) ставлять `MemoryIngestPayload`
 * у BullMQ; worker викликає `aiMemory.remember()`, що робить Voyage embed +
 * pgvector upsert.
 *
 * Чому окрема BullMQ-черга, а не дзвінок `aiMemory.remember()` синхронно з
 * хендлера:
 *   1. Voyage HTTP timeout — 15с. Mono-webhook має відповісти за <2с (інакше
 *      Monobank деактивує endpoint). Тому не можемо ні await-ити, ні
 *      fire-and-forget у самій request-функції — крах процесу втратить дані.
 *   2. Retry policy. Voyage 5xx / rate-limit потребують exponential-backoff;
 *      синхронний await-loop у webhook-у зовсім не варіант.
 *   3. Source-deduplication. BullMQ `jobId = ${userId}:${source}:${sourceRef}`
 *      природно зливає дублі (повторна доставка transaction-у з webhook,
 *      retry digest-у з n8n). PR1-міграція має ще й SQL-UNIQUE-індекс на
 *      `(user_id, source, source_ref) WHERE source_ref IS NOT NULL` як другий
 *      шар захисту.
 *   4. Multi-replica safety. У production двоє API-replic-ів обоє можуть
 *      enqueue-нути той самий job через одночасно прийнятий webhook (Monobank
 *      ретраїть на TCP-rest). BullMQ-jobId-dedup ловить це у Redis-і атомарно.
 *
 * Fallback (REDIS_URL не задано — local dev / CI без Redis): in-process
 * direct dispatch, аналогічно `authMail.ts`. Якщо `AI_MEMORY_ENABLED=false`
 * — взагалі ніяких дзвінків (no-op).
 */

import { Queue, Worker, type Job } from "bullmq";
import type { Redis as IORedisClient } from "ioredis";

import { env } from "../../env.js";
import { isKillSwitchActive } from "../../lib/featureFlags/runtimeKillSwitch.js";
import {
  AI_MEMORY_INGEST_QUEUE_NAME,
  BULLMQ_QUEUE_PREFIX,
  createBullConnection,
} from "../../lib/jobs/connection.js";
import { logger, serializeError } from "../../obs/logger.js";
import {
  aiMemoryIngestEnqueuedTotal,
  aiMemoryIngestProcessedTotal,
  aiMemoryIngestDurationMs,
  aiMemoryIngestQueueDepth,
} from "../../obs/metrics.js";
import { elapsedMs } from "../../lib/timing.js";
import { getAiMemory } from "./bootstrap.js";
import { MissingVoyageApiKeyError, VoyageHttpError } from "./embeddings.js";
import type { AiMemoryService } from "./service.js";
import { ALLOWED_MEMORY_SOURCES, type MemorySource } from "./types.js";

/**
 * Payload одного ingest-job-у. Cіро дзеркалить `RememberInput` з
 * `service.ts`, але декомпонується по полях замість nested objects, щоб
 * BullMQ-серіалізатор (JSON) не страждав від зайвого vinetти-у.
 */
export interface MemoryIngestPayload {
  userId: string;
  source: MemorySource;
  /**
   * Зовнішній id у домені (mono_tx_id для finyk, week_key для digest, null
   * для chat). При наявності — використовується для idempotent jobId, тож
   * повторні enqueue (webhook retry) дедуплікуються у BullMQ.
   */
  sourceRef: string | null;
  content: string;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Класифікує помилку embed/upsert-у на retryable / non-retryable.
 * Ретраїмо: 429, 5xx, network, abort/timeout. Не ретраїмо: відсутній
 * API key (manual fix), 4xx (квота/auth) — повторна спроба нічого не
 * змінить, тільки палить квоту.
 */
export function isRetryableIngestError(err: unknown): boolean {
  if (err instanceof MissingVoyageApiKeyError) return false;
  if (err instanceof VoyageHttpError) {
    const status = err.status;
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }
  // Network/abort/timeout/інше — ретраїмо.
  return true;
}

/**
 * Singleton-стан модуля. Інкапсульовано так, щоб тести могли скинути
 * стан через `__resetMemoryIngestQueueForTesting()`.
 */
interface MemoryIngestModuleState {
  queue: Queue<MemoryIngestPayload> | null;
  worker: Worker<MemoryIngestPayload> | null;
  // BullMQ не закриває externally-наданий ioredis — тримаємо ref-и самі
  // і quit()-имо у `closeMemoryIngestModule()`. Інакше vitest leaks-перевірка
  // показує open handles, а Railway shutdown — брудний.
  queueConnection: IORedisClient | null;
  workerConnection: IORedisClient | null;
  // Fallback-direct-dispatch promise pool — те саме рішення, що й у
  // authMail.ts, щоб closeMemoryIngestModule() дочекався inflight job-ів.
  inflightFallbacks: Set<Promise<void>>;
  // Override service для тестів. У production lazy-резольвиться через
  // getAiMemory().
  serviceOverride: AiMemoryService | null;
}

const state: MemoryIngestModuleState = {
  queue: null,
  worker: null,
  queueConnection: null,
  workerConnection: null,
  inflightFallbacks: new Set(),
  serviceOverride: null,
};

function getService(): AiMemoryService {
  return state.serviceOverride ?? getAiMemory();
}

/**
 * Lazy-init BullMQ Queue. Повертає null, якщо Redis недоступний — caller
 * має fallback-шлях через `enqueueMemoryIngest`.
 */
function getOrCreateMemoryIngestQueue(): Queue<MemoryIngestPayload> | null {
  if (state.queue) return state.queue;

  const connection = createBullConnection("ai-memory-ingest-queue");
  if (!connection) return null;
  state.queueConnection = connection;

  state.queue = new Queue<MemoryIngestPayload>(AI_MEMORY_INGEST_QUEUE_NAME, {
    connection,
    prefix: BULLMQ_QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: env.AI_MEMORY_INGEST_ATTEMPTS,
      // Exponential: 30s → 2min → 8min → 32min → 2h. Сумарно ~2.5h —
      // достатньо щоб пережити Voyage incident на 1–2h без втрати job-у.
      backoff: { type: "exponential", delay: 30 * 1000 },
      // Completed чистимо рано (24h) — successful row уже у `ai_memories`.
      // Failed тримаємо 14 днів для розборів інцидентів.
      removeOnComplete: { age: 24 * 3600, count: 500 },
      removeOnFail: { age: 14 * 24 * 3600 },
    },
  });

  state.queue.on("error", (err) => {
    logger.warn({
      msg: "ai_memory_ingest_queue_error",
      err: serializeError(err, { includeStack: false }),
    });
  });

  return state.queue;
}

/**
 * Будує idempotent jobId. Для job-ів із `sourceRef` дублі дедуплікуються
 * за (user, source, ref); без `sourceRef` (наприклад, чатові ingest-и без
 * stable id) — генерується unique id, бо two кліки `Send` мають створити
 * два окремих memories.
 */
function buildJobId(payload: MemoryIngestPayload): string | undefined {
  if (payload.sourceRef == null) return undefined;
  // Не використовуємо `:` як роздільник — він валідний у jobId, але
  // у логах і UI BullMQ зручніше читати з `__`. URL-safe.
  return `${payload.userId}__${payload.source}__${payload.sourceRef}`;
}

/**
 * Перевіряє source проти allow-list. Не покладаємось на TS union у runtime —
 * payload приходить з HTTP / webhook-ів. Defence in depth: SQL-CHECK у PR1
 * `025_ai_memories_pgvector.sql` теж відкине поганий source, але хочемо
 * швидко на edge.
 */
function assertValidSource(source: string): asserts source is MemorySource {
  if (!ALLOWED_MEMORY_SOURCES.includes(source as MemorySource)) {
    throw new Error(`Invalid memory source: ${source}`);
  }
}

/**
 * Public API для callsite-ів (хуки + endpoint). Не throw-ить — failure
 * mode = log + drop, щоб mono-webhook / digest-handler ніколи не падали
 * через memory-ingestion. Caller блокується <1мс (just-Redis-RTT).
 */
export async function enqueueMemoryIngest(
  payload: MemoryIngestPayload,
): Promise<void> {
  const sourceLabel = payload.source;
  // Coarse-validation. Жорстка валідація content/length — у callsite-ах
  // (endpoint застосовує zod-schema, hooks обмежують довжину).
  try {
    assertValidSource(payload.source);
  } catch (err) {
    aiMemoryIngestEnqueuedTotal.inc({
      mode: "enqueue_error",
      source: "unknown",
    });
    logger.warn({
      msg: "ai_memory_ingest_invalid_source",
      source: payload.source,
      err: serializeError(err, { includeStack: false }),
    });
    return;
  }

  if (!payload.userId || payload.content.length === 0) {
    aiMemoryIngestEnqueuedTotal.inc({
      mode: "enqueue_error",
      source: sourceLabel,
    });
    logger.warn({
      msg: "ai_memory_ingest_empty_payload",
      userId: payload.userId,
      source: sourceLabel,
      contentLen: payload.content.length,
    });
    return;
  }

  if (!env.AI_MEMORY_ENABLED) {
    aiMemoryIngestEnqueuedTotal.inc({ mode: "disabled", source: sourceLabel });
    logger.debug({
      msg: "ai_memory_ingest_skipped_disabled",
      source: sourceLabel,
    });
    return;
  }

  // Per-source kill-switch (PR-19). Поки що тільки `finyk` (Mono
  // webhook) gate-нутий — інші source-и контролюються виключно
  // master-flag-ом `AI_MEMORY_ENABLED`. Перевірка живе тут (а не у
  // `webhook.ts`), щоб майбутні per-source flags для digest/chat
  // додавались в одному місці, з тим самим metric shape
  // (`mode="source_disabled"`).
  //
  // Runtime kill-switch (RAG eval automation post-PR-20): якщо weekly
  // recall@4 < 0.4 → `POST /api/internal/eval/rag-weekly` активує
  // in-memory kill-switch `mono_ai_memory_ingest`, який перебиває env
  // до process-restart. Реальний permanent flip env-у на Railway —
  // operator-task per runbook § «RagQualityGateKillSwitch».
  if (
    payload.source === "finyk" &&
    (!env.MONO_AI_MEMORY_INGEST_ENABLED ||
      isKillSwitchActive("mono_ai_memory_ingest"))
  ) {
    aiMemoryIngestEnqueuedTotal.inc({
      mode: "source_disabled",
      source: sourceLabel,
    });
    logger.debug({
      msg: "ai_memory_ingest_skipped_source_disabled",
      source: sourceLabel,
      killSwitch: isKillSwitchActive("mono_ai_memory_ingest"),
    });
    return;
  }

  const queue = getOrCreateMemoryIngestQueue();

  if (!queue) {
    // Fallback direct dispatch (Redis unavailable — local dev або incident).
    const fallbackPromise = runDirectDispatch(payload).catch((err: unknown) => {
      logger.error({
        msg: "ai_memory_ingest_fallback_failed",
        source: sourceLabel,
        userId: payload.userId,
        err: serializeError(err, { includeStack: false }),
      });
    });
    state.inflightFallbacks.add(fallbackPromise);
    fallbackPromise.finally(() =>
      state.inflightFallbacks.delete(fallbackPromise),
    );
    aiMemoryIngestEnqueuedTotal.inc({ mode: "fallback", source: sourceLabel });
    return;
  }

  try {
    const jobId = buildJobId(payload);
    await queue.add(
      payload.source,
      payload,
      jobId === undefined ? {} : { jobId },
    );
    aiMemoryIngestEnqueuedTotal.inc({ mode: "queued", source: sourceLabel });
  } catch (err) {
    logger.error({
      msg: "ai_memory_ingest_enqueue_failed",
      source: sourceLabel,
      userId: payload.userId,
      err: serializeError(err, { includeStack: false }),
    });
    aiMemoryIngestEnqueuedTotal.inc({
      mode: "enqueue_error",
      source: sourceLabel,
    });
    // На відміну від auth-mail, тут НЕ намагаємося upsert-нути напряму:
    // memory — це best-effort, втрата одного job-у не ламає UX. Краще
    // лишити як failure-метрику + лог, ніж палити Voyage квоту синхронно
    // у webhook-у при Redis-incident-і.
  }
}

/**
 * Worker-processor — чиста функція, тестовна окремо без Redis. throw →
 * BullMQ retry (тільки якщо `isRetryableIngestError`).
 */
export async function processMemoryIngestJob(
  job: Pick<Job<MemoryIngestPayload>, "data" | "attemptsMade" | "name">,
): Promise<void> {
  const startedAt = process.hrtime.bigint();
  const sourceLabel = job.data.source;
  try {
    await getService().remember([
      {
        userId: job.data.userId,
        source: job.data.source,
        sourceRef: job.data.sourceRef,
        content: job.data.content,
        metadata: job.data.metadata,
      },
    ]);
    aiMemoryIngestProcessedTotal.inc({ outcome: "ok", source: sourceLabel });
    aiMemoryIngestDurationMs.observe(
      { outcome: "ok", source: sourceLabel },
      elapsedMs(startedAt),
    );
  } catch (err) {
    const retryable = isRetryableIngestError(err);
    const outcome = retryable ? "retry" : "permanent_fail";
    aiMemoryIngestProcessedTotal.inc({ outcome, source: sourceLabel });
    aiMemoryIngestDurationMs.observe(
      { outcome, source: sourceLabel },
      elapsedMs(startedAt),
    );
    if (!retryable) {
      // Non-retryable — ковтаємо помилку, BullMQ помітить job як completed
      // без додаткових спроб (так само як authMail-permanent-fail-логіка).
      logger.error({
        msg: "ai_memory_ingest_permanent_failure",
        source: sourceLabel,
        userId: job.data.userId,
        sourceRef: job.data.sourceRef,
        attempt: job.attemptsMade,
        err: serializeError(err, { includeStack: false }),
      });
      return;
    }
    throw err;
  }
}

/**
 * Direct dispatch у fallback-шлях (no-Redis). Дзеркалить
 * processMemoryIngestJob-логіку, але без BullMQ-обвʼязки.
 */
async function runDirectDispatch(payload: MemoryIngestPayload): Promise<void> {
  const startedAt = process.hrtime.bigint();
  const sourceLabel = payload.source;
  try {
    await getService().remember([
      {
        userId: payload.userId,
        source: payload.source,
        sourceRef: payload.sourceRef,
        content: payload.content,
        metadata: payload.metadata,
      },
    ]);
    aiMemoryIngestProcessedTotal.inc({ outcome: "ok", source: sourceLabel });
    aiMemoryIngestDurationMs.observe(
      { outcome: "ok", source: sourceLabel },
      elapsedMs(startedAt),
    );
  } catch (err) {
    // У direct-dispatch-режимі ретраю немає — однораз. Метрика
    // `permanent_fail` навіть для мережевих таймаут-ів навмисна:
    // у dev-без-redis ми не пропускаємо retry-ні помилки повз UI-шар.
    aiMemoryIngestProcessedTotal.inc({
      outcome: "permanent_fail",
      source: sourceLabel,
    });
    aiMemoryIngestDurationMs.observe(
      { outcome: "permanent_fail", source: sourceLabel },
      elapsedMs(startedAt),
    );
    throw err;
  }
}

export interface StartedMemoryIngestWorker {
  /** Очікує inflight job-и і закриває Worker + Queue connections. */
  close(): Promise<void>;
}

/**
 * Стартує BullMQ Worker. Повертає null, якщо Redis недоступний (тоді
 * `enqueueMemoryIngest` піде у fallback). Викликається ОДИН раз на
 * boot (`index.ts`); multi-replica-safe — BullMQ сам lease-ить job-и
 * атомарно.
 */
export function startMemoryIngestWorker(): StartedMemoryIngestWorker | null {
  if (state.worker) return { close: () => closeMemoryIngestModule() };

  // Не стартуємо worker, якщо AI memory вимкнений — інакше BullMQ-worker
  // тримає Redis-connection відкритим без потреби. Producers все одно
  // ловлять `disabled` mode на enqueue-side.
  if (!env.AI_MEMORY_ENABLED) {
    logger.info({ msg: "ai_memory_ingest_worker_disabled" });
    return null;
  }

  const connection = createBullConnection("ai-memory-ingest-worker");
  if (!connection) return null;
  state.workerConnection = connection;

  state.worker = new Worker<MemoryIngestPayload>(
    AI_MEMORY_INGEST_QUEUE_NAME,
    processMemoryIngestJob,
    {
      connection,
      prefix: BULLMQ_QUEUE_PREFIX,
      concurrency: env.AI_MEMORY_INGEST_CONCURRENCY,
    },
  );

  state.worker.on("failed", (job, err) => {
    logger.warn({
      msg: "ai_memory_ingest_job_failed",
      source: job?.data.source,
      userId: job?.data.userId,
      attempt: job?.attemptsMade,
      err: serializeError(err, { includeStack: false }),
    });
  });

  // Periodic depth sampling — те саме рішення, що й у authMail-worker.
  // BullMQ не emit-ить per-state-change events, polling простіший.
  const sampleInterval = setInterval(() => {
    void sampleMemoryIngestQueueDepth().catch(() => {
      /* metrics-only, ignore */
    });
  }, 30_000);
  if (typeof sampleInterval.unref === "function") sampleInterval.unref();

  return {
    async close() {
      clearInterval(sampleInterval);
      await closeMemoryIngestModule();
    },
  };
}

async function sampleMemoryIngestQueueDepth(): Promise<void> {
  if (!state.queue) return;
  const counts = await state.queue.getJobCounts(
    "waiting",
    "active",
    "delayed",
    "failed",
  );
  aiMemoryIngestQueueDepth.reset();
  for (const [status, count] of Object.entries(counts)) {
    aiMemoryIngestQueueDepth.set({ status }, count ?? 0);
  }
}

/**
 * Snapshot AI-memory-ingest worker/queue stats для `/health/workers`. Не
 * пише метрики, не ходить у serviceOverride. Безпечний для виклику з HTTP
 * handler-а — `getJobCounts()` йде у Redis, тож обертається у try/catch
 * і повертає `jobCounts: null` + `error` повідомлення без stack-у. Ніколи
 * не throw-ить — health-endpoint має лишатись reachable навіть у
 * Redis-incident.
 */
export interface MemoryIngestWorkerStats {
  enabled: boolean;
  started: boolean;
  fallbackMode: boolean;
  concurrency: number;
  attempts: number;
  jobCounts: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
  } | null;
  error?: string;
}

export async function getMemoryIngestWorkerStats(): Promise<MemoryIngestWorkerStats> {
  const enabled = env.AI_MEMORY_ENABLED;
  const started = state.worker !== null;
  // Якщо `AI_MEMORY_ENABLED=true`, але `startMemoryIngestWorker()` повернув
  // null (Redis недоступний) — у production це degraded-стан: producer-и
  // падають у in-process direct dispatch (`runDirectDispatch`).
  const fallbackMode = enabled && !started;
  const base: Omit<MemoryIngestWorkerStats, "jobCounts" | "error"> = {
    enabled,
    started,
    fallbackMode,
    concurrency: env.AI_MEMORY_INGEST_CONCURRENCY,
    attempts: env.AI_MEMORY_INGEST_ATTEMPTS,
  };
  if (!state.queue) {
    return { ...base, jobCounts: null };
  }
  try {
    const counts = await state.queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
    );
    return {
      ...base,
      jobCounts: {
        waiting: Number(counts["waiting"] ?? 0),
        active: Number(counts["active"] ?? 0),
        delayed: Number(counts["delayed"] ?? 0),
        failed: Number(counts["failed"] ?? 0),
      },
    };
  } catch (err) {
    return {
      ...base,
      jobCounts: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function closeMemoryIngestModule(): Promise<void> {
  if (state.inflightFallbacks.size > 0) {
    await Promise.allSettled([...state.inflightFallbacks]);
  }

  if (state.worker) {
    try {
      await state.worker.close();
    } catch (err) {
      logger.warn({
        msg: "ai_memory_ingest_worker_close_error",
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
        msg: "ai_memory_ingest_queue_close_error",
        err: serializeError(err, { includeStack: false }),
      });
    }
    state.queue = null;
  }

  await closeBullConnection(state.workerConnection, "ai-memory-ingest-worker");
  state.workerConnection = null;
  await closeBullConnection(state.queueConnection, "ai-memory-ingest-queue");
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
        msg: "ai_memory_ingest_connection_close_error",
        connection: name,
        err: serializeError(err, { includeStack: false }),
      });
    }
  }
}

/**
 * Тільки для тестів — скидає module-state так, щоб vi.resetModules() не
 * потрібен. У production не використовувати.
 */
export function __resetMemoryIngestQueueForTesting(
  service?: AiMemoryService,
): void {
  state.queue = null;
  state.worker = null;
  state.queueConnection = null;
  state.workerConnection = null;
  state.inflightFallbacks.clear();
  state.serviceOverride = service ?? null;
}
