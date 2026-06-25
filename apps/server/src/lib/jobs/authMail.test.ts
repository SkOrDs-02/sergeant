import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all metrics — tests перевіряють контракт, не лічильники.
vi.mock("../../obs/metrics.js", () => ({
  authMailJobsEnqueuedTotal: { inc: vi.fn() },
  authMailJobsProcessedTotal: { inc: vi.fn() },
  authMailJobDurationMs: { observe: vi.fn() },
  authMailQueueDepth: { reset: vi.fn(), set: vi.fn() },
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

// Mock connection — без живого Redis. По дефолту повертаємо null →
// fallback-режим. Тести, які потребують BullMQ-шлях, перевизначать через
// vi.mocked(...).mockReturnValue.
vi.mock("./connection.js", async () => {
  const actual =
    await vi.importActual<typeof import("./connection.js")>("./connection.js");
  return {
    ...actual,
    createBullConnection: vi.fn(() => null),
  };
});

import {
  authMailJobsEnqueuedTotal as _enqueued,
  authMailJobsProcessedTotal as _processed,
  authMailJobDurationMs as _duration,
} from "../../obs/metrics.js";
import {
  __resetAuthMailQueueForTesting,
  enqueueAuthMail,
  isRetryableMailError,
  processAuthMailJob,
  registerAuthMailDispatcher,
  type AuthMailJobData,
} from "./authMail.js";

const enqueuedInc = (_enqueued as unknown as { inc: ReturnType<typeof vi.fn> })
  .inc;
const processedInc = (
  _processed as unknown as {
    inc: ReturnType<typeof vi.fn>;
  }
).inc;
const durationObserve = (
  _duration as unknown as {
    observe: ReturnType<typeof vi.fn>;
  }
).observe;

const sample: AuthMailJobData = {
  kind: "password_reset",
  to: "u@example.com",
  subject: "Reset your password",
  text: "Click the link",
};

describe("isRetryableMailError", () => {
  it("ретраїть 5xx Resend errors", () => {
    expect(isRetryableMailError(new Error("Resend HTTP 503: timeout"))).toBe(
      true,
    );
    expect(isRetryableMailError(new Error("Resend HTTP 500: oops"))).toBe(true);
  });

  it("ретраїть 429 Resend rate-limit", () => {
    expect(isRetryableMailError(new Error("Resend HTTP 429: throttled"))).toBe(
      true,
    );
  });

  it("НЕ ретраїть 4xx Resend errors (permanent config bugs)", () => {
    expect(
      isRetryableMailError(new Error("Resend HTTP 400: invalid email")),
    ).toBe(false);
    expect(
      isRetryableMailError(new Error("Resend HTTP 422: missing field")),
    ).toBe(false);
    expect(
      isRetryableMailError(new Error("Resend HTTP 401: bad api key")),
    ).toBe(false);
  });

  it("ретраїть unknown errors (network, не-Resend)", () => {
    expect(isRetryableMailError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableMailError("string thrown")).toBe(true);
    expect(isRetryableMailError(undefined)).toBe(true);
  });
});

describe("processAuthMailJob — processor contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuthMailQueueForTesting();
  });

  it("викликає dispatcher і помічає outcome=ok", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerAuthMailDispatcher(dispatcher);

    await processAuthMailJob({
      data: sample,
      attemptsMade: 1,
      name: "password_reset",
    });

    expect(dispatcher).toHaveBeenCalledWith(sample);
    expect(processedInc).toHaveBeenCalledWith({ outcome: "ok" });
    expect(durationObserve).toHaveBeenCalledWith(
      { outcome: "ok" },
      expect.any(Number),
    );
  });

  it("на retryable error: re-throw для BullMQ retry, outcome=retry", async () => {
    const err = new Error("Resend HTTP 503: timeout");
    const dispatcher = vi.fn().mockRejectedValue(err);
    registerAuthMailDispatcher(dispatcher);

    await expect(
      processAuthMailJob({
        data: sample,
        attemptsMade: 1,
        name: "password_reset",
      }),
    ).rejects.toThrow("Resend HTTP 503");

    expect(processedInc).toHaveBeenCalledWith({ outcome: "retry" });
  });

  it("на permanent error: НЕ re-throw (BullMQ помітить як completed), outcome=permanent_fail", async () => {
    const err = new Error("Resend HTTP 422: invalid email");
    const dispatcher = vi.fn().mockRejectedValue(err);
    registerAuthMailDispatcher(dispatcher);

    await expect(
      processAuthMailJob({
        data: sample,
        attemptsMade: 1,
        name: "password_reset",
      }),
    ).resolves.toBeUndefined();

    expect(processedInc).toHaveBeenCalledWith({ outcome: "permanent_fail" });
  });

  it("якщо dispatcher не зареєстрований — throw з осмисленою помилкою", async () => {
    // __reset уже знімає dispatcher.
    await expect(
      processAuthMailJob({
        data: sample,
        attemptsMade: 1,
        name: "password_reset",
      }),
    ).rejects.toThrow(/dispatcher not registered/);
  });
});

