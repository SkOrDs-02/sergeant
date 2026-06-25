import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bullmqMocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  queueClose: vi.fn(),
  queueGetJobCounts: vi.fn(),
  queueInstances: [] as Array<{
    handlers: Record<string, (...args: unknown[]) => unknown>;
  }>,
  workerClose: vi.fn(),
  workerInstances: [] as Array<{
    handlers: Record<string, (...args: unknown[]) => unknown>;
  }>,
}));

vi.mock("bullmq", () => ({
  Queue: class FakeQueue {
    handlers: Record<string, (...args: unknown[]) => unknown> = {};

    constructor() {
      bullmqMocks.queueInstances.push(this);
    }

    add(...args: unknown[]) {
      return bullmqMocks.queueAdd(...args);
    }

    close() {
      return bullmqMocks.queueClose();
    }

    getJobCounts(...args: unknown[]) {
      return bullmqMocks.queueGetJobCounts(...args);
    }

    on(event: string, handler: (...args: unknown[]) => unknown) {
      this.handlers[event] = handler;
      return this;
    }
  },
  Worker: class FakeWorker {
    handlers: Record<string, (...args: unknown[]) => unknown> = {};

    constructor() {
      bullmqMocks.workerInstances.push(this);
    }

    close() {
      return bullmqMocks.workerClose();
    }

    on(event: string, handler: (...args: unknown[]) => unknown) {
      this.handlers[event] = handler;
      return this;
    }
  },
}));

// Mock metrics — тести перевіряють контракт, не лічильники.
vi.mock("../../obs/metrics.js", () => ({
  aiMemoryIngestEnqueuedTotal: { inc: vi.fn() },
  aiMemoryIngestProcessedTotal: { inc: vi.fn() },
  aiMemoryIngestDurationMs: { observe: vi.fn() },
  aiMemoryIngestQueueDepth: { reset: vi.fn(), set: vi.fn() },
}));

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  serializeError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
  // PR-38: transitive chain (ingestQueue → embeddings → voyageBudget →
  // sentry) тягне `redactKeyNames` із logger-у при module-load. Без
  // цього експорту sentry.ts (`new Set(redactKeyNames.map(...))`) кидає.
  redactKeyNames: [],
}));

// PR-38: voyageBudget → sentry. Mock — щоб real Sentry-init не активний
// у unit-тестах (DSN-залежний side-effect).
vi.mock("../../sentry.js", () => ({
  Sentry: { captureMessage: vi.fn() },
}));

// Mock connection — без живого Redis. Default: null → fallback path.
vi.mock("../../lib/jobs/connection.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/jobs/connection.js")
  >("../../lib/jobs/connection.js");
  return {
    ...actual,
    createBullConnection: vi.fn(() => null),
  };
});

// DLQ-module mock — щоб permanent_fail / retries-exhausted paths
// не намагалися ходити у PG під unit-тестами.
vi.mock("./dlq.js", () => ({
  recordIngestDlq: vi.fn().mockResolvedValue(undefined),
  markDlqRowReplayed: vi.fn().mockResolvedValue(undefined),
  listDlqRows: vi.fn().mockResolvedValue([]),
  __resetDlqRateLimit: vi.fn(),
  __getDlqRateLimitState: vi.fn(() => ({
    lastAlertAtMs: 0,
    suppressedCount: 0,
  })),
}));

import {
  aiMemoryIngestEnqueuedTotal as _enqueued,
  aiMemoryIngestProcessedTotal as _processed,
  aiMemoryIngestDurationMs as _duration,
} from "../../obs/metrics.js";
import {
  __resetMemoryIngestQueueForTesting,
  enqueueMemoryIngest,
  isRetryableIngestError,
  processMemoryIngestJob,
  type MemoryIngestPayload,
} from "./ingestQueue.js";
import { MissingVoyageApiKeyError, VoyageHttpError } from "./embeddings.js";
import type { AiMemoryService } from "./service.js";
import { recordIngestDlq as _recordIngestDlq } from "./dlq.js";
import { createBullConnection as _createBullConnection } from "../../lib/jobs/connection.js";

const recordIngestDlqMock = _recordIngestDlq as unknown as ReturnType<
  typeof vi.fn
>;

