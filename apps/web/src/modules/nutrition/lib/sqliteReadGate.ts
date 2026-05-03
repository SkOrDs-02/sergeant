/**
 * Read-path gate + subscription for the Nutrition SQLite cutover (PR #033).
 *
 * The web Nutrition module spreads its persisted state across multiple
 * hooks (`useNutritionLog`, `useNutritionPantries`, etc.), each reading
 * directly from `localStorage` on mount. To overlay SQLite reads under
 * the `feature.nutrition.sqlite_v2.read_sqlite` flag we need a tiny
 * in-process pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) flips the gate after
 *    a successful migration + cache refresh,
 *  - and every hook re-reads on the next render.
 *
 * Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadGate.ts`.
 */

import { useSyncExternalStore } from "react";
import { useFlag } from "../../../core/lib/featureFlags";

const READ_FLAG_ID = "feature.nutrition.sqlite_v2.read_sqlite";

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
 * Re-renders whenever {@link notifyNutritionSqliteCacheRefresh} fires.
 *
 * Returns the current tick counter — consumers should rely on
 * `useNutritionSqliteReadFlag()` to gate their overlay logic and on
 * the tick value to invalidate memoised reads.
 */
export function useNutritionSqliteReadTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Flag-gated read-overlay enable for the nutrition hooks. */
export function useNutritionSqliteReadFlag(): boolean {
  return useFlag(READ_FLAG_ID);
}

/**
 * Bumps the tick + notifies subscribers so consuming hooks re-render
 * with the latest `getCachedNutritionSqliteState()`.
 */
export function notifyNutritionSqliteCacheRefresh(): void {
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
export function __resetNutritionSqliteReadGateForTests(): void {
  cacheTick = 0;
  listeners.clear();
}
