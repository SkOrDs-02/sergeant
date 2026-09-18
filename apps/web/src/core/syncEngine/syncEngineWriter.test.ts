import { describe, expect, it, vi } from "vitest";

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

  it("flushes immediately on enqueue notifications", async () => {
    const deps = makeDeps();
    const runtime = createSyncEngineWriterRuntime(deps);
    runtime.start();

    runtime.notifyEnqueued();
    await Promise.resolve();

    const scheduler = firstMockResult(vi.mocked(deps.createScheduler));
    expect(scheduler.flushNow).toHaveBeenCalledTimes(1);
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
