/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  loadNutritionPrefs,
  persistNutritionPrefs,
} from "../lib/nutritionStorage";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionPrefsHydrated } from "./useNutritionPrefsHydration";

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
  const readOverlay = () => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null || !cache.prefs) return undefined;
    return cache.prefs;
  };

  const [prefs, setPrefs] = useSqliteTickOverlay(
    sqliteCacheTick,
    readOverlay,
    () => readOverlay() ?? loadNutritionPrefs(),
  );
  const [prefsStorageErr, setPrefsStorageErr] = useState("");

  // data-04: до гідратації стан — це дефолти, а не prefs користувача, і
  // цілий blob із них стер би шаблони страв, ціль і нагадування на сервері.
  // Тому поки не гідратовано, нічого не пишемо й банер помилки не показуємо.
  const hydrated = useNutritionPrefsHydrated();
  const wasHydratedRef = useRef(hydrated);

  useEffect(() => {
    const justHydrated = hydrated && !wasHydratedRef.current;
    wasHydratedRef.current = hydrated;
    if (!hydrated) return;
    // Щойно завершений pull приніс рядок prefs: оверлей підставить його в
    // стан, а перепис ЗАСТАРІЛОГО стану тут би його затер.
    if (justHydrated && getCachedNutritionSqliteState().prefs != null) return;
    const err = persistNutritionPrefs(prefs)
      ? ""
      : "Не вдалося зберегти налаштування.";
    void Promise.resolve().then(() => setPrefsStorageErr(err));
  }, [prefs, hydrated]);

  return { prefs, setPrefs, prefsStorageErr };
}
