import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncV2OpKind } from "./syncV2";

import type {
  DrainSyncOpOutboxFn,
  DrainedOutboxRowShape,
  MarkOutboxRejectedFn,
  MarkOutboxRetryFn,
  MarkOutboxSuccessFn,
  PlanRetryFn,
  SyncEnginePushDeps,
  SyncEnginePushResult,
  SyncOpRetryPlanShape,
  SyncV2PushFn,
} from "./syncV2.pushLoop";

import {
  createSyncEnginePushScheduler,
  type SyncEngineClearIntervalFn,
  type SyncEnginePushScheduler,
  type SyncEnginePushSchedulerDeps,
  type SyncEnginePushSchedulerOptions,
  type SyncEngineSetIntervalFn,
} from "./syncV2.pushScheduler";

// Stage 5 PR #042e-scheduler (`docs/planning/storage-roadmap.md`).
//
// The scheduler is the next composable layer above
// `runSyncEnginePushOnce` (PR #042e-pushloop): it owns timer state,
// concurrency control, and the `start` / `stop` / `flushNow` surface
// that the sync-engine boot path will eventually call. Production
// wiring stays in a follow-up — these tests pin the contract:
//
//   - One tick at a time. Periodic interval fires that overlap an
//     in-flight tick are dropped (and `onSkippedTick` is invoked).
//     `flushNow()` calls during an in-flight tick share the same
//     Promise.
//   - `start` / `stop` are idempotent on both directions.
//   - `start()` does NOT fire an immediate tick; the first periodic
//     tick fires `intervalMs` later.
//   - `stop()` does not cancel an in-flight tick.
//   - Periodic-tick errors route to `onTickError`; `flushNow()`
//     errors propagate to the caller.
//   - `intervalMs` validation throws synchronously in the factory.
//
// The scheduler is timer-driven, so tests use vitest fake timers.
// `runSyncEnginePushOnce`'s deps are stubbed with `vi.fn()` to keep
// the focus on scheduler behavior — pushLoop dispatch is covered
// exhaustively in `syncV2.pushLoop.test.ts`.

const IDEM = "fixture-scheduler-001"; // gitleaks:allow
const NOW = new Date("2026-05-05T12:00:00.000Z");

function makeRow(id: number): DrainedOutboxRowShape {
  return {
    id,
    table: "routine_streaks",
    op: "increment" as SyncV2OpKind,
    row: { delta: 1 },
    clientTs: "2026-05-05T11:59:00.000Z",
    idempotencyKey: `${IDEM}-${id}`,
    attempts: 0,
    nextRetryAt: null,
    lastError: null,
    createdAt: "2026-05-05T11:58:00.000Z",
  };
}

interface PushDepsHandle {
  readonly deps: SyncEnginePushDeps;
  readonly drain: ReturnType<typeof vi.fn> & DrainSyncOpOutboxFn;
  readonly push: ReturnType<typeof vi.fn> & SyncV2PushFn;
  readonly markSuccess: ReturnType<typeof vi.fn> & MarkOutboxSuccessFn;
  readonly markRetry: ReturnType<typeof vi.fn> & MarkOutboxRetryFn;
  readonly markRejected: ReturnType<typeof vi.fn> & MarkOutboxRejectedFn;
  readonly planRetry: ReturnType<typeof vi.fn> & PlanRetryFn;
  readonly now: ReturnType<typeof vi.fn> & (() => Date);
}

function makePushDeps(): PushDepsHandle {
  const drain = vi.fn(async () => [] as readonly DrainedOutboxRowShape[]);
  const push = vi.fn(async () => ({
    accepted: 0,
    last_op_id: 0,
    results: [] as never[],
  }));
  const markSuccess = vi.fn(async () => undefined);
  const markRetry = vi.fn(async () => undefined);
  const markRejected = vi.fn(async () => undefined);
  const planRetry = vi.fn(
    (
      previousAttempts: number,
      _now: Date,
      lastError: string,
    ): SyncOpRetryPlanShape => ({
      attempts: previousAttempts + 1,
      status: "pending",
      nextRetryAt: "2026-05-05T12:01:00.000Z",
      lastError,
    }),
  );
  const now = vi.fn(() => NOW);

  return {
    deps: {
      drain,
      push,
      markSuccess,
      markRetry,
      markRejected,
      planRetry,
      now,
    },
    drain: drain as ReturnType<typeof vi.fn> & DrainSyncOpOutboxFn,
    push: push as ReturnType<typeof vi.fn> & SyncV2PushFn,
    markSuccess: markSuccess as ReturnType<typeof vi.fn> & MarkOutboxSuccessFn,
    markRetry: markRetry as ReturnType<typeof vi.fn> & MarkOutboxRetryFn,
    markRejected: markRejected as ReturnType<typeof vi.fn> &
      MarkOutboxRejectedFn,
    planRetry: planRetry as ReturnType<typeof vi.fn> & PlanRetryFn,
    now: now as ReturnType<typeof vi.fn> & (() => Date),
  };
}

