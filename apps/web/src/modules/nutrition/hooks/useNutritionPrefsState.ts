/**
 * Last validated: 2026-10-03
 * Status: Active
 */
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  isNutritionPrefsHydrated,
  loadLatestNutritionPrefs,
  patchNutritionPrefs,
  peekLastWrittenNutritionPrefs,
} from "../lib/nutritionStorage";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";

interface UseNutritionPrefsStateResult {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  prefsStorageErr: string;
}

const PERSIST_ERR = "Не вдалося зберегти налаштування.";
const STILL_LOADING_ERR =
  "Дані Їжі ще завантажуються. Спробуй за кілька секунд.";

/** Поля, які `next` змінив відносно `base` (глибоке порівняння через JSON). */
function changedPrefsFields(
  base: NutritionPrefs,
  next: NutritionPrefs,
): Partial<NutritionPrefs> {
  const patch: Partial<NutritionPrefs> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(next)]) as Set<
    keyof NutritionPrefs
  >;
  const copy = <K extends keyof NutritionPrefs>(key: K): void => {
    patch[key] = next[key];
  };
  for (const key of keys) {
    if (JSON.stringify(base[key]) !== JSON.stringify(next[key])) copy(key);
  }
  return patch;
}

/**
 * Стан prefs Їжі: читає кеш SQLite (оверлей на тік) і пише ЛИШЕ на дію
 * користувача через `setPrefs`.
 *
 * data-04: запис — патч змінених полів на АКТУАЛЬНИЙ стан сховища
 * (`patchNutritionPrefs`), а не цілий об'єкт зі стану компонента. Ефекту, що
 * пише стан на маунті чи на перемиканні гідратації, тут немає навмисно: стан
 * міг бути дефолтами (стер би шаблони/ціль/нагадування на сервері) або
 * застарілим відносно запису автокалібрування (відкотив би ціль і вимкнув
 * автокалібрування). До гідратації `setPrefs` нічого не змінює й не пише, а лише показує банер.
 */
export function useNutritionPrefsState(
  sqliteCacheTick: number,
): UseNutritionPrefsStateResult {
  const readOverlay = () => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null || !cache.prefs) return undefined;
    return peekLastWrittenNutritionPrefs() ?? cache.prefs;
  };

  const [prefs, setPrefsState] = useSqliteTickOverlay(
    sqliteCacheTick,
    readOverlay,
    () => readOverlay() ?? loadLatestNutritionPrefs(),
  );
  const [prefsStorageErr, setPrefsStorageErr] = useState("");

  const setPrefs = useCallback<Dispatch<SetStateAction<NutritionPrefs>>>(
    (action) => {
      if (!isNutritionPrefsHydrated()) {
        setPrefsStorageErr(STILL_LOADING_ERR);
        return;
      }
      // База — актуальне сховище, а не стан компонента: функціональні
      // апдейтери (`setPrefs((p) => ...)`) отримують свіжі prefs.
      const base = loadLatestNutritionPrefs();
      const next = typeof action === "function" ? action(base) : action;
      const patch = changedPrefsFields(base, next);
      if (Object.keys(patch).length === 0) return;
      if (!patchNutritionPrefs(patch)) {
        setPrefsStorageErr(PERSIST_ERR);
        return;
      }
      setPrefsStorageErr("");
      setPrefsState(peekLastWrittenNutritionPrefs() ?? next);
    },
    [setPrefsState],
  );

  return { prefs, setPrefs, prefsStorageErr };
}
