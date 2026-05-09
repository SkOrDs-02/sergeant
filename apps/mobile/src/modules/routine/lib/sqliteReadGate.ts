/**
 * Read-path subscription for mobile Routine SQLite cutover.
 *
 * Stage 8 PR #057r-tombstone-mobile of `docs/planning/storage-roadmap.md`.
 * Mirror of `apps/mobile/src/modules/fizruk/lib/sqliteReadGate.ts`. The
 * mobile Routine module no longer reads from the MMKV `hub_routine_v1`
 * blob; the canonical state comes from the SQLite warm cache populated
 * by `bootRoutineSqliteReadPath()`. This file holds the pub-sub pieces
 * so consumer hooks (`useRoutineStore`) re-render once the warm cache
 * is fresh:
 *
 *  - `useRoutineSqliteReadTick()` — re-renders subscribers whenever
 *    {@link notifyRoutineSqliteCacheRefresh} fires.
 *  - `notifyRoutineSqliteCacheRefresh()` — bumps the tick + fans out
 *    to listeners; called from `useRoutineSqliteReadBoot` after a
 *    successful migration + cache refresh, and from the dual-write
 *    write-through path so completions / full-state changes are seen
 *    immediately.
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
 * {@link notifyRoutineSqliteCacheRefresh} fires.
 */
export function useRoutineSqliteReadTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Bumps the tick + notifies subscribers so consuming hooks re-render
 * with the latest `getCachedSqliteRoutineState()` /
 * `getCachedSqliteCompletions()`.
 */
export function notifyRoutineSqliteCacheRefresh(): void {
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
export function __resetRoutineSqliteReadGateForTests(): void {
  cacheTick = 0;
  listeners.clear();
}
