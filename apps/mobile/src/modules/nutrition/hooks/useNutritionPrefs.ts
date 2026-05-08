/**
 * `useNutritionPrefs` — MMKV-backed read/write hook для nutrition prefs
 * (денні цілі КБЖВ, водна ціль, reminder-опції).
 *
 * PR-4 використовує це лише для читання (денні targets у Dashboard).
 * Запис prefs-форми через реальний settings-екран прилітає з PR-7/8.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { type NutritionPrefs } from "@sergeant/nutrition-domain";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

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

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey === STORAGE_KEYS.NUTRITION_PREFS) {
        setPrefsState(loadNutritionPrefs());
      }
    });
    return () => sub.remove();
  }, []);

  // Stage 4 PR #033 + Stage 8 PR #057n: overlay nutrition prefs from
  // the local SQLite cache once it's warm. The MMKV first-paint read
  // above stays as a synchronous fallback so the first paint never
  // blocks on SQLite.
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
