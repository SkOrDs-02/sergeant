/**
 * Read-path subscription for the Finyk SQLite cutover (mobile).
 *
 * Mirrors the web file at
 * `apps/web/src/modules/finyk/lib/sqliteReadGate.ts`. The mobile Finyk
 * module spreads its persisted state across multiple stores (transactions,
 * budgets, assets, …), each reading directly from MMKV on mount. To
 * overlay SQLite reads we keep a tiny in-process pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) bumps the tick after
 *    a successful migration + cache refresh,
 *  - and every store hook re-reads on the next render.
 *
 * Stage 8 PR #057k-flag — `feature.finyk.sqlite_v2.read_sqlite` was
 * graduated out of the registry; the overlay now fires unconditionally
 * once the cache is warm. Tick-only API kept for cache-refresh signaling.
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
 * Tick counter that bumps every time
 * {@link notifyFinykSqliteCacheRefresh} fires.
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