describe("enqueueAuthMail — fallback path (no Redis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuthMailQueueForTesting();
  });

  afterEach(() => {
    __resetAuthMailQueueForTesting();
  });

  it("без Redis: викликає dispatcher напряму і інкрементує mode=fallback", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerAuthMailDispatcher(dispatcher);

    await enqueueAuthMail(sample);
    // dispatcher викликається асинхронно — почекаємо microtask.
    await new Promise((r) => setTimeout(r, 0));

    expect(dispatcher).toHaveBeenCalledWith(sample);
    expect(enqueuedInc).toHaveBeenCalledWith({ mode: "fallback" });
  });

  it("без Redis і без dispatcher: лог error, не throw", async () => {
    // dispatcher не реєструємо.
    await expect(enqueueAuthMail(sample)).resolves.toBeUndefined();
    // enqueuedInc НЕ збільшується (rejected раніше).
    expect(enqueuedInc).not.toHaveBeenCalled();
  });

  it("без Redis: dispatcher-помилка не throw-иться у caller (Better Auth не блокується)", async () => {
    const dispatcher = vi.fn().mockRejectedValue(new Error("network down"));
    registerAuthMailDispatcher(dispatcher);

    await expect(enqueueAuthMail(sample)).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));

    expect(dispatcher).toHaveBeenCalledTimes(1);
  });
});

