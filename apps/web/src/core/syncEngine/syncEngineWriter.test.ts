import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  SyncEngineFlushOnReconnect,
  SyncEnginePushResult,
} from "@sergeant/api-client";

import {
  createSyncEngineWriterRuntime,
  type SyncEngineWriterDeps,
} from "./syncEngineWriter";

function makeDeps(): SyncEngineWriterDeps {
  const scheduler = {
    start: vi.fn(),
    stop: vi.fn(),
    flushNow: vi.fn<() => Promise<SyncEnginePushResult>>().mockResolvedValue({
      drained: 1,
      pushed: 1,
      retried: 0,
      rejected: 0,
    }),
    isRunning: () => false,
    isTicking: () => false,
  };
  const reconnect: SyncEngineFlushOnReconnect = {
    dispose: vi.fn(),
  };

  return {
    createScheduler: vi.fn(() => scheduler),
    createReconnect: vi.fn(() => reconnect),
    pushDeps: {
      drain: vi.fn(),
      push: vi.fn(),
      markSuccess: vi.fn(),
      markRetry: vi.fn(),
      markRejected: vi.fn(),
      planRetry: vi.fn(),
      now: vi.fn(() => new Date("2026-05-06T00:00:00.000Z")),
    },
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    eventTarget: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    getStatus: vi.fn().mockResolvedValue({
      pending: 2,
      rejected: 1,
      dead_letter: 3,
    }),
    recoverDeadLetter: vi.fn().mockResolvedValue({
      recovered: [10, 11],
      skipped: [],
    }),
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    intervalMs: 30_000,
    limit: 100,
  };
}

function firstMockResult<T>(
  mock: { mock: { results: Array<{ value: T }> } } | undefined,
): T {
  if (!mock) {
    throw new Error("expected mock to be defined");
  }
  const result = mock.mock.results[0];
  if (!result) {
    throw new Error("expected mock to have at least one result");
  }
  return result.value;
}

describe("createSyncEngineWriterRuntime", () => {
  it("starts the scheduler and reconnect adapter exactly once", () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);

    runtime.start();
    runtime.start();

    expect(deps.createScheduler).toHaveBeenCalledTimes(1);
    expect(deps.createReconnect).toHaveBeenCalledTimes(1);
    const scheduler = firstMockResult(vi.mocked(deps.createScheduler));
    expect(scheduler.start).toHaveBeenCalledTimes(1);
  });

  describe("notifyEnqueued — коалесинг (rel-08)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("20 enqueue-ів за 500 мс дають один flushNow після вікна тиші", async () => {
      vi.useFakeTimers();
      const deps = makeDeps();
      const runtime = createSyncEngineWriterRuntime(deps);
      runtime.start();
      const scheduler = firstMockResult(vi.mocked(deps.createScheduler));

      for (let i = 0; i < 20; i += 1) {
        runtime.notifyEnqueued();
        await vi.advanceTimersByTimeAsync(25);
      }
      // Усередині вікна тиші (1,5 с) push ще не йшов.
      expect(scheduler.flushNow).not.toHaveBeenCalled();

      // Останній enqueue був 25 мс тому: до кінця вікна лишається 1 475 мс.
      await vi.advanceTimersByTimeAsync(1_474);
      expect(scheduler.flushNow).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(scheduler.flushNow).toHaveBeenCalledTimes(1);

      // Подальший час тихий: стеля-таймер серії скинуто, повторів нема.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(scheduler.flushNow).toHaveBeenCalledTimes(1);
    });

    it("безперервне введення не відкладає push довше за стелю 5 с", async () => {
      vi.useFakeTimers();
      const deps = makeDeps();
      const runtime = createSyncEngineWriterRuntime(deps);
      runtime.start();
      const scheduler = firstMockResult(vi.mocked(deps.createScheduler));

      // Enqueue кожну секунду: тиша 1,5 с ніколи не настає.
      for (let t = 0; t < 4_000; t += 1_000) {
        runtime.notifyEnqueued();
        await vi.advanceTimersByTimeAsync(1_000);
      }
      expect(scheduler.flushNow).not.toHaveBeenCalled();

      runtime.notifyEnqueued();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(scheduler.flushNow).toHaveBeenCalledTimes(1);
    });

    it("явний flushNow лишається негайним", async () => {
      vi.useFakeTimers();
      const deps = makeDeps();
      const runtime = createSyncEngineWriterRuntime(deps);
      runtime.start();
      const scheduler = firstMockResult(vi.mocked(deps.createScheduler));

      runtime.notifyEnqueued();
      await runtime.flushNow();

      expect(scheduler.flushNow).toHaveBeenCalledTimes(1);
    });

    it("stop() скасовує відкладений push", async () => {
      vi.useFakeTimers();
      const deps = makeDeps();
      const runtime = createSyncEngineWriterRuntime(deps);
      runtime.start();
      const scheduler = firstMockResult(vi.mocked(deps.createScheduler));

      runtime.notifyEnqueued();
      runtime.stop();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(scheduler.flushNow).not.toHaveBeenCalled();
    });
  });

  it("reports tick completions as Sentry breadcrumbs without row payloads", () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);

    runtime.start();

    const schedulerArgs = vi.mocked(deps.createScheduler)?.mock.calls[0]?.[0];
    if (!schedulerArgs) {
      throw new Error("expected scheduler args");
    }
    schedulerArgs.onTickComplete?.({
      drained: 4,
      pushed: 2,
      retried: 1,
      rejected: 1,
    });

    expect(deps.addBreadcrumb).toHaveBeenCalledWith({
      category: "sync.v2.push",
      level: "info",
      message: "sync v2 push tick complete",
      data: { drained: 4, pushed: 2, retried: 1, rejected: 1 },
    });
  });

  it("recovers all dead-letter rows and flushes", async () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);
    runtime.start();

    await expect(runtime.recoverAllDeadLetters()).resolves.toEqual({
      recovered: [10, 11],
      skipped: [],
    });

    expect(deps.recoverDeadLetter).toHaveBeenCalledWith({ all: true });
    const scheduler = firstMockResult(vi.mocked(deps.createScheduler));
    expect(scheduler.flushNow).toHaveBeenCalledTimes(1);
  });

  it("stops timers and reconnect listeners idempotently", () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);
    runtime.start();

    runtime.stop();
    runtime.stop();

    const scheduler = firstMockResult(vi.mocked(deps.createScheduler));
    const reconnect = firstMockResult(vi.mocked(deps.createReconnect));
    expect(scheduler.stop).toHaveBeenCalledTimes(1);
    expect(reconnect.dispose).toHaveBeenCalledTimes(1);
  });

  it("returns status counts from the injected status reader", async () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);

    await expect(runtime.getStatus()).resolves.toEqual({
      pending: 2,
      rejected: 1,
      dead_letter: 3,
    });
  });
});
