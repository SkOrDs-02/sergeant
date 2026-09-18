/**
 * Read-path gate + subscription for the Nutrition SQLite cutover
 * (PR #033 — mobile).
 *
 * Mirrors the web file at
 * `apps/web/src/modules/nutrition/lib/sqliteReadGate.ts`. The mobile
 * Nutrition module spreads its persisted state across multiple hooks
 * (`useNutritionLog`, `useNutritionPantries`, etc.), each reading
 * directly from MMKV on mount. The SQLite-overlay path uses a tiny
 * in-process pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) bumps the tick after
 *    a successful migration + cache refresh,
 *  - and every hook re-reads on the next render.
 *
 * Stage 8 PR #057n graduated `feature.nutrition.sqlite_v2.read_sqlite`
 * out of the registry — the SQLite overlay is now unconditional once
 * the boot completes (the MMKV first-paint read still acts as the
 * synchronous fallback until the MMKV-reader drop in the follow-up PR).
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
 * {@link notifyNutritionSqliteCacheRefresh} fires. Consumers use this
 * as a `useEffect` dep so they re-overlay when the SQLite cache warms.
 */
export function useNutritionSqliteReadTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