const enqueuedInc = (_enqueued as unknown as { inc: ReturnType<typeof vi.fn> })
  .inc;
const processedInc = (
  _processed as unknown as { inc: ReturnType<typeof vi.fn> }
).inc;
const durationObserve = (
  _duration as unknown as { observe: ReturnType<typeof vi.fn> }
).observe;
const createBullConnectionMock = _createBullConnection as unknown as ReturnType<
  typeof vi.fn
>;

const samplePayload: MemoryIngestPayload = {
  userId: "u1",
  source: "finyk",
  sourceRef: "tx-1",
  content: "Витрата 100 ₴ Сільпо · 2026-01-15",
  metadata: { amount: 100, currencyCode: 980 },
};

function makeFakeService(
  remember: (input: unknown[]) => Promise<void> = async () => {},
): AiMemoryService {
  return {
    remember: vi.fn(remember),
    recall: vi.fn(),
    forgetUser: vi.fn(),
    forgetSource: vi.fn(),
    health: vi.fn(),
  } as unknown as AiMemoryService;
}

function resetBullmqMocks(): void {
  bullmqMocks.queueAdd.mockReset();
  bullmqMocks.queueClose.mockReset();
  bullmqMocks.queueGetJobCounts.mockReset();
  bullmqMocks.workerClose.mockReset();
  bullmqMocks.queueInstances.length = 0;
  bullmqMocks.workerInstances.length = 0;
  createBullConnectionMock.mockReset();
  createBullConnectionMock.mockReturnValue(null);
}

async function loadFreshMemoryIngestModule() {
  vi.resetModules();
  const connectionMod = await import("../../lib/jobs/connection.js");
  const metricsMod = await import("../../obs/metrics.js");
  const mod = await import("./ingestQueue.js");
  return {
    mod,
    createBullConnectionMock:
      connectionMod.createBullConnection as unknown as ReturnType<typeof vi.fn>,
    enqueuedInc: (
      metricsMod.aiMemoryIngestEnqueuedTotal as unknown as {
        inc: ReturnType<typeof vi.fn>;
      }
    ).inc,
  };
}

describe("isRetryableIngestError", () => {
  it("НЕ ретраїть MissingVoyageApiKeyError (manual fix)", () => {
    expect(isRetryableIngestError(new MissingVoyageApiKeyError())).toBe(false);
  });

  it("ретраїть VoyageHttpError 429 (rate-limit)", () => {
    expect(
      isRetryableIngestError(new VoyageHttpError(429, "throttled", true)),
    ).toBe(true);
  });

  it("ретраїть VoyageHttpError 5xx", () => {
    expect(isRetryableIngestError(new VoyageHttpError(500, "oops", true))).toBe(
      true,
    );
    expect(isRetryableIngestError(new VoyageHttpError(503, "down", true))).toBe(
      true,
    );
  });

  it("НЕ ретраїть VoyageHttpError 4xx (auth/config bug)", () => {
    expect(
      isRetryableIngestError(new VoyageHttpError(400, "bad input", false)),
    ).toBe(false);
    expect(
      isRetryableIngestError(new VoyageHttpError(401, "no key", false)),
    ).toBe(false);
    expect(
      isRetryableIngestError(new VoyageHttpError(422, "schema", false)),
    ).toBe(false);
  });

  it("ретраїть unknown errors (network, timeout)", () => {
    expect(isRetryableIngestError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableIngestError(new Error("AbortError: timeout"))).toBe(true);
    expect(isRetryableIngestError("string thrown")).toBe(true);
    expect(isRetryableIngestError(undefined)).toBe(true);
  });
});

