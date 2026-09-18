import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetFtuxDripQueueForTesting,
  enqueueFtuxDripMail,
  isRetryableFtuxDripError,
  processFtuxDripJob,
  registerFtuxDripDispatcher,
} from "./ftuxDrip.js";
import { FtuxDripSkip } from "../../email/ftuxDripMail.js";

describe("isRetryableFtuxDripError", () => {
  it("retry для 5xx, 429, network-помилок без HTTP-status", () => {
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 500: oops"))).toBe(
      true,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 503: bad"))).toBe(
      true,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 429: rate"))).toBe(
      true,
    );
    expect(isRetryableFtuxDripError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableFtuxDripError("ENOTFOUND")).toBe(true);
  });

  it("permanent для 4xx (крім 429)", () => {
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 400: bad"))).toBe(
      false,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 403: bad"))).toBe(
      false,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 404: bad"))).toBe(
      false,
    );
    expect(isRetryableFtuxDripError(new Error("Resend HTTP 422: bad"))).toBe(
      false,
    );
  });
});

describe("enqueueFtuxDripMail (no Redis fallback)", () => {
  beforeEach(() => {
    __resetFtuxDripQueueForTesting();
    delete process.env["REDIS_URL"];
  });

  afterEach(() => {
    __resetFtuxDripQueueForTesting();
    vi.useRealTimers();
  });

  it("Day 0 синхронно делегує до зареєстрованого dispatcher-а", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerFtuxDripDispatcher(dispatcher);

    await enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_0",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 0,
    });

    // dispatcher викликається з payload-ом і завершується безсинхронно.
    await vi.waitFor(() => expect(dispatcher).toHaveBeenCalledTimes(1));
    expect(dispatcher).toHaveBeenCalledWith(
      expect.objectContaining({ day: "day_0", userId: "u1" }),
    );
  });

  it("Day 1 / Day 3 без Redis — пропускаються, dispatcher не викликається", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerFtuxDripDispatcher(dispatcher);

    for (const day of ["day_1", "day_3"] as const) {
      await enqueueFtuxDripMail({
        kind: "ftux_drip",
        day,
        userId: "u1",
        email: "u1@example.com",
        delayMs: day === "day_1" ? 86400000 : 259200000,
      });
    }

    // Pause to let any microtasks flush
    await new Promise((r) => setImmediate(r));
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("FtuxDripSkip-помилка з dispatcher-а не вважається permanent failure", async () => {
    const dispatcher = vi
      .fn()
      .mockRejectedValue(new FtuxDripSkip("skipped_optout", "opted out"));
    registerFtuxDripDispatcher(dispatcher);

    await enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_0",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 0,
    });

    // Не throw-ить нагору, ні викликає Sentry/error-логику. Тест просто
    // підтверджує, що caller-side не отримує rejected promise.
    await vi.waitFor(() => expect(dispatcher).toHaveBeenCalledTimes(1));
  });
});

describe("processFtuxDripJob (worker)", () => {
  beforeEach(() => {
    __resetFtuxDripQueueForTesting();
  });
  afterEach(() => __resetFtuxDripQueueForTesting());

  it("делегує до dispatcher-а і резолвить при ok", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerFtuxDripDispatcher(dispatcher);

    await processFtuxDripJob({
      data: {
        kind: "ftux_drip",
        day: "day_0",
        userId: "u1",
        email: "u1@example.com",
        delayMs: 0,
      },
      attemptsMade: 1,
      name: "day_0",
    });

    expect(dispatcher).toHaveBeenCalledTimes(1);
  });

  it("FtuxDripSkip → завершує job як completed (не throw)", async () => {
    const dispatcher = vi
      .fn()
      .mockRejectedValue(new FtuxDripSkip("skipped_already_sent", "dup"));
    registerFtuxDripDispatcher(dispatcher);

    await expect(
      processFtuxDripJob({
        data: {
          kind: "ftux_drip",
          day: "day_1",
          userId: "u1",
          email: "u1@example.com",
          delayMs: 86400000,
        },
        attemptsMade: 1,
        name: "day_1",
      }),
    ).resolves.toBeUndefined();
  });

  it("permanent error (4xx) → не throw, BullMQ не ретраїть", async () => {
    const dispatcher = vi
      .fn()
      .mockRejectedValue(new Error("Resend HTTP 422: bad email"));
    registerFtuxDripDispatcher(dispatcher);

    await expect(
      processFtuxDripJob({
        data: {
          kind: "ftux_drip",
          day: "day_0",
          userId: "u1",
          email: "u1@example.com",
          delayMs: 0,
        },
        attemptsMade: 1,
        name: "day_0",
      }),
    ).resolves.toBeUndefined();
  });

  it("retryable error (5xx) → throw для BullMQ-ретраю", async () => {
    const dispatcher = vi
      .fn()
      .mockRejectedValue(new Error("Resend HTTP 503: down"));
    registerFtuxDripDispatcher(dispatcher);

    await expect(
      processFtuxDripJob({
        data: {
          kind: "ftux_drip",
          day: "day_0",
          userId: "u1",
          email: "u1@example.com",
          delayMs: 0,
        },
        attemptsMade: 1,
        name: "day_0",
      }),
    ).rejects.toThrow(/Resend HTTP 503/);
  });
});

