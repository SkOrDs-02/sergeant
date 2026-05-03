/**
 * Read-path gate + subscription for the Fizruk SQLite cutover (PR #029).
 *
 * The web Фізрук module spreads its persisted state across multiple
 * hooks (`useWorkouts`, `useExerciseCatalog`, `useMeasurements`),
 * each reading directly from `localStorage` on mount. To overlay
 * SQLite reads under the `feature.fizruk.sqlite_v2.read_sqlite` flag
 * we need a tiny in-process pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) flips the gate after
 *    a successful migration + cache refresh,
 *  - and every hook re-reads on the next render.
 *
 * Mirrors the registration shape of the dual-write context but is
 * dramatically simpler — there's only one boolean and one event.
 */

import { useSyncExternalStore } from "react";
import { useFlag } from "../../../core/lib/featureFlags";

const READ_FLAG_ID = "feature.fizruk.sqlite_v2.read_sqlite";

let cacheTick = 0;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): number {
  return cacheTick;
}

/**
 * React-hook for components that overlay reads from the SQLite cache.
 * Re-renders whenever {@link notifyFizrukSqliteCacheRefresh} fires.
 *
 * Returns the current `read_sqlite` flag value AND a tick counter —
 * consumers should rely on `useFizrukSqliteReadFlag()` to gate their
 * overlay logic and on the tick value to invalidate memoised reads.
 */
export function useFizrukSqliteReadTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Flag-gated read-overlay enable for the fizruk hooks. */
export function useFizrukSqliteReadFlag(): boolean {
  return useFlag(READ_FLAG_ID);
}

/**
 * Bumps the tick + notifies subscribers so consuming hooks re-render
 * with the latest `getCachedFizrukSqliteState()`.
 */
export function notifyFizrukSqliteCacheRefresh(): void {
  cacheTick += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* noop — listeners must never break notify */
    }
  }
}

/** Test-only escape hatch: clears subscribers + resets tick. */
export function __resetFizrukSqliteReadGateForTests(): void {
  cacheTick = 0;
  listeners.clear();
}