describe("processMemoryIngestJob — processor contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMemoryIngestQueueForTesting();
  });

  it("викликає service.remember і помічає outcome=ok", async () => {
    const remember = vi.fn().mockResolvedValue(undefined);
    __resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await processMemoryIngestJob({
      data: samplePayload,
      attemptsMade: 1,
      name: "finyk",
    });

    expect(remember).toHaveBeenCalledTimes(1);
    expect(remember!.mock.calls[0]![0]).toEqual([
      {
        userId: samplePayload.userId,
        source: samplePayload.source,
        sourceRef: samplePayload.sourceRef,
        content: samplePayload.content,
        metadata: samplePayload.metadata,
      },
    ]);
    expect(processedInc).toHaveBeenCalledWith({
      outcome: "ok",
      source: "finyk",
    });
    expect(durationObserve).toHaveBeenCalledWith(
      { outcome: "ok", source: "finyk" },
      expect.any(Number),
    );
  });

  it("на retryable error: re-throw для BullMQ retry, outcome=retry", async () => {
    const err = new VoyageHttpError(503, "Service Unavailable", true);
    const remember = vi.fn().mockRejectedValue(err);
    __resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await expect(
      processMemoryIngestJob({
        data: samplePayload,
        attemptsMade: 1,
        name: "finyk",
      }),
    ).rejects.toThrow("Service Unavailable");

    expect(processedInc).toHaveBeenCalledWith({
      outcome: "retry",
      source: "finyk",
    });
  });

  it("на permanent error (4xx): НЕ re-throw, outcome=permanent_fail + DLQ write", async () => {
    const err = new VoyageHttpError(400, "Invalid input", false);
    const remember = vi.fn().mockRejectedValue(err);
    __resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await expect(
      processMemoryIngestJob({
        data: samplePayload,
        attemptsMade: 1,
        name: "finyk",
      }),
    ).resolves.toBeUndefined();

    expect(processedInc).toHaveBeenCalledWith({
      outcome: "permanent_fail",
      source: "finyk",
    });
    expect(processedInc).toHaveBeenCalledWith({
      outcome: "dlq",
      source: "finyk",
    });
    expect(recordIngestDlqMock).toHaveBeenCalledTimes(1);
    expect(recordIngestDlqMock).toHaveBeenCalledWith({
      payload: samplePayload,
      errorMsg: expect.stringContaining("Invalid input"),
      attempts: 2, // attemptsMade=1 → attempts=2 (next attempt counter)
    });
  });

  it("на missing API key: НЕ re-throw, outcome=permanent_fail + DLQ write", async () => {
    const err = new MissingVoyageApiKeyError();
    const remember = vi.fn().mockRejectedValue(err);
    __resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await expect(
      processMemoryIngestJob({
        data: samplePayload,
        attemptsMade: 1,
        name: "finyk",
      }),
    ).resolves.toBeUndefined();

    expect(processedInc).toHaveBeenCalledWith({
      outcome: "permanent_fail",
      source: "finyk",
    });
    expect(processedInc).toHaveBeenCalledWith({
      outcome: "dlq",
      source: "finyk",
    });
    expect(recordIngestDlqMock).toHaveBeenCalledTimes(1);
  });

  it("retryable error НЕ пише у DLQ (BullMQ retries-exhausted-event робить це окремо)", async () => {
    const err = new VoyageHttpError(503, "Service Unavailable", true);
    const remember = vi.fn().mockRejectedValue(err);
    __resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await expect(
      processMemoryIngestJob({
        data: samplePayload,
        attemptsMade: 1,
        name: "finyk",
      }),
    ).rejects.toThrow();

    expect(recordIngestDlqMock).not.toHaveBeenCalled();
    expect(processedInc).not.toHaveBeenCalledWith({
      outcome: "dlq",
      source: "finyk",
    });
  });

  it("source-label передається у метрики", async () => {
    const remember = vi.fn().mockResolvedValue(undefined);
    __resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await processMemoryIngestJob({
      data: { ...samplePayload, source: "digest", sourceRef: "2026-W18" },
      attemptsMade: 1,
      name: "digest",
    });

    expect(processedInc).toHaveBeenCalledWith({
      outcome: "ok",
      source: "digest",
    });
  });
});

