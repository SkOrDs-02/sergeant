/**
 * `useNutritionPrefs` — SQLite-cache-backed read/write hook for
 * nutrition prefs (денні цілі КБЖВ, водна ціль, reminder-опції).
 *
 * Stage 8 PR #057n-tombstone: initial state reads from the SQLite
 * warm cache. The MMKV value-changed listener was removed because
 * `nutrition_prefs_v1` is tombstoned — cross-consumer notifications
 * now flow through `useNutritionSqliteReadTick`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { type NutritionPrefs } from "@sergeant/nutrition-domain";

import { loadNutritionPrefs, saveNutritionPrefs } from "../lib/nutritionStore";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export interface UseNutritionPrefsResult {
  prefs: NutritionPrefs;
  setPrefs: (next: NutritionPrefs) => void;
  updatePrefs: (patch: Partial<NutritionPrefs>) => void;
}

export function useNutritionPrefs(): UseNutritionPrefsResult {
  const [prefs, setPrefsState] = useState<NutritionPrefs>(() =>
    loadNutritionPrefs(),
  );

  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  // Stage 4 PR #033 + Stage 8 PR #057n-tombstone: overlay nutrition
  // prefs from the local SQLite cache once it's warm. The MMKV
  // value-changed listener was dropped — `nutrition_prefs_v1` no
  // longer exists, the cache-tick is the single source of "value
  // changed" notifications.
  const sqliteCacheTick = useNutritionSqliteReadTick();
  useEffect(() => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    if (cache.prefs) setPrefsState(cache.prefs);
  }, [sqliteCacheTick]);

  const commit = useCallback((next: NutritionPrefs) => {
    setPrefsState(next);
    saveNutritionPrefs(next);
  }, []);

  const setPrefs = useCallback(
    (next: NutritionPrefs) => {
      commit(next);
    },
    [commit],
  );

  const updatePrefs = useCallback(
    (patch: Partial<NutritionPrefs>) => {
      commit({ ...prefsRef.current, ...patch });
    },
    [commit],
  );

  return { prefs, setPrefs, updatePrefs };
}
