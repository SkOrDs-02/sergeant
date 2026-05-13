import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const enqueuedInc = (_enqueued as unknown as { inc: ReturnType<typeof vi.fn> })
  .inc;
const processedInc = (
  _processed as unknown as { inc: ReturnType<typeof vi.fn> }
).inc;
const durationObserve = (
  _duration as unknown as { observe: ReturnType<typeof vi.fn> }
).observe;

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

  it("на permanent error (4xx): НЕ re-throw, outcome=permanent_fail", async () => {
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
  });

  it("на missing API key: НЕ re-throw, outcome=permanent_fail", async () => {
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