describe("enqueueAuthMail — BullMQ path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuthMailQueueForTesting();
  });

  afterEach(() => {
    __resetAuthMailQueueForTesting();
  });

  it("з Redis: викликає queue.add() з jobId-дедуплікацією і інкрементує mode=queued", async () => {
    // Мокаємо connection → ненульове, і Queue → spy на add().
    const { createBullConnection } = await import("./connection.js");
    vi.mocked(createBullConnection).mockReturnValue(
      // мінімальний об'єкт, BullMQ Queue/Worker конструктор-у потрібно.
      {} as never,
    );

    const addMock = vi.fn().mockResolvedValue({ id: "1" });
    const onMock = vi.fn();
    const closeMock = vi.fn();
    // `enqueueAuthMail` робить `new Queue(...)` (див. authMail.ts L117).
    // `vi.fn(() => ({...}))` повертає arrow function, а arrow-функції не можна
    // викликати з `new` (TypeError "is not a constructor"). Описуємо явну
    // конструкторну фабрику, щоб `new MockQueue()` повертало shape з add/on/close.
    function MockQueue(this: unknown) {
      return { add: addMock, on: onMock, close: closeMock };
    }
    function MockWorker(this: unknown) {
      return { on: vi.fn(), close: vi.fn() };
    }
    vi.doMock("bullmq", () => ({
      Queue: MockQueue,
      Worker: MockWorker,
    }));

    // Re-import after mocking bullmq.
    vi.resetModules();
    const mod = await import("./authMail.js");
    mod.__resetAuthMailQueueForTesting();
    mod.registerAuthMailDispatcher(vi.fn().mockResolvedValue(undefined));

    await mod.enqueueAuthMail(sample);

    expect(addMock).toHaveBeenCalledTimes(1);
    const [name, data, opts] = addMock.mock.calls[0] as [
      string,
      AuthMailJobData,
      { jobId: string },
    ];
    expect(name).toBe("password_reset");
    expect(data).toEqual(sample);
    // jobId формат: kind:to:minute_bucket → дедуп подвійних кліків
    expect(opts.jobId).toMatch(/^password_reset:u@example\.com:\d+$/);

    vi.doUnmock("bullmq");
  });

  it("queue.add failure: logs enqueue_error and falls back to direct dispatcher", async () => {
    const { createBullConnection } = await import("./connection.js");
    vi.mocked(createBullConnection).mockReturnValue({} as never);

    const addMock = vi.fn().mockRejectedValue(new Error("redis down"));
    function MockQueue(this: unknown) {
      return { add: addMock, on: vi.fn(), close: vi.fn() };
    }
    function MockWorker(this: unknown) {
      return { on: vi.fn(), close: vi.fn() };
    }
    vi.doMock("bullmq", () => ({
      Queue: MockQueue,
      Worker: MockWorker,
    }));

    vi.resetModules();
    const mod = await import("./authMail.js");
    const metrics = await import("../../obs/metrics.js");
    const inc = (
      metrics.authMailJobsEnqueuedTotal as unknown as {
        inc: ReturnType<typeof vi.fn>;
      }
    ).inc;
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    mod.__resetAuthMailQueueForTesting();
    mod.registerAuthMailDispatcher(dispatcher);

    await mod.enqueueAuthMail(sample);
    await new Promise((r) => setTimeout(r, 0));

    expect(addMock).toHaveBeenCalledTimes(1);
    expect(inc).toHaveBeenCalledWith({ mode: "enqueue_error" });
    expect(dispatcher).toHaveBeenCalledWith(sample);

    vi.doUnmock("bullmq");
  });

  it("startAuthMailWorker creates Worker and close shuts down worker connection", async () => {
    const queueConnection = {
      quit: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    const workerConnection = {
      quit: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    const { createBullConnection } = await import("./connection.js");
    vi.mocked(createBullConnection).mockImplementation((name: string) =>
      name === "auth-mail-worker"
        ? (workerConnection as never)
        : (queueConnection as never),
    );

    const workerOnMock = vi.fn();
    const workerCloseMock = vi.fn().mockResolvedValue(undefined);
    const queueCloseMock = vi.fn().mockResolvedValue(undefined);
    const getJobCountsMock = vi.fn().mockResolvedValue({
      waiting: 2,
      active: 1,
      delayed: 0,
      failed: 3,
    });
    let workerArgs: unknown[] | null = null;
    function MockQueue(this: unknown) {
      return {
        add: vi.fn().mockResolvedValue({ id: "1" }),
        on: vi.fn(),
        close: queueCloseMock,
        getJobCounts: getJobCountsMock,
      };
    }
    function MockWorker(this: unknown, ...args: unknown[]) {
      workerArgs = args;
      return { on: workerOnMock, close: workerCloseMock };
    }
    vi.doMock("bullmq", () => ({
      Queue: MockQueue,
      Worker: MockWorker,
    }));

    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import("./authMail.js");
    mod.__resetAuthMailQueueForTesting();

    await mod.enqueueAuthMail(sample);
    const started = mod.startAuthMailWorker();
    await vi.advanceTimersByTimeAsync(30_000);
    await started?.close();

    expect(started).not.toBeNull();
    expect(workerArgs?.[0]).toBe("auth-mail");
    expect(workerArgs?.[2]).toMatchObject({
      prefix: "sergeant",
      concurrency: 5,
    });
    expect(workerOnMock).toHaveBeenCalledWith("failed", expect.any(Function));
    expect(getJobCountsMock).toHaveBeenCalledWith(
      "waiting",
      "active",
      "delayed",
      "failed",
    );
    expect(workerCloseMock).toHaveBeenCalledTimes(1);
    expect(queueCloseMock).toHaveBeenCalledTimes(1);
    expect(workerConnection.quit).toHaveBeenCalledTimes(1);
    expect(queueConnection.quit).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    vi.doUnmock("bullmq");
  });
});
