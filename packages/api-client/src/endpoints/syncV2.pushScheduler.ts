import {
  runSyncEnginePushOnce,
  type SyncEnginePushDeps,
  type SyncEnginePushOptions,
  type SyncEnginePushResult,
} from "./syncV2.pushLoop";

/**
 * Composable, dependency-injected scheduler that turns the one-tick
 * push-loop ({@link runSyncEnginePushOnce}, PR #042e-pushloop) into a
 * long-running daemon with `start` / `stop` / `flushNow` semantics.
 *
 * Stage 5 PR #042e-scheduler of `docs/planning/storage-roadmap.md`.
 * Pairs with PR #042e-pushloop (the one-tick orchestrator), which
 * itself sits on top of PR #042e-drain + PR #042e-lifecycle. This
 * module is the next composable layer up; it owns timer state and
 * concurrency control but does NOT decide when to start (that lives
 * in the sync-engine boot path, scheduled for a follow-up wiring PR).
 *
 * Why a factory rather than a class? Two reasons:
 *
 *   1. The factory closes over private `inflight` / `intervalHandle`
 *      state without exposing the fields. Callers can only touch the
 *      surface returned in the {@link SyncEnginePushScheduler}
 *      contract, which keeps the concurrency invariants enforceable
 *      from the outside.
 *   2. It matches the existing factory-style of `createApiClient`,
 *      `createSyncV2Endpoints`, etc. in this package — same DI shape,
 *      same testability story (pin every dep, no real timers).
 *
 * Concurrency contract — pinned by tests:
 *
 *   - At most ONE tick runs at any given moment. If a periodic
 *     interval fires while a tick is in flight, the new tick is
 *     dropped (and `onSkippedTick` is invoked once, if provided).
 *     The next interval pick-up will drain whatever rows the dropped
 *     tick would have, so no rows are lost — they just wait one
 *     period longer.
 *   - If `flushNow()` is called while a tick is in flight, the same
 *     {@link Promise} is returned to all callers — they all observe
 *     the same {@link SyncEnginePushResult} (or the same thrown
 *     error). No two ticks ever execute simultaneously, even if
 *     `flushNow` is called many times in a row.
 *   - `start()` is idempotent — calling it on an already-running
 *     scheduler is a no-op, not a duplicate interval. Likewise for
 *     `stop()`. Either is safe to call before `start()` and after
 *     another `stop()`.
 *   - `stop()` does NOT cancel an in-flight tick. Pending HTTP and
 *     SQLite writes complete normally. To drain before teardown,
 *     callers should `await scheduler.flushNow()` (or
 *     `await scheduler.isTicking() ? wait : 0`) and then call
 *     `stop()`.
 *
 * Error policy:
 *
 *   - Errors thrown by `runSyncEnginePushOnce` (drain failure,
 *     lifecycle write failure, push failure that the orchestrator
 *     didn't catch — should be none in practice) propagate to
 *     `flushNow()` callers. The interval-driven path catches them
 *     and routes to `onTickError(err)` (default no-op) so the daemon
 *     never crashes from a single bad tick.
 *   - Periodic ticks never re-throw — `onTickError` is the only
 *     observability hook for them.
 *
 * Wiring example (illustrative; not part of this module):
 *
 * ```ts
 * const scheduler = createSyncEnginePushScheduler(
 *   {
 *     push: {
 *       drain: (opts) => drainSyncOpOutbox(sqliteClient, opts),
 *       push: (ops, opts) => syncV2.pushV2(ops, opts),
 *       markSuccess: (id) => markOutboxSuccess(sqliteClient, id),
 *       markRetry: (id, plan) => markOutboxRetry(sqliteClient, id, plan),
 *       markRejected: (id, reason) =>
 *         markOutboxRejected(sqliteClient, id, reason),
 *       planRetry,
 *       now: () => new Date(),
 *     },
 *     setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
 *     clearInterval: (handle) => globalThis.clearInterval(handle as never),
 *     onTickError: (err) => Sentry.captureException(err),
 *     onTickComplete: (result) =>
 *       Sentry.addBreadcrumb({ category: "sync.push", data: result }),
 *   },
 *   { intervalMs: 30_000, limit: 100, originDeviceId },
 * );
 *
 * scheduler.start();
 * window.addEventListener("online", () => {
 *   scheduler.flushNow().catch(() => {});
 * });
 * ```
 */

/**
 * DI: timer primitives. Abstracted as plain functions so:
 *
 *   - Production wiring binds `globalThis.setInterval` /
 *     `globalThis.clearInterval` (returns `NodeJS.Timeout` in Node /
 *     `number` in browsers — both assignable to `unknown`).
 *   - Tests use vitest fake timers via thin wrappers, OR a manual
 *     queue-based fake when finer control is needed.
 *
 * The handle is treated as opaque — the scheduler never inspects it,
 * only round-trips it back to `clearInterval`.
 */
export type SyncEngineSetIntervalFn = (
  handler: () => void,
  ms: number,
) => unknown;

export type SyncEngineClearIntervalFn = (handle: unknown) => void;

