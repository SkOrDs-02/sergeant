/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Збережені рецепти («Мої рецепти») для читання поза `RecipesCard` - зараз
 * для вибору рецептів у списку покупок. Те саме джерело й та сама послідовність,
 * що в `RecipesCard`: IndexedDB-книга (`listSavedRecipesOrThrow`, щоб збій
 * читання не виглядав порожньою книгою) плюс оверлей із
 * SQLite warm-cache, коли той прогрівся (`useSqliteTickOverlay`). Лише читання:
 * збереження й видалення лишаються в `RecipesCard`.
 */
import { useEffect, useState } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import { listSavedRecipesOrThrow, type SavedRecipe } from "../lib/recipeBook";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export interface UseSavedRecipesResult {
  saved: SavedRecipe[];
  /** Триває перше читання книги (лише коли `enabled`). */
  busy: boolean;
  /** Книгу не вдалося прочитати: порожній список тоді не означає «рецептів немає». */
  error: boolean;
}

/**
 * @param enabled читати книгу лише коли екрану вона потрібна (вкладка
 *   «Покупки»), а не при кожному відкритті модуля.
 */
export function useSavedRecipes(enabled: boolean): UseSavedRecipesResult {
  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [saved, setSaved] = useSqliteTickOverlay(
    sqliteCacheTick,
    () => {
      const cache = getCachedNutritionSqliteState();
      if (cache.refreshedAt === null) return undefined;
      return cache.recipes;
    },
    () => [] as SavedRecipe[],
  );
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const list = await listSavedRecipesOrThrow(200);
      if (!cancelled) {
        setSaved(list);
        setError(false);
      }
    })()
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, setSaved]);

  return { saved, busy: enabled && !loaded, error };
}