describe("enqueueMemoryIngest — fallback path (no Redis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMemoryIngestQueueForTesting();
    process.env["AI_MEMORY_ENABLED"] = "true";
  });

  afterEach(() => {
    __resetMemoryIngestQueueForTesting();
    delete process.env["AI_MEMORY_ENABLED"];
  });

  it("без Redis: викликає remember напряму та інкрементує mode=fallback", async () => {
    vi.resetModules();
    const remember = vi.fn().mockResolvedValue(undefined);
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await mod.enqueueMemoryIngest(samplePayload);
    // Дочекаємося inflight fallback promise.
    await new Promise((r) => setTimeout(r, 0));

    expect(remember).toHaveBeenCalledTimes(1);
    const { aiMemoryIngestEnqueuedTotal: inc } =
      await import("../../obs/metrics.js");
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).toHaveBeenCalledWith({ mode: "fallback", source: "finyk" });
  });

  it("AI_MEMORY_ENABLED=false: skip без виклику remember", async () => {
    process.env["AI_MEMORY_ENABLED"] = "false";
    vi.resetModules();
    const remember = vi.fn().mockResolvedValue(undefined);
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await mod.enqueueMemoryIngest(samplePayload);
    await new Promise((r) => setTimeout(r, 0));

    expect(remember).not.toHaveBeenCalled();
    const { aiMemoryIngestEnqueuedTotal: inc } =
      await import("../../obs/metrics.js");
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).toHaveBeenCalledWith({ mode: "disabled", source: "finyk" });
  });

  it("invalid source: НЕ throw, інкрементує enqueue_error", async () => {
    const badPayload = {
      ...samplePayload,
      source: "evil_source" as never,
    };

    await expect(enqueueMemoryIngest(badPayload)).resolves.toBeUndefined();
    expect(enqueuedInc).toHaveBeenCalledWith({
      mode: "enqueue_error",
      source: "unknown",
    });
  });

  it("empty content: skip і інкрементує enqueue_error", async () => {
    await enqueueMemoryIngest({ ...samplePayload, content: "" });
    expect(enqueuedInc).toHaveBeenCalledWith({
      mode: "enqueue_error",
      source: "finyk",
    });
  });

  it("empty userId: skip і інкрементує enqueue_error", async () => {
    await enqueueMemoryIngest({ ...samplePayload, userId: "" });
    expect(enqueuedInc).toHaveBeenCalledWith({
      mode: "enqueue_error",
      source: "finyk",
    });
  });

  it("без Redis: remember-помилка не throw-иться у caller (ніколи не валимо webhook)", async () => {
    vi.resetModules();
    const remember = vi.fn().mockRejectedValue(new Error("network down"));
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await expect(
      mod.enqueueMemoryIngest(samplePayload),
    ).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 10));

    expect(remember).toHaveBeenCalledTimes(1);
  });
});

