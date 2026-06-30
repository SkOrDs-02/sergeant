/**
 * Read-path subscription for the Fizruk SQLite cutover.
 *
 * Stage 8 PR #057f-flag: the `feature.fizruk.sqlite_v2.read_sqlite`
 * flag has graduated — overlay читання тепер unconditional once the
 * boot wiring (`sqliteReadBoot.ts`) reports activation. This file
 * keeps only the pub-sub pieces:
 *
 *  - `useFizrukSqliteReadTick()` — re-renders subscribers whenever
 *    {@link notifyFizrukSqliteCacheRefresh} fires, so consumer hooks
 *    pick up the freshly warmed cache.
 *  - `notifyFizrukSqliteCacheRefresh()` — bumps the tick + fans out
 *    to listeners; called from `useFizrukSqliteReadBoot` after a
 *    successful migration + cache refresh.
 *
 * The flag-gated `useFizrukSqliteReadFlag()` / `useFizrukSqliteReadGate()`
 * exports were dropped together with the registry entry as part of
 * Stage 8 PR #057f-flag — see `apps/web/src/core/lib/featureFlags.ts`.
 */

import { useSyncExternalStore } from "react";
import { emitHubBus } from "@shared/lib/modules/hubBus";

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
 */
export function useFizrukSqliteReadTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Bumps the tick + notifies subscribers so consuming hooks re-render
 * with the latest `getCachedFizrukSqliteState()`. Also notifies same-tab
 * Hub consumers (F3/F10 fix) so Hub Reports re-aggregates immediately.
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
  try {
    const target = globalThis as typeof globalThis & {
      __sergeantSqliteRefreshCounts?: Record<string, number>;
    };
    target.__sergeantSqliteRefreshCounts = {
      ...(target.__sergeantSqliteRefreshCounts ?? {}),
      fizruk: (target.__sergeantSqliteRefreshCounts?.["fizruk"] ?? 0) + 1,
    };
    globalThis.dispatchEvent?.(
      new CustomEvent("sergeant:sqlite-cache-refresh", {
        detail: { module: "fizruk" },
      }),
    );
  } catch {
    /* noop — browser-test signal must never break refresh notify */
  }
  // Notify same-tab Hub consumers so Hub Reports / Dashboard re-aggregate
  // without waiting for a cross-tab storage event.
  emitHubBus("storageUpdated", undefined);
}

/** Test-only escape hatch: clears subscribers + resets tick. */
export function __resetFizrukSqliteReadGateForTests(): void {
  cacheTick = 0;
  listeners.clear();
}
