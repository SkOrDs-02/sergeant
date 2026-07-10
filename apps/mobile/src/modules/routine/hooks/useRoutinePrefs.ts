/**
 * Focused hook for reading and updating the routine prefs slice.
 *
 * Replaces the legacy `useLocalStorage<RoutinePrefs>("@routine_prefs_v1", {})`
 * orphan path used by `RoutineSection` and `NotificationsSection`. The
 * canonical source is now the SQLite warm cache exposed by `useRoutineStore`
 * (`routine_prefs` table, populated by `bootRoutineSqliteReadPath`). Writes
 * go through `saveRoutineState` — the same dual-write pipeline that Stage 8
 * PR #057r-tombstone-mobile retired all direct MMKV writes for.
 *
 * Using `loadRoutineState()` + `saveRoutineState()` directly (rather than
 * `useRoutineStore`) keeps this hook lightweight: it does not subscribe to
 * the full routine state object, only to the prefs slice it cares about.
 * The `useRoutineSqliteReadTick()` subscription triggers a re-read whenever
 * the cache is refreshed (boot warm-up or a write-through from any consumer
 * that calls `saveRoutineState`).
 *
 * Part of the dual-write teardown migration (storage-roadmap).
 */

import { useCallback, useState } from "react";
import type { RoutinePrefs } from "@sergeant/routine-domain";

import { loadRoutineState, saveRoutineState } from "../lib/routineStore";
import { useRoutineSqliteReadTick } from "../lib/sqliteReadGate";

export type { RoutinePrefs };

export interface UseRoutinePrefsReturn {
  prefs: RoutinePrefs;
  updatePrefs: (patch: Partial<RoutinePrefs>) => void;
}

/**
 * Read/write access to `routine.prefs` via the canonical SQLite-backed
 * routine store. Mutations are immediately reflected in the returned
 * `prefs` value and propagated to all other `useRoutineStore` consumers
 * through the SQLite read-gate tick.
 */
export function useRoutinePrefs(): UseRoutinePrefsReturn {
  const [prefs, setPrefsState] = useState<RoutinePrefs>(
    () => loadRoutineState().prefs,
  );

  // Re-read whenever the SQLite cache tick advances (boot warm-up or
  // any `saveRoutineState` write-through from this or other consumers).
  // Render-time update avoids `react-hooks/set-state-in-effect` (init 0021).
  const cacheTick = useRoutineSqliteReadTick();
  const [prevCacheTick, setPrevCacheTick] = useState(cacheTick);
  if (cacheTick !== prevCacheTick) {
    setPrevCacheTick(cacheTick);
    setPrefsState(loadRoutineState().prefs);
  }

  const updatePrefs = useCallback((patch: Partial<RoutinePrefs>) => {
    const current = loadRoutineState();
    const nextPrefs: RoutinePrefs = { ...current.prefs, ...patch };
    const next = { ...current, prefs: nextPrefs };
    setPrefsState(nextPrefs);
    saveRoutineState(next);
  }, []);

  return { prefs, updatePrefs };
}
