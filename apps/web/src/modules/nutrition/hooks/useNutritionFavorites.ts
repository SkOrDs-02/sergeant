/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Улюблені продукти й рецепти (OD-27 Х-3 б). Живуть у prefs модуля
 * (`favoriteFoodIds`, `favoriteRecipeIds`), тож їдуть між пристроями тим самим
 * синком prefs, що й шаблони страв; нового сховища немає.
 */
import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  sortFavoritesFirst,
  toggleFavoriteId,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";

export interface NutritionFavorites {
  foodIds: ReadonlySet<string>;
  recipeIds: ReadonlySet<string>;
  toggleFood: (id: string) => void;
  toggleRecipe: (id: string) => void;
}

export function useNutritionFavorites(
  prefs: NutritionPrefs,
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>> | undefined,
): NutritionFavorites {
  const foodList = prefs.favoriteFoodIds;
  const recipeList = prefs.favoriteRecipeIds;
  const foodIds = useMemo(() => new Set(foodList ?? []), [foodList]);
  const recipeIds = useMemo(() => new Set(recipeList ?? []), [recipeList]);
  const toggleFood = useCallback(
    (id: string) =>
      setPrefs?.((p) => ({
        ...p,
        favoriteFoodIds: toggleFavoriteId(p.favoriteFoodIds, id),
      })),
    [setPrefs],
  );
  const toggleRecipe = useCallback(
    (id: string) =>
      setPrefs?.((p) => ({
        ...p,
        favoriteRecipeIds: toggleFavoriteId(p.favoriteRecipeIds, id),
      })),
    [setPrefs],
  );
  return useMemo(
    () => ({ foodIds, recipeIds, toggleFood, toggleRecipe }),
    [foodIds, recipeIds, toggleFood, toggleRecipe],
  );
}

/** Улюблені вгору списку за `id`; без улюблених — той самий масив. */
export function useFavoritesFirst<T extends { id?: unknown }>(
  items: T[],
  ids: ReadonlySet<string> | undefined,
): T[] {
  return useMemo(
    () => sortFavoritesFirst(items, ids, (x) => x.id) as T[],
    [items, ids],
  );
}
