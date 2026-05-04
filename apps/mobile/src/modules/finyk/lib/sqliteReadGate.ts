/**
 * Read-path gate + subscription for the Finyk SQLite cutover (mobile).
 *
 * Mirrors the web file at
 * `apps/web/src/modules/finyk/lib/sqliteReadGate.ts`. The mobile Finyk
 * module spreads its persisted state across multiple stores (transactions,
 * budgets, assets, …), each reading directly from MMKV on mount. To
 * overlay SQLite reads under the
 * `feature.finyk.sqlite_v2.read_sqlite` flag we need a tiny in-process
 * pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) flips the gate after
 *    a successful migration + cache refresh,
 *  - and every store hook re-reads on the next render.
 *
 * Same shape as `useFinykSqliteReadTick` / `useFinykSqliteReadFlag`
 * on the web side, but also exposes a combined `useFinykSqliteReadGate`
 * hook returning `{ enabled, tick }` so consumer hooks can key a single
 * `useEffect` on both values.
 */

import { useSyncExternalStore } from "react";

import { useFlag } from "@/core/lib/featureFlags";

const READ_FLAG_ID = "feature.finyk.sqlite_v2.read_sqlite";

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

/** Flag-gated read-overlay enable for the finyk hooks. */
export function useFinykSqliteReadFlag(): boolean {
  return useFlag(READ_FLAG_ID);
}

export interface FinykSqliteReadGate {
  /** Current value of `feature.finyk.sqlite_v2.read_sqlite`. */
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
export function useFinykSqliteReadGate(): FinykSqliteReadGate {
  const enabled = useFinykSqliteReadFlag();
  const tick = useFinykSqliteReadTick();
  return { enabled, tick };
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
