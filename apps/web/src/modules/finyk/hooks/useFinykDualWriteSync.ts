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
 */

import { useEffect, useRef } from "react";

import {
  EMPTY_FINYK_STATE,
  isFinykDualWriteRegistered,
  triggerFinykDualWrite,
  type FinykDualWriteState,
} from "../lib/dualWrite/index.js";
import { extractFinykDualWriteState } from "../lib/dualWrite/extract.js";
import { readRaw } from "../lib/finykStorage";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

function readShowBalance(): boolean {
  return readRaw("finyk_show_balance_v1", "1") !== "0";
}

export function useFinykDualWriteSync(slots: FinykStorageSlots): void {
  const showBalance = readShowBalance();
  const prevRef = useRef<FinykDualWriteState>(EMPTY_FINYK_STATE);
  const initialisedRef = useRef(false);

  useEffect(() => {
    if (!isFinykDualWriteRegistered()) {
      // No context — keep prev snapshot in sync but skip the trigger
      // so that the first write after the user enables the flag still
      // produces a meaningful diff (against the actual current state).
      prevRef.current = extractFinykDualWriteState(slots, showBalance);
      initialisedRef.current = true;
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
      return;
    }
    triggerFinykDualWrite(prevRef.current, next);
    prevRef.current = next;
  }, [slots, showBalance]);
}
