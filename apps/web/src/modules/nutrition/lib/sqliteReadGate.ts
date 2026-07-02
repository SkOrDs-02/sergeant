/**
 * Last validated: 2026-06-15
 * Status: Active
 * Read-path gate + subscription for the Nutrition SQLite cutover (PR #033).
 *
 * The web Nutrition module spreads its persisted state across multiple
 * hooks (`useNutritionLog`, `useNutritionPantries`, etc.), each reading
 * directly from `localStorage` on mount. The SQLite-overlay path uses
 * a tiny in-process pub-sub so:
 *
 *  - the boot wiring file (`sqliteReadBoot.ts`) bumps the tick after
 *    a successful migration + cache refresh,
 *  - and every hook re-reads on the next render.
 *
 * Stage 8 PR #057n graduated `feature.nutrition.sqlite_v2.read_sqlite`
 * out of the registry — the SQLite overlay is now unconditional once
 * the boot completes (the LS first-paint read still acts as the
 * synchronous fallback until the LS-reader drop in the follow-up PR).
 *
 * Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadGate.ts`.
 */

import { useSyncExternalStore } from "react";

let cacheTick = 0;
const listeners = new Set<() => void>();

// DCRUD-007: while the dual-write queue has enqueued-but-unfinished
// writes, the SQLite cache snapshot is causally BEHIND the optimistic
// local state. Bumping the tick in that window makes the overlay
// clobber a just-written mutation (which the diff-writer then escalates
// into a spurious delete). The queue opens a window per enqueued write
// and closes it after apply → refresh; notify is deferred while any
// window is open — the queue's final quiescent notify delivers exactly
// one causally-latest snapshot.
let pendingMutationWindows = 0;

/** Opened by the dual-write queue at enqueue time (one per write). */
export function __openNutritionSqliteMutationWindow(): void {
  pendingMutationWindows += 1;
}

/** Closed by the dual-write queue after apply → refresh completes. */
export function __closeNutritionSqliteMutationWindow(): void {
  pendingMutationWindows = Math.max(0, pendingMutationWindows - 1);
}

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
 * Returns the current tick counter — consumers use the tick value to
 * invalidate memoised reads after the boot warms the cache.
 */
export function useNutritionSqliteReadTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Bumps the tick + notifies subscribers so consuming hooks re-render
 * with the latest `getCachedNutritionSqliteState()`.
 */
export function notifyNutritionSqliteCacheRefresh(): void {
  if (pendingMutationWindows > 0) return;
  cacheTick += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* noop — listeners must never break notify */
    }
  }
  try {
    const target = globalThis as typeof globalThis & {
      __sergeantSqliteRefreshCounts?: Record<string, number>;
    };
    target.__sergeantSqliteRefreshCounts = {
      ...(target.__sergeantSqliteRefreshCounts ?? {}),
      nutrition: (target.__sergeantSqliteRefreshCounts?.["nutrition"] ?? 0) + 1,
    };
    globalThis.dispatchEvent?.(
      new CustomEvent("sergeant:sqlite-cache-refresh", {
        detail: { module: "nutrition" },
      }),
    );
  } catch {
    /* noop — browser-test signal must never break refresh notify */
  }
}

/** Test-only escape hatch: clears subscribers + resets tick. */
export function __resetNutritionSqliteReadGateForTests(): void {
  cacheTick = 0;
  pendingMutationWindows = 0;
  listeners.clear();
}
