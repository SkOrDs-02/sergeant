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

const { hasAiMemoryConsentMock, hasHealthDataConsentMock } = vi.hoisted(() => ({
  hasAiMemoryConsentMock: vi.fn().mockResolvedValue(true),
  hasHealthDataConsentMock: vi.fn().mockResolvedValue(false),
}));

vi.mock("./consent.js", () => ({
  hasAiMemoryConsent: hasAiMemoryConsentMock,
  hasHealthDataConsent: hasHealthDataConsentMock,
}));

beforeEach(() => {
  hasAiMemoryConsentMock.mockReset();
  hasAiMemoryConsentMock.mockResolvedValue(true);
  // PR-S3: дефолт мока — `false`, дзеркалячи і колонку
  // (`NOT NULL DEFAULT FALSE`, міграція 111), і застосунок
  // (`dataRights.ts`). Тест, який хоче побачити запис health-payload-у,
  // мусить згоду поставити ЯВНО — інакше зелений тест описував би стан, у
  // якому насправді не перебуває майже ніхто.
  hasHealthDataConsentMock.mockReset();
  hasHealthDataConsentMock.mockResolvedValue(false);
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
  source: "cofounder",
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
      name: "cofounder",
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
      source: "cofounder",
    });
    expect(durationObserve).toHaveBeenCalledWith(
      { outcome: "ok", source: "cofounder" },
      expect.any(Number),
    );
  });

  it("skips a queued job after the user revokes consent", async () => {
    hasAiMemoryConsentMock.mockResolvedValueOnce(false);
    const remember = vi.fn().mockResolvedValue(undefined);
    __resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await processMemoryIngestJob({
      data: samplePayload,
      attemptsMade: 0,
      name: "cofounder",
    });

    expect(remember).not.toHaveBeenCalled();
    expect(processedInc).toHaveBeenCalledWith({
      outcome: "consent_disabled",
      source: "cofounder",
    });
  });

  it("на retryable error: re-throw для BullMQ retry, outcome=retry", async () => {
    const err = new VoyageHttpError(503, "Service Unavailable", true);
    const remember = vi.fn().mockRejectedValue(err);
    __resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await expect(
      processMemoryIngestJob({
        data: samplePayload,
        attemptsMade: 1,
        name: "cofounder",
      }),
    ).rejects.toThrow("Service Unavailable");

    expect(processedInc).toHaveBeenCalledWith({
      outcome: "retry",
      source: "cofounder",
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
        name: "cofounder",
      }),
    ).resolves.toBeUndefined();

    expect(processedInc).toHaveBeenCalledWith({
      outcome: "permanent_fail",
      source: "cofounder",
    });
    expect(processedInc).toHaveBeenCalledWith({
      outcome: "dlq",
      source: "cofounder",
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
        name: "cofounder",
      }),
    ).resolves.toBeUndefined();

    expect(processedInc).toHaveBeenCalledWith({
      outcome: "permanent_fail",
      source: "cofounder",
    });
    expect(processedInc).toHaveBeenCalledWith({
      outcome: "dlq",
      source: "cofounder",
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
        name: "cofounder",
      }),
    ).rejects.toThrow();

    expect(recordIngestDlqMock).not.toHaveBeenCalled();
    expect(processedInc).not.toHaveBeenCalledWith({
      outcome: "dlq",
      source: "cofounder",
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
    ).toHaveBeenCalledWith({ mode: "fallback", source: "cofounder" });
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
    ).toHaveBeenCalledWith({ mode: "disabled", source: "cofounder" });
  });

  it("does not enqueue or remember when aiMemory consent is disabled", async () => {
    process.env["AI_MEMORY_ENABLED"] = "true";
    vi.resetModules();
    hasAiMemoryConsentMock.mockResolvedValue(false);
    const remember = vi.fn().mockResolvedValue(undefined);
    const mod = await import("./ingestQueue.js");
    mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

    await mod.enqueueMemoryIngest(samplePayload);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(remember).not.toHaveBeenCalled();
    const { aiMemoryIngestEnqueuedTotal } =
      await import("../../obs/metrics.js");
    expect(
      (
        aiMemoryIngestEnqueuedTotal as unknown as {
          inc: ReturnType<typeof vi.fn>;
        }
      ).inc,
    ).toHaveBeenCalledWith({
      mode: "consent_disabled",
      source: "cofounder",
    });
  });

  // ── PR-S3: другий гейт згоди, саме на персистентному записі ──────────────
  //
  // Рішення founder-а 2026-09-14. Ефемерна відповідь у чаті лишається всім
  // (гейт на читання вимкнув би AI-шар за замовчуванням — тумблер
  // дефолтиться у `false`), а от осідання назавжди потребує згоди: вимкнути
  // тумблер постфактум і цим прибрати вже записане неможливо.
  //
  // Break-test прогнано (обовʼязковий за `sergeant-bugfix-and-regression`):
  // прибери гілку `payload.healthData === true` в `enqueueMemoryIngestImpl`
  // — падають ТРИ з пʼяти, «3 failed | 27 passed». Падають перший, другий і
  // пʼятий (fail-closed) — саме вони і є знахідкою.
  //
  // Третій (payload без прапорця) і четвертий (згода є) на зламаному коді
  // проходять, і лишаються свідомо: вони стережуть, щоб гейт не забрав
  // зайвого разом із потрібним. Тобто це піни на інваріант, а не докази
  // дефекту, і читати їх як докази не треба.
  describe("PR-S3: health-payload під окремою згодою", () => {
    const healthPayload: MemoryIngestPayload = {
      ...samplePayload,
      source: "digest",
      healthData: true,
    };

    it("не пише health-payload без згоди «Дані про здоровʼя»", async () => {
      process.env["AI_MEMORY_ENABLED"] = "true";
      vi.resetModules();
      hasAiMemoryConsentMock.mockResolvedValue(true);
      hasHealthDataConsentMock.mockResolvedValue(false);
      const remember = vi.fn().mockResolvedValue(undefined);
      const mod = await import("./ingestQueue.js");
      mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

      await mod.enqueueMemoryIngest(healthPayload);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(remember).not.toHaveBeenCalled();
      const { aiMemoryIngestEnqueuedTotal } =
        await import("../../obs/metrics.js");
      expect(
        (
          aiMemoryIngestEnqueuedTotal as unknown as {
            inc: ReturnType<typeof vi.fn>;
          }
        ).inc,
      ).toHaveBeenCalledWith({
        mode: "health_consent_disabled",
        source: "digest",
      });
    });

    it("загальної згоди на памʼять НЕ досить — потрібні обидві", async () => {
      // Найлегша помилка при читанні цього коду — вирішити, що `aiMemory:
      // true` покриває все. Саме тому тут згода на памʼять УВІМКНЕНА.
      process.env["AI_MEMORY_ENABLED"] = "true";
      vi.resetModules();
      hasAiMemoryConsentMock.mockResolvedValue(true);
      hasHealthDataConsentMock.mockResolvedValue(false);
      const remember = vi.fn().mockResolvedValue(undefined);
      const mod = await import("./ingestQueue.js");
      mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

      await mod.enqueueMemoryIngest(healthPayload);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(hasAiMemoryConsentMock).toHaveBeenCalled();
      expect(remember).not.toHaveBeenCalled();
    });

    it("не чіпає payload без прапорця — гейт не ширший за знахідку", async () => {
      process.env["AI_MEMORY_ENABLED"] = "true";
      vi.resetModules();
      hasAiMemoryConsentMock.mockResolvedValue(true);
      hasHealthDataConsentMock.mockResolvedValue(false);
      const remember = vi.fn().mockResolvedValue(undefined);
      const mod = await import("./ingestQueue.js");
      mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

      await mod.enqueueMemoryIngest(samplePayload);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(remember).toHaveBeenCalled();
      // Дорогий запит до БД не має робитись там, де він не потрібен.
      expect(hasHealthDataConsentMock).not.toHaveBeenCalled();
    });

    it("зі згодою health-payload проходить", async () => {
      process.env["AI_MEMORY_ENABLED"] = "true";
      vi.resetModules();
      hasAiMemoryConsentMock.mockResolvedValue(true);
      hasHealthDataConsentMock.mockResolvedValue(true);
      const remember = vi.fn().mockResolvedValue(undefined);
      const mod = await import("./ingestQueue.js");
      mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

      await mod.enqueueMemoryIngest(healthPayload);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(remember).toHaveBeenCalled();
    });

    it("падіння перевірки згоди не пускає запис (fail-closed)", async () => {
      // Асиметрія навмисна й протилежна до `hasAiMemoryConsent`: там
      // відсутній рядок означає продуктовий дефолт «увімкнено», тут —
      // «згоди не давали». Помилитись у бік «не записали» дешево,
      // у бік «записали дані про здоровʼя без згоди» — ні.
      process.env["AI_MEMORY_ENABLED"] = "true";
      vi.resetModules();
      hasAiMemoryConsentMock.mockResolvedValue(true);
      hasHealthDataConsentMock.mockRejectedValue(new Error("db down"));
      const remember = vi.fn().mockResolvedValue(undefined);
      const mod = await import("./ingestQueue.js");
      mod.__resetMemoryIngestQueueForTesting(makeFakeService(remember));

      await mod.enqueueMemoryIngest(healthPayload);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(remember).not.toHaveBeenCalled();
    });
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
      source: "cofounder",
    });
  });

  it("empty userId: skip і інкрементує enqueue_error", async () => {
    await enqueueMemoryIngest({ ...samplePayload, userId: "" });
    expect(enqueuedInc).toHaveBeenCalledWith({
      mode: "enqueue_error",
      source: "cofounder",
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

// PR-19 per-source kill-switch `MONO_AI_MEMORY_INGEST_ENABLED` жив тут на
// `payload.source === "finyk"`. Гілку прибрано ініціативою 0024 (PR-1,
// 2026-09-03) — `finyk` ніколи не мав продюсера в дереві (mono-webhook не
// enqueue-ив). Разом з нею прибрано й цей describe-блок: тести перевіряли
// саме ту гілку, а не generic-поведінку. `master AI_MEMORY_ENABLED=false`
// gate лишається і покритий вище (`enqueueMemoryIngest — fallback path`,
// тест «AI_MEMORY_ENABLED=false: skip без виклику remember»). PR-2 тієї ж
// ініціативи перецілює механізм на `payload.source === "digest"` і
// повертає еквівалентне покриття під новою назвою.

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
    expect(bullmqMocks.queueAdd).toHaveBeenCalledWith(
      "cofounder",
      samplePayload,
      {
        jobId: "u1__cofounder__tx-1",
      },
    );
    expect(fresh.enqueuedInc).toHaveBeenCalledWith({
      mode: "queued",
      source: "cofounder",
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

    expect(bullmqMocks.queueAdd).toHaveBeenCalledWith("cofounder", payload, {});
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
      source: "cofounder",
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
