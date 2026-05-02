import { useCallback, useMemo, useRef, useState } from "react";
import { trackEvent, ANALYTICS_EVENTS } from "../../observability/analytics";
import { updateDebugSnapshot } from "../debugState";
import { toSyncError } from "../errorNormalizer";
import { syncLog } from "../logger";
import type { SyncCallbacks, SyncError, SyncState } from "../types";

export type { SyncCallbacks };

export interface SyncLifecycle extends SyncCallbacks {
  // --- Legacy field names — kept because existing consumers (App.tsx,
  // UserMenuButton, useCloudSyncHelpers tests) read them. New code should
  // prefer `isSyncing`/`lastSyncAt`/`hasError`/`state`.
  syncing: boolean;
  lastSync: Date | null;
  syncError: string | null;

  // --- Explicit, self-documenting aliases.
  isSyncing: boolean;
  lastSyncAt: Date | null;
  hasError: boolean;

  // --- New state-machine surface.
  /** Current state of the cloud-sync lifecycle. */
  state: SyncState;
  /** Normalized error shape (type, retryable) — `null` on success paths. */
  syncErrorDetail: SyncError | null;

  /**
   * Run `engine` under the in-flight guard: acquires the guard, bumps the
   * sync-id counter, passes `engine` a freshly-bound `SyncCallbacks` that
   * refuse to mutate lifecycle state after a newer sync has started, and
   * releases the guard when the engine settles. Returns `fallback`
   * synchronously if another sync is already in flight.
   *
   * The bound callbacks carry the id assigned at acquisition time. If a
   * later operation bypasses the guard via `claimBusy`, its fresh callbacks
   * (obtained from a subsequent `runExclusive` or from `runBypassed`) use a
   * newer id and any stale callback invocations from the preempted engine
   * become no-ops — they cannot overwrite `state` / `lastSyncAt` /
   * `syncError` belonging to the newer sync.
   */
  runExclusive<T>(
    engine: (cb: SyncCallbacks) => Promise<T>,
    fallback: T,
  ): Promise<T>;

  /**
   * Force-claim the guard and run `engine` with fresh sync-id-bound
   * callbacks. Used by the migration upload path, which must preempt any
   * background retry that is mid-flight.
   */
  runBypassed<T>(engine: (cb: SyncCallbacks) => Promise<T>): Promise<T>;

  /**
   * Force the in-flight flag to `true` without checking. Retained for
   * backward compatibility; new code should prefer `runBypassed` so the
   * bound callbacks are established together with the guard claim.
   */
  claimBusy(): void;
}

/**
 * Pure in-flight guard. Separated from React so the acquire/release contract
 * can be unit-tested without rendering a hook. The React hook below wraps
 * one of these in a ref so it survives re-renders.
 */
export interface InFlightGuard {
  isBusy(): boolean;
  tryAcquire(): boolean;
  release(): void;
  forceClaim(): void;
}

export function createInFlightGuard(): InFlightGuard {
  let busy = false;
  return {
    isBusy: () => busy,
    tryAcquire: () => {
      if (busy) return false;
      busy = true;
      return true;
    },
    release: () => {
      busy = false;
    },
    forceClaim: () => {
      busy = true;
    },
  };
}

/**
 * Runs `fn` iff the guard is free. Always releases the guard on settlement,
 * regardless of whether `fn` resolved, rejected, or returned early without
 * invoking any engine-level callbacks. This is the contract that prevents a
 * stuck-busy state when an engine path (e.g. `pushDirty` with no dirty
 * modules) short-circuits before its own try/finally.
 */
export async function runExclusiveWith<T>(
  guard: InFlightGuard,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!guard.tryAcquire()) return fallback;
  try {
    return await fn();
  } finally {
    guard.release();
  }
}

/**
 * Owns the React state that reflects the cloud-sync lifecycle (`state`,
 * `lastSyncAt`, error) together with the in-flight concurrency guard and
 * a monotonically-increasing sync-id counter. The orchestrator composes
 * these into an `engineArgs` bag once and, for each run, passes freshly
 * bound callbacks (tied to an id) into the engine.
 */
