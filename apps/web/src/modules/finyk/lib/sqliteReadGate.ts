/**
 * Read-path subscription for the Finyk SQLite cutover (PR #037).
 *
 * The web Finyk module spreads its persisted state across many slots
 * (`useFinykStorageSlots`), each registered through `usePersist` and
 * therefore reading directly from `localStorage` on mount. To overlay
 * SQLite reads we keep a tiny in-process pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) bumps the tick after
 *    a successful migration + cache refresh,
 *  - and every slot re-reads on the next render.
 *
 * Stage 8 PR #057k-flag — `feature.finyk.sqlite_v2.read_sqlite` was
 * graduated out of the registry; the overlay now fires unconditionally
 * once the cache is warm. Tick-only API kept for cache-refresh signaling.
 *
 * Mirrors `apps/web/src/modules/nutrition/lib/sqliteReadGate.ts` and
 * `apps/web/src/modules/fizruk/lib/sqliteReadGate.ts`.
 */

import { useSyncExternalStore } from "react";

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
 * React hook for components that overlay reads from the SQLite cache.
 * Re-renders whenever {@link notifyFinykSqliteCacheRefresh} fires.
 *
 * Returns the current tick counter — consumers should use the tick
 * value to invalidate memoised reads after the cache warms.
 */
export function useFinykSqliteReadTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Bumps the tick + notifies subscribers so consuming hooks re-render
 * with the latest `getCachedFinykSqliteState()`.
 */
export function notifyFinykSqliteCacheRefresh(): void {
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
export function __resetFinykSqliteReadGateForTests(): void {
  cacheTick = 0;
  listeners.clear();
}