// PR-19 — per-source kill-switch `MONO_AI_MEMORY_INGEST_ENABLED`.
// Default `true` (finyk-ingest активний при master-flag=true), але `false`
// має селективно глушити саме `finyk`-source без впливу на digest/chat.
describe("enqueueMemoryIngest — MONO_AI_MEMORY_INGEST_ENABLED (PR-19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMemoryIngestQueueForTesting();
    process.env["AI_MEMORY_ENABLED"] = "true";
  });

  afterEach(() => {
    __resetMemoryIngestQueueForTesting();
    delete process.env["AI_MEMORY_ENABLED"];
    delete process.env["MONO_AI_MEMORY_INGEST_ENABLED"];
  });

  it("happy: MONO_AI_MEMORY_INGEST_ENABLED=true + finyk → remember викликається", async () => {
    process.env["MONO_AI_MEMORY_INGEST_ENABLED"] = "true";
    vi.resetModules();
    const remember = vi.fn().mockResolvedValue(undefined);
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await mod.enqueueMemoryIngest(samplePayload);
    await new Promise((r) => setTimeout(r, 0));

    expect(remember).toHaveBeenCalledTimes(1);
    const { aiMemoryIngestEnqueuedTotal: inc } =
      await import("../../obs/metrics.js");
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).toHaveBeenCalledWith({ mode: "fallback", source: "finyk" });
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({ mode: "source_disabled" }),
    );
  });

  it("skip: MONO_AI_MEMORY_INGEST_ENABLED=false + finyk → remember НЕ викликається, source_disabled-метрика", async () => {
    process.env["MONO_AI_MEMORY_INGEST_ENABLED"] = "false";
    vi.resetModules();
    const remember = vi.fn().mockResolvedValue(undefined);
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await mod.enqueueMemoryIngest(samplePayload);
    await new Promise((r) => setTimeout(r, 0));

    expect(remember).not.toHaveBeenCalled();
    const { aiMemoryIngestEnqueuedTotal: inc } =
      await import("../../obs/metrics.js");
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).toHaveBeenCalledWith({ mode: "source_disabled", source: "finyk" });
  });

  it("non-finyk source (digest) НЕ gate-ний MONO_AI_MEMORY_INGEST_ENABLED=false", async () => {
    // Sub-flag — finyk-only. digest/chat/тощо контролюються лише master.
    process.env["MONO_AI_MEMORY_INGEST_ENABLED"] = "false";
    vi.resetModules();
    const remember = vi.fn().mockResolvedValue(undefined);
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await mod.enqueueMemoryIngest({
      ...samplePayload,
      source: "digest",
      sourceRef: "u1:2026-W03",
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(remember).toHaveBeenCalledTimes(1);
    const { aiMemoryIngestEnqueuedTotal: inc } =
      await import("../../obs/metrics.js");
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).toHaveBeenCalledWith({ mode: "fallback", source: "digest" });
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({ mode: "source_disabled" }),
    );
  });

  it("runtime kill-switch активний → finyk skipped, source_disabled-метрика", async () => {
    // RAG eval automation post-PR-20: коли recall@4 < 0.4, endpoint
    // /api/internal/eval/rag-weekly активує in-memory kill-switch
    // `mono_ai_memory_ingest`. Цей kill-switch перебиває env-flag-у:
    // навіть якщо `MONO_AI_MEMORY_INGEST_ENABLED=true`, finyk не enqueue-ить.
    process.env["MONO_AI_MEMORY_INGEST_ENABLED"] = "true";
    vi.resetModules();
    const { activateKillSwitch, __resetKillSwitchesForTest } =
      await import("../../lib/featureFlags/runtimeKillSwitch.js");
    __resetKillSwitchesForTest();
    activateKillSwitch("mono_ai_memory_ingest", {
      reason: "test: kill-switch override",
    });
    const remember = vi.fn().mockResolvedValue(undefined);
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await mod.enqueueMemoryIngest(samplePayload);
    await new Promise((r) => setTimeout(r, 0));

    expect(remember).not.toHaveBeenCalled();
    const { aiMemoryIngestEnqueuedTotal: inc } =
      await import("../../obs/metrics.js");
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).toHaveBeenCalledWith({ mode: "source_disabled", source: "finyk" });
    __resetKillSwitchesForTest();
  });

  it("master AI_MEMORY_ENABLED=false виграє у MONO_AI_MEMORY_INGEST_ENABLED=true (disabled-mode trumps)", async () => {
    process.env["AI_MEMORY_ENABLED"] = "false";
    process.env["MONO_AI_MEMORY_INGEST_ENABLED"] = "true";
    vi.resetModules();
    const remember = vi.fn().mockResolvedValue(undefined);
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await mod.enqueueMemoryIngest(samplePayload);
    await new Promise((r) => setTimeout(r, 0));

    expect(remember).not.toHaveBeenCalled();
    const { aiMemoryIngestEnqueuedTotal: inc } =
      await import("../../obs/metrics.js");
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).toHaveBeenCalledWith({ mode: "disabled", source: "finyk" });
    // `source_disabled` має НЕ виставитись — master-gate спрацював раніше.
    expect(
      (inc as unknown as { inc: ReturnType<typeof vi.fn> }).inc,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({ mode: "source_disabled" }),
    );
  });
});

