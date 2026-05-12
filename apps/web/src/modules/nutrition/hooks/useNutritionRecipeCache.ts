import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { NutritionPage, MenuSubTab } from "../lib/nutritionRouter";
import type { NutritionRecipe } from "./useNutritionUiState";
import { readRecipeCache } from "../lib/recipeCache";
import { stableRecipeId } from "../lib/recipeIds";

interface UseNutritionRecipeCacheArgs {
  activePage: NutritionPage;
  menuSubTab: MenuSubTab;
  recipeCacheKey: string;
  setRecipes: Dispatch<SetStateAction<NutritionRecipe[]>>;
  setRecipesRaw: Dispatch<SetStateAction<string>>;
  setRecipesTried: Dispatch<SetStateAction<boolean>>;
}

/**
 * Recipes moved to a sub-tab inside the "menu" page. Only read the
 * recipe cache when the menu page is actually showing the recipes
 * tab — avoids touching `localStorage` for users who never open it.
 * Cache shape is normalised: `id` is filled via `stableRecipeId` when
 * the raw payload didn't carry one.
 */
export function useNutritionRecipeCache({
  activePage,
  menuSubTab,
  recipeCacheKey,
  setRecipes,
  setRecipesRaw,
  setRecipesTried,
}: UseNutritionRecipeCacheArgs): void {
  useEffect(() => {
    if (activePage !== "menu" || menuSubTab !== "recipes") return;
    const c = readRecipeCache<Record<string, unknown>>(recipeCacheKey);
    if (c?.recipes?.length) {
      setRecipes(
        c.recipes.map((r) => {
          const rawId = (r as { id?: unknown })?.id;
          return {
            ...r,
            id: rawId ? String(rawId) : stableRecipeId(r),
          };
        }),
      );
      setRecipesRaw(c.recipesRaw || "");
      setRecipesTried(true);
    }
  }, [
    activePage,
    menuSubTab,
    recipeCacheKey,
    setRecipes,
    setRecipesRaw,
    setRecipesTried,
  ]);
}
