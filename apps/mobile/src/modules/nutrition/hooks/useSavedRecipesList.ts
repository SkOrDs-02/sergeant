import { useEffect, useState } from "react";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import { loadSavedRecipes, type SavedRecipe } from "../lib/recipeBookStore";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export function useSavedRecipesList(): { recipes: SavedRecipe[] } {
  const [recipes, setRecipes] = useState<SavedRecipe[]>(() =>
    loadSavedRecipes(),
  );

  useEffect(() => {
    setRecipes(loadSavedRecipes());
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((key) => {
      if (key === STORAGE_KEYS.NUTRITION_SAVED_RECIPES) {
        setRecipes(loadSavedRecipes());
      }
    });
    return () => sub.remove();
  }, []);

  // Stage 4 PR #033 + Stage 8 PR #057n: overlay saved recipes from
  // the local SQLite cache once it's warm. MMKV first-paint read
  // above stays as a synchronous fallback.
  const sqliteCacheTick = useNutritionSqliteReadTick();
  useEffect(() => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    setRecipes(cache.recipes);
  }, [sqliteCacheTick]);

  return { recipes };
}