export function useSyncCallbacks(): SyncLifecycle {
  const [state, setStateValue] = useState<SyncState>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncErrorDetail, setSyncErrorDetail] = useState<SyncError | null>(
    null,
  );

  const stateRef = useRef<SyncState>("idle");
  const guardRef = useRef<InFlightGuard>(createInFlightGuard());
  const syncIdCounterRef = useRef<number>(0);
  const activeSyncIdRef = useRef<number>(0);

  const setState = useCallback((next: SyncState, syncId?: number) => {
    const from = stateRef.current;
    if (from === next) return;
    stateRef.current = next;
    setStateValue(next);
    syncLog.stateChange({ from, to: next, syncId });
    updateDebugSnapshot({ state: next });
  }, []);

  /**
   * Build a fresh set of callbacks tied to a specific `syncId`. Each
   * callback short-circuits when its captured id no longer matches the
   * currently-active id, preventing a preempted engine from clobbering
   * state that belongs to the newer sync.
   *
   * `onErrorRaw(err)` is invoked by engines immediately before
   * `onError(message)` and stashes the raw thrown value in a closure slot
   * so the subsequent `onError` call can classify it via `toSyncError`
   * without changing its historical single-argument string signature.
   */
  const makeBoundCallbacks = useCallback(
    (syncId: number): SyncCallbacks => {
      const isActive = () => activeSyncIdRef.current === syncId;
      let lastRawError: { value: unknown; set: boolean } = {
        value: undefined,
        set: false,
      };
      // Захоплюємо старт у закритті, щоб кожен bound-callback-set мав
      // власний таймер — не ділили timestamp з іншим sync-id, навіть
      // якщо два runExclusive-и накладаються через `runBypassed`.
      let startedAt: number | null = null;
      return {
        onStart: () => {
          if (!isActive()) {
            syncLog.supersededCallback({
              kind: "onStart",
              staleSyncId: syncId,
              activeSyncId: activeSyncIdRef.current,
            });
            return;
          }
          syncLog.syncStart({ syncId });
          setErrorMessage(null);
          setSyncErrorDetail(null);
          updateDebugSnapshot({
            lastAction: "sync",
            lastError: null,
            syncId,
          });
          setState("syncing", syncId);
          startedAt = Date.now();
          trackEvent(ANALYTICS_EVENTS.SYNC_STARTED, {});
        },
        onSuccess: (when: Date) => {
          if (!isActive()) {
            syncLog.supersededCallback({
              kind: "onSuccess",
              staleSyncId: syncId,
              activeSyncId: activeSyncIdRef.current,
            });
            return;
          }
          syncLog.syncSuccess({ at: when, syncId });
          setLastSyncAt(when);
          updateDebugSnapshot({
            lastSyncAt: when,
            lastAction: "success",
            lastError: null,
          });
          setState("success", syncId);
          const durationMs = startedAt !== null ? Date.now() - startedAt : 0;
          trackEvent(ANALYTICS_EVENTS.SYNC_SUCCEEDED, {
            duration_ms: durationMs,
          });
        },
        onErrorRaw: (err: unknown) => {
          // Stash the raw error so the subsequent `onError(message)`
          // can classify it without changing its single-arg signature.
          lastRawError = { value: err, set: true };
        },
        onError: (message: string) => {
          if (!isActive()) {
            syncLog.supersededCallback({
              kind: "onError",
              staleSyncId: syncId,
              activeSyncId: activeSyncIdRef.current,
            });
            // Drain the raw-error stash even on a superseded path so it
            // does not leak into a later call in the same closure.
            lastRawError = { value: undefined, set: false };
            return;
          }
          const detail: SyncError = lastRawError.set
            ? toSyncError(lastRawError.value)
            : { message, type: "unknown", retryable: false };
          lastRawError = { value: undefined, set: false };
          syncLog.syncError({ message, error: detail, syncId });
          setErrorMessage(message);
          setSyncErrorDetail(detail);
          updateDebugSnapshot({ lastError: detail, lastAction: "error" });
          setState("error", syncId);
          const durationMs = startedAt !== null ? Date.now() - startedAt : 0;
          trackEvent(ANALYTICS_EVENTS.SYNC_FAILED, {
            error_type: detail.type,
            retryable: detail.retryable,
            duration_ms: durationMs,
          });
        },
        onSettled: () => {
          // Always release the guard, even for superseded callbacks — a
          // stale engine's `finally { onSettled() }` is our signal that
          // the preempted request actually finished, and keeping the
          // guard held would block the newer sync we just started.
          guardRef.current.release();
          if (!isActive()) {
            syncLog.supersededCallback({
              kind: "onSettled",
              staleSyncId: syncId,
              activeSyncId: activeSyncIdRef.current,
            });
            return;
          }
          // If the engine forgot to transition (e.g. bypassed both
          // onSuccess and onError), fall back to `idle` so the UI
          // doesn't stay stuck in `syncing`.
          if (stateRef.current === "syncing") setState("idle", syncId);
        },
      };
    },
    [setState],
  );

  const runExclusive = useCallback(
    async <T>(
      engine: (cb: SyncCallbacks) => Promise<T>,
      fallback: T,
    ): Promise<T> => {
      if (!guardRef.current.tryAcquire()) return fallback;
      syncIdCounterRef.current += 1;
      const mySyncId = syncIdCounterRef.current;
      activeSyncIdRef.current = mySyncId;
      const boundCallbacks = makeBoundCallbacks(mySyncId);
      try {
        return await engine(boundCallbacks);
      } finally {
        // `onSettled` already releases the guard on the happy path; this is
        // a belt-and-braces release for engine paths that throw before
        // reaching their own finally, so the guard cannot stay held.
        guardRef.current.release();
      }
    },
    [makeBoundCallbacks],
  );

  const runBypassed = useCallback(
    async <T>(engine: (cb: SyncCallbacks) => Promise<T>): Promise<T> => {
      guardRef.current.forceClaim();
      syncIdCounterRef.current += 1;
      const mySyncId = syncIdCounterRef.current;
      activeSyncIdRef.current = mySyncId;
      const boundCallbacks = makeBoundCallbacks(mySyncId);
      try {
        return await engine(boundCallbacks);
      } finally {
        guardRef.current.release();
      }
    },
    [makeBoundCallbacks],
  );

  const claimBusy = useCallback(() => {
    guardRef.current.forceClaim();
  }, []);

  // --- Passthrough SyncCallbacks for callers that reach through
  // `SyncLifecycle` itself (rare, but kept for backward compatibility).
  // These use the *latest* active sync-id so they still participate in
  // the guard / no-op-on-supersede contract.
  const onStart = useCallback(() => {
    makeBoundCallbacks(activeSyncIdRef.current).onStart();
  }, [makeBoundCallbacks]);
  const onSuccess = useCallback(
    (when: Date) => {
      makeBoundCallbacks(activeSyncIdRef.current).onSuccess(when);
    },
    [makeBoundCallbacks],
  );
  const onError = useCallback(
    (message: string) => {
      makeBoundCallbacks(activeSyncIdRef.current).onError(message);
    },
    [makeBoundCallbacks],
  );
  const onErrorRaw = useCallback(
    (err: unknown) => {
      const cb = makeBoundCallbacks(activeSyncIdRef.current);
      cb.onErrorRaw?.(err);
    },
    [makeBoundCallbacks],
  );
  const onSettled = useCallback(() => {
    makeBoundCallbacks(activeSyncIdRef.current).onSettled();
  }, [makeBoundCallbacks]);

  const isSyncing = state === "syncing";
  const hasError = state === "error";

  return useMemo<SyncLifecycle>(
    () => ({
      // Legacy aliases.
      syncing: isSyncing,
      lastSync: lastSyncAt,
      syncError: errorMessage,
      // Explicit names.
      isSyncing,
      lastSyncAt,
      hasError,
      // State machine.
      state,
      syncErrorDetail,
      // Callbacks (usable directly but normally invoked via bound callbacks).
      onStart,
      onSuccess,
      onError,
      onErrorRaw,
      onSettled,
      // Concurrency controls.
      runExclusive,
      runBypassed,
      claimBusy,
    }),
    [
      isSyncing,
      lastSyncAt,
      errorMessage,
      hasError,
      state,
      syncErrorDetail,
      onStart,
      onSuccess,
      onError,
      onErrorRaw,
      onSettled,
      runExclusive,
      runBypassed,
      claimBusy,
    ],
  );
}