interface ManualTimer {
  readonly id: number;
  readonly handler: () => void;
  readonly intervalMs: number;
}

interface ManualIntervalHandle {
  readonly setInterval: ReturnType<typeof vi.fn> & SyncEngineSetIntervalFn;
  readonly clearInterval: ReturnType<typeof vi.fn> & SyncEngineClearIntervalFn;
  readonly active: () => readonly ManualTimer[];
}

function makeManualInterval(): ManualIntervalHandle {
  const timers = new Map<number, ManualTimer>();
  let nextId = 1;
  const setInterval = vi.fn((handler: () => void, intervalMs: number) => {
    const id = nextId;
    nextId += 1;
    timers.set(id, { id, handler, intervalMs });
    return id;
  });
  const clearInterval = vi.fn((handle: unknown) => {
    if (typeof handle === "number") {
      timers.delete(handle);
    }
  });
  return {
    setInterval: setInterval as ReturnType<typeof vi.fn> &
      SyncEngineSetIntervalFn,
    clearInterval: clearInterval as ReturnType<typeof vi.fn> &
      SyncEngineClearIntervalFn,
    active: () => Array.from(timers.values()),
  };
}

interface SchedulerHandle {
  readonly scheduler: SyncEnginePushScheduler;
  readonly pushDeps: PushDepsHandle;
  readonly interval: ManualIntervalHandle;
  readonly onTickError: ReturnType<typeof vi.fn>;
  readonly onSkippedTick: ReturnType<typeof vi.fn>;
  readonly onTickComplete: ReturnType<typeof vi.fn>;
}

