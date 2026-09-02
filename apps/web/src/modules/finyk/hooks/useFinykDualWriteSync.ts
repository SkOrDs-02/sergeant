/**
 * Watches the bundle returned by `useFinykStorageSlots` and fires
 * `triggerFinykDualWrite(prev, next)` after every React-state change
 * (which is exactly when `usePersist` schedules a debounced LS write).
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`.
 *
 * Why a single watcher hook instead of inline triggers:
 *  - Finyk's storage layer is generic (`usePersist<T>`), reused for 14
 *    LS keys via `useFinykStorageSlots`. Inlining the trigger into
 *    `usePersist` would require threading the dual-write state
 *    extractor through the generic, coupling shared infra to the
 *    finyk diff shape.
 *  - The `useFinykStorageSlots` bundle is the natural seam — every
 *    LS key the dual-write layer cares about is already exposed there
 *    as React state, so we can compute the prev/next snapshots from
 *    the slot bundle alone.
 *
 * The hook is a no-op until {@link useFinykDualWriteBoot} has
 * registered a context (the gate `isFinykDualWriteRegistered()` in
 * `triggerFinykDualWrite` short-circuits otherwise).
 *
 * **SYNC-3 (2026-09-01 product audit) — the pull-echo loop.** The same
 * `finyk` SQLite read-tick (`useFinykSqliteReadTick`) bumps for two
 * unrelated reasons: (a) a *remote* pull landed new/changed rows
 * (`refreshCachesAfterPull` → `notifyFinykSqliteCacheRefresh`), and
 * (b) a *local* write just settled and the overlay is echoing the row
 * this hook itself pushed a moment ago. `useFinykStorageSlots` cannot
 * tell those apart — both look like "the cached slot arrays changed" —
 * so it always overlays every slot from `getCachedFinykSqliteState()`.
 * Before this fix, THIS hook couldn't tell them apart either: any slot
 * change (including rows another device just pushed and this client
 * merely pulled) was diffed against `prevRef` and, when different,
 * pushed straight back out via `triggerFinykDualWrite` — i.e. every
 * pulled row got immediately re-enqueued as if it were a fresh local
 * mutation. Multiply that by N devices pulling each other's echoes and
 * the outbox never drains (measured: 3 357 ops / 60 manual expenses
 * across 3 devices, `docs/90-work/audits/2026-09-01-product-audit/findings.md`
 * § SYNC-3).
 *
 * Fix: track the read-tick alongside the state snapshot. A render whose
 * tick differs from the last-observed tick is, by construction, a
 * cache-overlay render (pull OR local-write echo) — resync `prevRef`
 * to the new snapshot WITHOUT triggering a push. A render whose tick is
 * unchanged is a genuine local mutation (`useFinykStorageMutations`
 * setters never touch the read-tick) and keeps triggering as before.
 */

import { useEffect, useRef } from "react";

import {
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  isFinykDualWriteRegistered,
  triggerFinykDualWrite,
  type FinykDualWriteState,
} from "../lib/sqliteWriter/index.js";
import { extractFinykDualWriteState } from "../lib/sqliteWriter/extract.js";
import { useFinykSqliteReadTick } from "../lib/sqliteReadGate.js";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

export function useFinykDualWriteSync(slots: FinykStorageSlots): void {
  // Stage 13 PR #074 — `showBalance` живе в slot bundle (з SQLite
  // overlay), більше не читаємо LS напрямую тут. Lint-gate
  // (`no-restricted-syntax`) блокує LS-write на `finyk_show_balance_v1`,
  // отже єдиний шлях persist — друга-режим через dual-write
  // вниз.
  const showBalance = slots.showBalance;
  const prevRef = useRef<FinykDualWriteState>(EMPTY_FINYK_STATE);
  const initialisedRef = useRef(false);
  const sqliteCacheTick = useFinykSqliteReadTick();
  const prevTickRef = useRef(sqliteCacheTick);

  useEffect(() => {
    if (!isFinykDualWriteRegistered()) {
      // No context — keep prev snapshot in sync but skip the trigger
      // so that the first write after the user enables the flag still
      // produces a meaningful diff (against the actual current state).
      prevRef.current = extractFinykDualWriteState(slots, showBalance);
      initialisedRef.current = true;
      prevTickRef.current = sqliteCacheTick;
      return;
    }
    const next = extractFinykDualWriteState(slots, showBalance);
    if (!initialisedRef.current) {
      // First render after the context is registered: snapshot the
      // initial state and rely on the SQLite layer being empty (or
      // already populated by a previous boot). Skipping the trigger
      // here avoids spamming a full re-upsert on every page load.
      prevRef.current = next;
      initialisedRef.current = true;
      prevTickRef.current = sqliteCacheTick;
      return;
    }
    // SYNC-3 guard (see docstring above): a tick change means THIS
    // render's slots reflect a fresh `getCachedFinykSqliteState()`
    // overlay (pull-applied remote rows, or the echo of our own just-
    // settled write) — resync the baseline but do not re-push it.
    if (sqliteCacheTick !== prevTickRef.current) {
      prevTickRef.current = sqliteCacheTick;
      prevRef.current = next;
      return;
    }
    // `useFinykStorageSlots` returns a fresh object literal on every
    // render, so this effect fires on every render — including the ones
    // it causes itself: `triggerFinykDualWrite` always ends with
    // `notifyFinykSqliteCacheRefresh()`, the overlay in
    // `useFinykStorageSlots` reacts to that tick, and the resulting
    // render re-enters here. Without this guard that is a self-feeding
    // write/notify storm (measured 2026-08-06: ~280 refreshes/s on
    // `/finyk`). Diffing first makes the trigger fire only for real
    // mutations — the same diff the pipeline computes anyway.
    if (diffFinykDualWriteOps(prevRef.current, next).length === 0) {
      prevRef.current = next;
      return;
    }
    triggerFinykDualWrite(prevRef.current, next);
    prevRef.current = next;
  }, [slots, showBalance, sqliteCacheTick]);
}