describe("enqueueFtuxDripMail / startFtuxDripWorker (BullMQ path)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("bullmq");
    vi.doUnmock("./connection.js");
  });

  it("queues immediate and delayed drip jobs with stable ids and delay config", async () => {
    const addMock = vi.fn().mockResolvedValue({ id: "1" });
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
    vi.doMock("./connection.js", async () => {
      const actual =
        await vi.importActual<typeof import("./connection.js")>(
          "./connection.js",
        );
      return {
        ...actual,
        createBullConnection: vi.fn(() => ({ quit: vi.fn() })),
      };
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:30.000Z"));
    vi.resetModules();
    const mod = await import("./ftuxDrip.js");
    mod.__resetFtuxDripQueueForTesting();

    await mod.enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_0",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 0,
    });
    await mod.enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_1",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 86_400_000,
    });

    expect(addMock).toHaveBeenCalledTimes(2);
    expect(addMock.mock.calls[0]).toEqual([
      "day_0",
      expect.objectContaining({ day: "day_0", userId: "u1" }),
      expect.objectContaining({ jobId: "day_0:u1:29706480" }),
    ]);
    expect(addMock.mock.calls[1]).toEqual([
      "day_1",
      expect.objectContaining({ day: "day_1", userId: "u1" }),
      expect.objectContaining({
        jobId: "day_1:u1",
        delay: 86_400_000,
      }),
    ]);
  });

  it("queue.add failure falls back only for Day 0", async () => {
    const addMock = vi.fn().mockRejectedValue(new Error("redis write failed"));
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
    vi.doMock("./connection.js", async () => {
      const actual =
        await vi.importActual<typeof import("./connection.js")>(
          "./connection.js",
        );
      return {
        ...actual,
        createBullConnection: vi.fn(() => ({ quit: vi.fn() })),
      };
    });

    vi.resetModules();
    const mod = await import("./ftuxDrip.js");
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    mod.__resetFtuxDripQueueForTesting();
    mod.registerFtuxDripDispatcher(dispatcher);

    await mod.enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_0",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 0,
    });
    await mod.enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_3",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 259_200_000,
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(addMock).toHaveBeenCalledTimes(2);
    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(dispatcher).toHaveBeenCalledWith(
      expect.objectContaining({ day: "day_0" }),
    );
  });

  it("worker lifecycle samples depth and closes worker plus queue connections", async () => {
    const queueConnection = {
      quit: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    const workerConnection = {
      quit: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    const addMock = vi.fn().mockResolvedValue({ id: "1" });
    const queueCloseMock = vi.fn().mockResolvedValue(undefined);
    const workerCloseMock = vi.fn().mockResolvedValue(undefined);
    const workerOnMock = vi.fn();
    const getJobCountsMock = vi.fn().mockResolvedValue({
      waiting: 1,
      active: 2,
      delayed: 3,
      failed: 4,
    });
    let workerArgs: unknown[] | null = null;
    function MockQueue(this: unknown) {
      return {
        add: addMock,
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
    vi.doMock("./connection.js", async () => {
      const actual =
        await vi.importActual<typeof import("./connection.js")>(
          "./connection.js",
        );
      return {
        ...actual,
        createBullConnection: vi.fn((name: string) =>
          name === "ftux-drip-worker" ? workerConnection : queueConnection,
        ),
      };
    });

    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import("./ftuxDrip.js");
    mod.__resetFtuxDripQueueForTesting();

    await mod.enqueueFtuxDripMail({
      kind: "ftux_drip",
      day: "day_1",
      userId: "u1",
      email: "u1@example.com",
      delayMs: 86_400_000,
    });
    const started = mod.startFtuxDripWorker();
    const secondStart = mod.startFtuxDripWorker();
    await vi.advanceTimersByTimeAsync(30_000);
    await secondStart?.close();

    expect(started).not.toBeNull();
    expect(workerArgs?.[0]).toBe("ftux-drip");
    expect(workerArgs?.[2]).toMatchObject({
      prefix: "sergeant",
      concurrency: 3,
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
  });
});