describe("memory ingest BullMQ lifecycle and stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBullmqMocks();
    __resetMemoryIngestQueueForTesting();
    process.env["AI_MEMORY_ENABLED"] = "true";
    process.env["MONO_AI_MEMORY_INGEST_ENABLED"] = "true";
  });

  afterEach(() => {
    __resetMemoryIngestQueueForTesting();
    delete process.env["AI_MEMORY_ENABLED"];
    delete process.env["MONO_AI_MEMORY_INGEST_ENABLED"];
  });

  it("queues via BullMQ with a stable jobId when Redis is available", async () => {
    const fresh = await loadFreshMemoryIngestModule();
    const connection = { quit: vi.fn(), disconnect: vi.fn() };
    fresh.createBullConnectionMock.mockReturnValue(connection);
    bullmqMocks.queueAdd.mockResolvedValue({ id: "job-1" });

    await fresh.mod.enqueueMemoryIngest(samplePayload);

    expect(bullmqMocks.queueInstances).toHaveLength(1);
    expect(bullmqMocks.queueAdd).toHaveBeenCalledWith("finyk", samplePayload, {
      jobId: "u1__finyk__tx-1",
    });
    expect(fresh.enqueuedInc).toHaveBeenCalledWith({
      mode: "queued",
      source: "finyk",
    });
  });

  it("queues payloads without sourceRef without a jobId override", async () => {
    const fresh = await loadFreshMemoryIngestModule();
    fresh.createBullConnectionMock.mockReturnValue({
      quit: vi.fn(),
      disconnect: vi.fn(),
    });
    bullmqMocks.queueAdd.mockResolvedValue({ id: "job-2" });
    const payload = { ...samplePayload, sourceRef: null };

    await fresh.mod.enqueueMemoryIngest(payload);

    expect(bullmqMocks.queueAdd).toHaveBeenCalledWith("finyk", payload, {});
  });

  it("records enqueue_error when BullMQ add fails", async () => {
    const fresh = await loadFreshMemoryIngestModule();
    fresh.createBullConnectionMock.mockReturnValue({
      quit: vi.fn(),
      disconnect: vi.fn(),
    });
    bullmqMocks.queueAdd.mockRejectedValue(new Error("redis write failed"));

    await expect(
      fresh.mod.enqueueMemoryIngest(samplePayload),
    ).resolves.toBeUndefined();

    expect(fresh.enqueuedInc).toHaveBeenCalledWith({
      mode: "enqueue_error",
      source: "finyk",
    });
  });

  it("reports queue counts and gracefully degrades when count sampling fails", async () => {
    const fresh = await loadFreshMemoryIngestModule();
    fresh.createBullConnectionMock.mockReturnValue({
      quit: vi.fn(),
      disconnect: vi.fn(),
    });
    bullmqMocks.queueAdd.mockResolvedValue({ id: "job-1" });
    bullmqMocks.queueGetJobCounts.mockResolvedValue({
      waiting: 2,
      active: 1,
      delayed: 3,
      failed: 4,
    });
    await fresh.mod.enqueueMemoryIngest(samplePayload);

    await expect(fresh.mod.getMemoryIngestWorkerStats()).resolves.toMatchObject(
      {
        enabled: true,
        started: false,
        fallbackMode: true,
        jobCounts: { waiting: 2, active: 1, delayed: 3, failed: 4 },
      },
    );

    bullmqMocks.queueGetJobCounts.mockRejectedValueOnce(
      new Error("redis unavailable"),
    );
    await expect(fresh.mod.getMemoryIngestWorkerStats()).resolves.toMatchObject(
      {
        jobCounts: null,
        error: "redis unavailable",
      },
    );
  });

  it("starts, reuses, and closes the worker without leaking connections", async () => {
    const fresh = await loadFreshMemoryIngestModule();
    const connection = { quit: vi.fn(), disconnect: vi.fn() };
    fresh.createBullConnectionMock.mockReturnValue(connection);
    bullmqMocks.workerClose.mockResolvedValue(undefined);

    const worker = fresh.mod.startMemoryIngestWorker();
    expect(worker).not.toBeNull();
    expect(bullmqMocks.workerInstances).toHaveLength(1);

    const sameWorker = fresh.mod.startMemoryIngestWorker();
    expect(sameWorker).not.toBeNull();
    expect(bullmqMocks.workerInstances).toHaveLength(1);

    await worker?.close();

    expect(bullmqMocks.workerClose).toHaveBeenCalledOnce();
    expect(connection.quit).toHaveBeenCalledOnce();
  });

  it("skips worker startup when disabled or Redis is unavailable", async () => {
    process.env["AI_MEMORY_ENABLED"] = "false";
    const disabled = await loadFreshMemoryIngestModule();
    expect(disabled.mod.startMemoryIngestWorker()).toBeNull();

    process.env["AI_MEMORY_ENABLED"] = "true";
    const noRedis = await loadFreshMemoryIngestModule();
    noRedis.createBullConnectionMock.mockReturnValue(null);
    expect(noRedis.mod.startMemoryIngestWorker()).toBeNull();
  });
});
