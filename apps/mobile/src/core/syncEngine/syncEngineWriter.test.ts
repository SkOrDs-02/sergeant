/**
 * Tests for the mobile sync v2 writer runtime.
 *
 * Mirrors `apps/web/src/core/syncEngine/syncEngineWriter.test.ts` so
 * any divergence in DI behaviour between platforms surfaces here.
 */
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
    start: jest.fn(),
    stop: jest.fn(),
    flushNow: jest.fn<Promise<SyncEnginePushResult>, []>().mockResolvedValue({
      drained: 1,
      pushed: 1,
      retried: 0,
      rejected: 0,
    }),
    isRunning: () => false,
    isTicking: () => false,
  };
  const reconnect: SyncEngineFlushOnReconnect = {
    dispose: jest.fn(),
  };

  return {
    createScheduler: jest.fn(() => scheduler),
    createReconnect: jest.fn(() => reconnect),
    pushDeps: {
      drain: jest.fn(),
      push: jest.fn(),
      markSuccess: jest.fn(),
      markRetry: jest.fn(),
      markRejected: jest.fn(),
      planRetry: jest.fn(),
      now: jest.fn(() => new Date("2026-05-06T00:00:00.000Z")),
    },
    setInterval: jest.fn(),
    clearInterval: jest.fn(),
    eventTarget: {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    getStatus: jest.fn().mockResolvedValue({
      pending: 2,
      rejected: 1,
      dead_letter: 3,
    }),
    recoverDeadLetter: jest.fn().mockResolvedValue({
      recovered: [10, 11],
      skipped: [],
    }),
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
    intervalMs: 30_000,
    limit: 100,
  };
}

function firstMockResult<T>(mock: {
  mock: { results: Array<{ value: T }> };
}): T {
  const result = mock.mock.results[0];
  if (!result) {
    throw new Error("expected mock to have at least one result");
  }
  return result.value;
}

describe("createSyncEngineWriterRuntime (mobile)", () => {
  it("starts the scheduler and reconnect adapter exactly once", () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);

    runtime.start();
    runtime.start();

    expect(deps.createScheduler).toHaveBeenCalledTimes(1);
    expect(deps.createReconnect).toHaveBeenCalledTimes(1);
    const scheduler = firstMockResult(jest.mocked(deps.createScheduler!));
    expect(scheduler.start).toHaveBeenCalledTimes(1);
  });

  it("subscribes the reconnect adapter with kind: 'online' (RN has no visibilitychange)", () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);

    runtime.start();

    expect(deps.createReconnect).toHaveBeenCalledTimes(1);
    const reconnectArgs = jest.mocked(deps.createReconnect!).mock.calls[0];
    expect(reconnectArgs).toBeDefined();
    expect(reconnectArgs?.[1]).toEqual({ kind: "online" });
  });

  it("flushes immediately on enqueue notifications", async () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);
    runtime.start();

    runtime.notifyEnqueued();
    await Promise.resolve();

    const scheduler = firstMockResult(jest.mocked(deps.createScheduler!));
    expect(scheduler.flushNow).toHaveBeenCalledTimes(1);
  });

  it("reports tick completions as Sentry breadcrumbs without row payloads", () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);

    runtime.start();

    const schedulerArgs = jest.mocked(deps.createScheduler!).mock.calls[0]?.[0];
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
    const scheduler = firstMockResult(jest.mocked(deps.createScheduler!));
    expect(scheduler.flushNow).toHaveBeenCalledTimes(1);
  });

  it("stops timers and reconnect listeners idempotently", () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);
    runtime.start();

    runtime.stop();
    runtime.stop();

    const scheduler = firstMockResult(jest.mocked(deps.createScheduler!));
    const reconnect = firstMockResult(jest.mocked(deps.createReconnect!));
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
