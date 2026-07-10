/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  loadNutritionPrefs,
  persistNutritionPrefs,
} from "../lib/nutritionStorage";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";

interface UseNutritionPrefsStateResult {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  prefsStorageErr: string;
}

/**
 * Hydrates nutrition prefs from `localStorage` synchronously, then
 * overlays the SQLite cache once it's warm (Stage 4 PR #033 + Stage 8
 * PR #057n). Persists every update back to `localStorage` and surfaces
 * a banner string when persist fails.
 */
export function useNutritionPrefsState(
  sqliteCacheTick: number,
): UseNutritionPrefsStateResult {
  const [prefs, setPrefs] = useSqliteTickOverlay(
    sqliteCacheTick,
    () => {
      const cache = getCachedNutritionSqliteState();
      if (cache.refreshedAt === null || !cache.prefs) return undefined;
      return cache.prefs;
    },
    () => loadNutritionPrefs(),
  );
  const [prefsStorageErr, setPrefsStorageErr] = useState("");

  useEffect(() => {
    const err = persistNutritionPrefs(prefs)
      ? ""
      : "Не вдалося зберегти налаштування.";
    void Promise.resolve().then(() => setPrefsStorageErr(err));
  }, [prefs]);

  return { prefs, setPrefs, prefsStorageErr };
}
