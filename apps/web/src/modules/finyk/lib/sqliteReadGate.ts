/**
 * Read-path gate + subscription for the Finyk SQLite cutover (PR #037).
 *
 * The web Finyk module spreads its persisted state across many slots
 * (`useFinykStorageSlots`), each registered through `usePersist` and
 * therefore reading directly from `localStorage` on mount. To overlay
 * SQLite reads under the `feature.finyk.sqlite_v2.read_sqlite` flag we
 * need a tiny in-process pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) flips the gate after
 *    a successful migration + cache refresh,
 *  - and every slot re-reads on the next render.
 *
 * Mirrors `apps/web/src/modules/nutrition/lib/sqliteReadGate.ts` and
 * `apps/web/src/modules/fizruk/lib/sqliteReadGate.ts`.
 */

import { useSyncExternalStore } from "react";
import { useFlag } from "../../../core/lib/featureFlags";

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
 * React hook for components that overlay reads from the SQLite cache.
 * Re-renders whenever {@link notifyFinykSqliteCacheRefresh} fires.
 *
 * Returns the current tick counter — consumers should rely on
 * `useFinykSqliteReadFlag()` to gate their overlay logic and on
 * the tick value to invalidate memoised reads.
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
   * Tick counter that bumps after every successful cache refresh — use
   * it as a `useEffect` dep so consumers re-overlay when the SQLite
   * cache warms.
   */
  readonly tick: number;
}

/**
 * Combined hook for consumer overlays: returns the flag value AND the
 * cache tick so a single `useEffect([enabled, tick], …)` is enough to
 * keep LS first-paint state in sync with the SQLite cache.
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