function makeScheduler(
  overrides: Partial<SyncEnginePushSchedulerOptions> &
    Partial<{
      readonly omitOnTickError: boolean;
      readonly omitOnSkippedTick: boolean;
      readonly omitOnTickComplete: boolean;
    }> = {},
): SchedulerHandle {
  const pushDeps = makePushDeps();
  const interval = makeManualInterval();
  const onTickError = vi.fn();
  const onSkippedTick = vi.fn();
  const onTickComplete = vi.fn();

  const deps: SyncEnginePushSchedulerDeps = {
    push: pushDeps.deps,
    setInterval: interval.setInterval,
    clearInterval: interval.clearInterval,
    ...(overrides.omitOnTickError ? {} : { onTickError }),
    ...(overrides.omitOnSkippedTick ? {} : { onSkippedTick }),
    ...(overrides.omitOnTickComplete ? {} : { onTickComplete }),
  };

  const baseOptions: SyncEnginePushSchedulerOptions = {
    intervalMs: overrides.intervalMs ?? 1000,
    limit: overrides.limit ?? 50,
    ...(overrides.originDeviceId === undefined
      ? {}
      : { originDeviceId: overrides.originDeviceId }),
  };

  const scheduler = createSyncEnginePushScheduler(deps, baseOptions);

  return {
    scheduler,
    pushDeps,
    interval,
    onTickError,
    onSkippedTick,
    onTickComplete,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ────────────────────────────────────────────────────────────────────
// Group 1 — factory validation
// ────────────────────────────────────────────────────────────────────

describe("createSyncEnginePushScheduler — factory validation", () => {
  it("throws synchronously on intervalMs=0", () => {
    expect(() =>
      makeScheduler({ intervalMs: 0 }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: createSyncEnginePushScheduler: intervalMs must be a positive finite number, got 0]`,
    );
  });

  it("throws synchronously on negative intervalMs", () => {
    expect(() =>
      makeScheduler({ intervalMs: -100 }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: createSyncEnginePushScheduler: intervalMs must be a positive finite number, got -100]`,
    );
  });

  it("throws synchronously on NaN intervalMs", () => {
    expect(() =>
      makeScheduler({ intervalMs: Number.NaN }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: createSyncEnginePushScheduler: intervalMs must be a positive finite number, got NaN]`,
    );
  });

  it("throws synchronously on Infinity intervalMs", () => {
    expect(() =>
      makeScheduler({ intervalMs: Number.POSITIVE_INFINITY }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: createSyncEnginePushScheduler: intervalMs must be a positive finite number, got Infinity]`,
    );
  });

  it("does not arm the timer on construction", () => {
    const { interval, scheduler } = makeScheduler();
    expect(interval.setInterval).not.toHaveBeenCalled();
    expect(interval.active()).toHaveLength(0);
    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.isTicking()).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Group 2 — start / stop idempotency + timer lifecycle
// ────────────────────────────────────────────────────────────────────

describe("createSyncEnginePushScheduler — start/stop lifecycle", () => {
  it("start arms exactly one interval at the configured period", () => {
    const { interval, scheduler } = makeScheduler({ intervalMs: 5000 });

    scheduler.start();

    expect(interval.setInterval).toHaveBeenCalledTimes(1);
    expect(interval.setInterval).toHaveBeenCalledWith(
      expect.any(Function),
      5000,
    );
    expect(interval.active()).toHaveLength(1);
    expect(scheduler.isRunning()).toBe(true);
  });

  it("start is idempotent — second call before stop is a no-op", () => {
    const { interval, scheduler } = makeScheduler();

    scheduler.start();
    scheduler.start();
    scheduler.start();

    expect(interval.setInterval).toHaveBeenCalledTimes(1);
    expect(interval.active()).toHaveLength(1);
  });

  it("stop disarms the interval", () => {
    const { interval, scheduler } = makeScheduler();

    scheduler.start();
    scheduler.stop();

    expect(interval.clearInterval).toHaveBeenCalledTimes(1);
    expect(interval.active()).toHaveLength(0);
    expect(scheduler.isRunning()).toBe(false);
  });

  it("stop is idempotent — called before any start is a no-op", () => {
    const { interval, scheduler } = makeScheduler();

    scheduler.stop();
    scheduler.stop();

    expect(interval.clearInterval).not.toHaveBeenCalled();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("stop is idempotent — double-call after start clears once", () => {
    const { interval, scheduler } = makeScheduler();

    scheduler.start();
    scheduler.stop();
    scheduler.stop();

    expect(interval.clearInterval).toHaveBeenCalledTimes(1);
  });

  it("start after stop arms a fresh interval", () => {
    const { interval, scheduler } = makeScheduler();

    scheduler.start();
    scheduler.stop();
    scheduler.start();

    expect(interval.setInterval).toHaveBeenCalledTimes(2);
    expect(interval.clearInterval).toHaveBeenCalledTimes(1);
    expect(interval.active()).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Group 3 — flushNow happy path + tick semantics
// ────────────────────────────────────────────────────────────────────

describe("createSyncEnginePushScheduler — flushNow happy path", () => {
  it("returns the empty-drain shape when nothing is queued", async () => {
    const { scheduler, pushDeps } = makeScheduler();
    pushDeps.drain.mockResolvedValueOnce([]);

    const result = await scheduler.flushNow();

    expect(result).toEqual({
      drained: 0,
      pushed: 0,
      retried: 0,
      rejected: 0,
    });
    expect(pushDeps.drain).toHaveBeenCalledTimes(1);
    expect(pushDeps.push).not.toHaveBeenCalled();
  });

  it("threads limit and originDeviceId into runSyncEnginePushOnce", async () => {
    const { scheduler, pushDeps } = makeScheduler({
      limit: 17,
      originDeviceId: "device-xyz",
    });
    pushDeps.drain.mockResolvedValueOnce([makeRow(1)]);
    pushDeps.push.mockResolvedValueOnce({
      accepted: 1,
      last_op_id: 1,
      results: [{ idempotency_key: `${IDEM}-1`, status: "applied" }],
    });

    await scheduler.flushNow();

    expect(pushDeps.drain).toHaveBeenCalledWith({ limit: 17, now: NOW });
    expect(pushDeps.push).toHaveBeenCalledWith(expect.any(Array), {
      originDeviceId: "device-xyz",
    });
  });

  it("calls onTickComplete with the result on success", async () => {
    const { scheduler, pushDeps, onTickComplete } = makeScheduler();
    pushDeps.drain.mockResolvedValueOnce([]);

    const result = await scheduler.flushNow();

    expect(onTickComplete).toHaveBeenCalledTimes(1);
    expect(onTickComplete).toHaveBeenCalledWith(result);
  });

  it("does not require onTickComplete when omitted", async () => {
    const { scheduler, pushDeps } = makeScheduler({ omitOnTickComplete: true });
    pushDeps.drain.mockResolvedValueOnce([]);

    await expect(scheduler.flushNow()).resolves.toEqual({
      drained: 0,
      pushed: 0,
      retried: 0,
      rejected: 0,
    });
  });

  it("flushNow does not require start() — runs a one-off tick", async () => {
    const { scheduler, pushDeps, interval } = makeScheduler();
    pushDeps.drain.mockResolvedValueOnce([]);

    await scheduler.flushNow();

    expect(interval.setInterval).not.toHaveBeenCalled();
    expect(pushDeps.drain).toHaveBeenCalledTimes(1);
  });

  it("isTicking is true during the tick and false after", async () => {
    const { scheduler, pushDeps } = makeScheduler();
    let resolveDrain: (rows: readonly DrainedOutboxRowShape[]) => void = () => {
      throw new Error("drain not awaited");
    };
    pushDeps.drain.mockImplementationOnce(
      () =>
        new Promise<readonly DrainedOutboxRowShape[]>((resolve) => {
          resolveDrain = resolve;
        }),
    );

    const promise = scheduler.flushNow();
    expect(scheduler.isTicking()).toBe(true);

    resolveDrain([]);
    await promise;

    expect(scheduler.isTicking()).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Group 4 — concurrency: flushNow merges in-flight ticks
// ────────────────────────────────────────────────────────────────────

describe("createSyncEnginePushScheduler — flushNow concurrency", () => {
  it("returns the same Promise to overlapping flushNow callers", async () => {
    const { scheduler, pushDeps } = makeScheduler();
    let resolveDrain: (rows: readonly DrainedOutboxRowShape[]) => void = () => {
      throw new Error("drain not awaited");
    };
    pushDeps.drain.mockImplementationOnce(
      () =>
        new Promise<readonly DrainedOutboxRowShape[]>((resolve) => {
          resolveDrain = resolve;
        }),
    );

    const a = scheduler.flushNow();
    const b = scheduler.flushNow();
    const c = scheduler.flushNow();

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(pushDeps.drain).toHaveBeenCalledTimes(1);

    resolveDrain([]);
    await a;
  });

  it("flushNow after the previous tick resolved starts a fresh tick", async () => {
    const { scheduler, pushDeps } = makeScheduler();
    pushDeps.drain.mockResolvedValue([]);

    await scheduler.flushNow();
    await scheduler.flushNow();

    expect(pushDeps.drain).toHaveBeenCalledTimes(2);
  });

  it("all overlapping flushNow callers observe the same result", async () => {
    const { scheduler, pushDeps } = makeScheduler();
    let resolveDrain: (rows: readonly DrainedOutboxRowShape[]) => void = () => {
      throw new Error("drain not awaited");
    };
    pushDeps.drain.mockImplementationOnce(
      () =>
        new Promise<readonly DrainedOutboxRowShape[]>((resolve) => {
          resolveDrain = resolve;
        }),
    );

    const a = scheduler.flushNow();
    const b = scheduler.flushNow();

    resolveDrain([]);
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra).toBe(rb);
    expect(ra).toEqual({ drained: 0, pushed: 0, retried: 0, rejected: 0 });
  });
});

// ────────────────────────────────────────────────────────────────────
// Group 5 — periodic ticks + skipped overlap
// ────────────────────────────────────────────────────────────────────

describe("createSyncEnginePushScheduler — periodic ticks", () => {
  it("does not fire a tick at start() — first tick is one period later", () => {
    const { scheduler, pushDeps } = makeScheduler();

    scheduler.start();

    expect(pushDeps.drain).not.toHaveBeenCalled();
  });

  it("fires drain on each manual interval invocation", async () => {
    const { scheduler, pushDeps, interval } = makeScheduler();
    pushDeps.drain.mockResolvedValue([]);

    scheduler.start();
    const timer = interval.active()[0];
    if (!timer) throw new Error("expected at least one armed interval");
    expect(timer).toBeDefined();

    timer.handler();
    await Promise.resolve();
    await Promise.resolve();

    expect(pushDeps.drain).toHaveBeenCalledTimes(1);
  });

  it("multiple periodic fires after each tick resolves run sequentially", async () => {
    const { scheduler, pushDeps, interval } = makeScheduler();
    pushDeps.drain.mockResolvedValue([]);

    scheduler.start();
    const timer = interval.active()[0];
    if (!timer) throw new Error("expected at least one armed interval");

    timer.handler();
    await Promise.resolve();
    await Promise.resolve();

    timer.handler();
    await Promise.resolve();
    await Promise.resolve();

    expect(pushDeps.drain).toHaveBeenCalledTimes(2);
  });

  it("skips a periodic fire if a tick is in flight and calls onSkippedTick", async () => {
    const { scheduler, pushDeps, interval, onSkippedTick } = makeScheduler();
    let resolveDrain: (rows: readonly DrainedOutboxRowShape[]) => void = () => {
      throw new Error("drain not awaited");
    };
    pushDeps.drain.mockImplementationOnce(
      () =>
        new Promise<readonly DrainedOutboxRowShape[]>((resolve) => {
          resolveDrain = resolve;
        }),
    );

    scheduler.start();
    const timer = interval.active()[0];
    if (!timer) throw new Error("expected at least one armed interval");

    timer.handler();
    timer.handler();
    timer.handler();

    expect(pushDeps.drain).toHaveBeenCalledTimes(1);
    expect(onSkippedTick).toHaveBeenCalledTimes(2);

    resolveDrain([]);
    await Promise.resolve();
    await Promise.resolve();
  });

  it("does not require onSkippedTick when omitted", async () => {
    const { scheduler, pushDeps, interval } = makeScheduler({
      omitOnSkippedTick: true,
    });
    let resolveDrain: (rows: readonly DrainedOutboxRowShape[]) => void = () => {
      throw new Error("drain not awaited");
    };
    pushDeps.drain.mockImplementationOnce(
      () =>
        new Promise<readonly DrainedOutboxRowShape[]>((resolve) => {
          resolveDrain = resolve;
        }),
    );

    scheduler.start();
    const timer = interval.active()[0];
    if (!timer) throw new Error("expected at least one armed interval");

    timer.handler();
    expect(() => timer.handler()).not.toThrow();

    resolveDrain([]);
    await Promise.resolve();
    await Promise.resolve();
  });
});

// ────────────────────────────────────────────────────────────────────
// Group 6 — error policy
// ────────────────────────────────────────────────────────────────────

describe("createSyncEnginePushScheduler — error policy", () => {
  it("flushNow propagates the rejection to the caller", async () => {
    const { scheduler, pushDeps } = makeScheduler();
    const boom = new Error("drain failed");
    pushDeps.drain.mockRejectedValueOnce(boom);

    await expect(scheduler.flushNow()).rejects.toBe(boom);
  });

  it("periodic-tick errors route to onTickError instead of crashing the daemon", async () => {
    const { scheduler, pushDeps, interval, onTickError } = makeScheduler();
    const boom = new Error("transient drain failure");
    pushDeps.drain.mockRejectedValueOnce(boom).mockResolvedValueOnce([]);

    scheduler.start();
    const timer = interval.active()[0];
    if (!timer) throw new Error("expected at least one armed interval");

    timer.handler();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onTickError).toHaveBeenCalledTimes(1);
    expect(onTickError).toHaveBeenCalledWith(boom);

    timer.handler();
    await Promise.resolve();
    await Promise.resolve();

    expect(pushDeps.drain).toHaveBeenCalledTimes(2);
    expect(scheduler.isRunning()).toBe(true);
  });

  it("does not require onTickError when omitted (silent failure)", async () => {
    const { scheduler, pushDeps, interval } = makeScheduler({
      omitOnTickError: true,
    });
    const boom = new Error("drain failed");
    pushDeps.drain.mockRejectedValueOnce(boom);

    scheduler.start();
    const timer = interval.active()[0];
    if (!timer) throw new Error("expected at least one armed interval");

    expect(() => timer.handler()).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(scheduler.isRunning()).toBe(true);
  });

  it("onTickComplete is NOT called when the tick rejects", async () => {
    const { scheduler, pushDeps, onTickComplete } = makeScheduler();
    const boom = new Error("drain failed");
    pushDeps.drain.mockRejectedValueOnce(boom);

    await expect(scheduler.flushNow()).rejects.toBe(boom);

    expect(onTickComplete).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// Group 7 — stop semantics during in-flight tick
// ────────────────────────────────────────────────────────────────────

describe("createSyncEnginePushScheduler — stop during in-flight tick", () => {
  it("stop disarms the timer but does not cancel the in-flight tick", async () => {
    const { scheduler, pushDeps, interval } = makeScheduler();
    let resolveDrain: (rows: readonly DrainedOutboxRowShape[]) => void = () => {
      throw new Error("drain not awaited");
    };
    pushDeps.drain.mockImplementationOnce(
      () =>
        new Promise<readonly DrainedOutboxRowShape[]>((resolve) => {
          resolveDrain = resolve;
        }),
    );

    scheduler.start();
    const flush = scheduler.flushNow();
    expect(scheduler.isTicking()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
    expect(interval.clearInterval).toHaveBeenCalledTimes(1);
    expect(scheduler.isTicking()).toBe(true);

    resolveDrain([]);
    const result = await flush;

    expect(result).toEqual({ drained: 0, pushed: 0, retried: 0, rejected: 0 });
    expect(scheduler.isTicking()).toBe(false);
  });

  it("flushNow after stop still runs (one-off tick semantics)", async () => {
    const { scheduler, pushDeps } = makeScheduler();
    pushDeps.drain.mockResolvedValue([]);

    scheduler.start();
    scheduler.stop();
    const result = await scheduler.flushNow();

    expect(result).toEqual({ drained: 0, pushed: 0, retried: 0, rejected: 0 });
    expect(pushDeps.drain).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Group 8 — drift tripwire: scheduler is a thin wrapper around pushLoop
// ────────────────────────────────────────────────────────────────────

describe("createSyncEnginePushScheduler — pushLoop wrapping invariant", () => {
  it("forwards the per-tick result shape from runSyncEnginePushOnce", async () => {
    const { scheduler, pushDeps } = makeScheduler();
    pushDeps.drain.mockResolvedValueOnce([makeRow(1), makeRow(2)]);
    pushDeps.push.mockResolvedValueOnce({
      accepted: 2,
      last_op_id: 2,
      results: [
        { idempotency_key: `${IDEM}-1`, status: "applied" },
        {
          idempotency_key: `${IDEM}-2`,
          status: "rejected",
          reason: "tombstoned",
        },
      ],
    });

    const result = await scheduler.flushNow();

    expect(result).toEqual({
      drained: 2,
      pushed: 1,
      retried: 0,
      rejected: 1,
    });

    // Scheduler is a wrapper — one tick reaches all five lifecycle DI's
    // exactly the way runSyncEnginePushOnce drives them.
    expect(pushDeps.markSuccess).toHaveBeenCalledTimes(1);
    expect(pushDeps.markRejected).toHaveBeenCalledTimes(1);
    expect(pushDeps.markRetry).not.toHaveBeenCalled();
  });

  it("type-only check: scheduler.flushNow returns the same shape as runSyncEnginePushOnce", () => {
    // Compile-time assertion: SyncEnginePushScheduler#flushNow's
    // resolved value must be assignable to SyncEnginePushResult. If
    // pushLoop's return shape ever drifts, this test fails to type-
    // check (it never runs at runtime).
    const _typeCheck = (
      s: SyncEnginePushScheduler,
    ): Promise<SyncEnginePushResult> => s.flushNow();
    expect(typeof _typeCheck).toBe("function");
  });
});