export interface SyncEnginePushSchedulerDeps {
  /**
   * Underlying push-loop deps. Threaded into
   * {@link runSyncEnginePushOnce} verbatim on every tick.
   */
  readonly push: SyncEnginePushDeps;
  /**
   * Recurring-callback primitive. The scheduler calls this exactly
   * once per `start()`, never reschedules within a tick.
   */
  readonly setInterval: SyncEngineSetIntervalFn;
  /**
   * Cancel-callback primitive. The scheduler calls this exactly once
   * per `stop()` (only when an interval is currently armed).
   */
  readonly clearInterval: SyncEngineClearIntervalFn;
  /**
   * Optional observer for periodic-tick errors. Periodic ticks never
   * re-throw — this is the sole signal that a tick failed.
   *
   * Defaults to a no-op so the scheduler is silent unless wired up.
   */
  readonly onTickError?: (err: unknown) => void;
  /**
   * Optional observer fired when a periodic interval fires while a
   * tick is already in flight. Called once per skipped fire.
   *
   * Defaults to a no-op.
   */
  readonly onSkippedTick?: () => void;
  /**
   * Optional observer fired after each successful tick (periodic or
   * `flushNow`). Receives the tick's {@link SyncEnginePushResult}.
   * Useful for telemetry / Sentry breadcrumbs.
   *
   * Defaults to a no-op.
   */
  readonly onTickComplete?: (result: SyncEnginePushResult) => void;
}

export interface SyncEnginePushSchedulerOptions extends SyncEnginePushOptions {
  /**
   * Period in milliseconds between periodic ticks. Must be a finite
   * positive number; the constructor throws otherwise.
   *
   * The first periodic tick fires `intervalMs` after `start()` (NOT
   * immediately). To trigger an immediate tick, call `flushNow()`
   * after `start()`.
   */
  readonly intervalMs: number;
}

export interface SyncEnginePushScheduler {
  /**
   * Arm the periodic interval. Idempotent — a second call before
   * `stop()` is a no-op (no duplicate interval).
   */
  start(): void;
  /**
   * Disarm the periodic interval. Idempotent — safe to call before
   * any `start()` and safe to double-call.
   *
   * Does NOT cancel an in-flight tick. Pending HTTP / SQLite writes
   * complete normally. Callers that need a fully drained state
   * should `await scheduler.flushNow()` first.
   */
  stop(): void;
  /**
   * Trigger a tick immediately. If a tick is already in flight (from
   * a previous `flushNow()` or a periodic fire), the same Promise is
   * returned to all callers so they share the outcome.
   *
   * Re-throws any error thrown by `runSyncEnginePushOnce`; this is
   * the only path where errors are observable to user code (periodic
   * ticks route them through `onTickError`).
   */
  flushNow(): Promise<SyncEnginePushResult>;
  /**
   * Inspect: is the periodic interval currently armed (between
   * `start()` and the next `stop()`)?
   */
  readonly isRunning: () => boolean;
  /**
   * Inspect: is a tick currently in flight (between the start of a
   * `runSyncEnginePushOnce` call and the resolution of its Promise)?
   */
  readonly isTicking: () => boolean;
}

/**
 * Factory. Validates `intervalMs`, returns the scheduler surface.
 * No timer is armed until `start()`; no tick runs until `start()`
 * fires its first interval or `flushNow()` is called.
 */
export function createSyncEnginePushScheduler(
  deps: SyncEnginePushSchedulerDeps,
  options: SyncEnginePushSchedulerOptions,
): SyncEnginePushScheduler {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error(
      `createSyncEnginePushScheduler: intervalMs must be a positive finite number, got ${String(
        options.intervalMs,
      )}`,
    );
  }

  let intervalHandle: unknown = null;
  let inflight: Promise<SyncEnginePushResult> | null = null;

  const onTickError = deps.onTickError;
  const onSkippedTick = deps.onSkippedTick;
  const onTickComplete = deps.onTickComplete;

  const tick = (): Promise<SyncEnginePushResult> => {
    if (inflight !== null) {
      return inflight;
    }
    const tickOptions: SyncEnginePushOptions =
      options.originDeviceId === undefined
        ? { limit: options.limit }
        : { limit: options.limit, originDeviceId: options.originDeviceId };
    const promise = (async () => {
      try {
        const result = await runSyncEnginePushOnce(deps.push, tickOptions);
        onTickComplete?.(result);
        return result;
      } finally {
        inflight = null;
      }
    })();
    inflight = promise;
    return promise;
  };

  const periodicTick = (): void => {
    if (inflight !== null) {
      onSkippedTick?.();
      return;
    }
    tick().catch((err: unknown) => {
      onTickError?.(err);
    });
  };

  return {
    start(): void {
      if (intervalHandle !== null) {
        return;
      }
      intervalHandle = deps.setInterval(periodicTick, options.intervalMs);
    },
    stop(): void {
      if (intervalHandle === null) {
        return;
      }
      const handle = intervalHandle;
      intervalHandle = null;
      deps.clearInterval(handle);
    },
    flushNow(): Promise<SyncEnginePushResult> {
      return tick();
    },
    isRunning(): boolean {
      return intervalHandle !== null;
    },
    isTicking(): boolean {
      return inflight !== null;
    },
  };
}
