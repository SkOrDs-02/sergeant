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
  const [prefs, setPrefs] = useState(() => loadNutritionPrefs());
  const [prefsStorageErr, setPrefsStorageErr] = useState("");

  useEffect(() => {
    setPrefsStorageErr(
      persistNutritionPrefs(prefs) ? "" : "Не вдалося зберегти налаштування.",
    );
  }, [prefs]);

  useEffect(() => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    if (cache.prefs) setPrefs(cache.prefs);
  }, [sqliteCacheTick]);

  return { prefs, setPrefs, prefsStorageErr };
}
