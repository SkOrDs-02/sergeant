/**
 * Read-path gate + subscription for the Nutrition SQLite cutover
 * (PR #033 — mobile).
 *
 * Mirrors the web file at
 * `apps/web/src/modules/nutrition/lib/sqliteReadGate.ts`. The mobile
 * Nutrition module spreads its persisted state across multiple hooks
 * (`useNutritionLog`, `useNutritionPantries`, etc.), each reading
 * directly from MMKV on mount. To overlay SQLite reads under the
 * `feature.nutrition.sqlite_v2.read_sqlite` flag we need a tiny
 * in-process pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) flips the gate after
 *    a successful migration + cache refresh,
 *  - and every hook re-reads on the next render.
 *
 * Same shape as `useNutritionSqliteReadTick` /
 * `useNutritionSqliteReadFlag` on the web side, but also exposes a
 * combined `useNutritionSqliteReadGate` hook returning
 * `{ enabled, tick }` so consumer hooks can key a single `useEffect`
 * on both values.
 */

import { useSyncExternalStore } from "react";

import { useFlag } from "@/core/lib/featureFlags";

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
 * Tick counter that bumps every time
 * {@link notifyNutritionSqliteCacheRefresh} fires.
 */
export function useNutritionSqliteReadTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Flag-gated read-overlay enable for the nutrition hooks. */
export function useNutritionSqliteReadFlag(): boolean {
  return useFlag(READ_FLAG_ID);
}

export interface NutritionSqliteReadGate {
  /** Current value of `feature.nutrition.sqlite_v2.read_sqlite`. */
  readonly enabled: boolean;
  /**
   * Tick counter that bumps after every successful cache refresh —
   * use it as a `useEffect` dep so consumers re-overlay when the
   * SQLite cache warms.
   */
  readonly tick: number;
}

/**
 * Combined hook for consumer overlays: returns the flag value AND the
 * cache tick so a single `useEffect([enabled, tick], …)` is enough to
 * keep MMKV first-paint state in sync with the SQLite cache.
 */
export function useNutritionSqliteReadGate(): NutritionSqliteReadGate {
  const enabled = useNutritionSqliteReadFlag();
  const tick = useNutritionSqliteReadTick();
  return { enabled, tick };
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
