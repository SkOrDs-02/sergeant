import { useEffect, useState } from "react";

import { loadSavedRecipes, type SavedRecipe } from "../lib/recipeBookStore";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export function useSavedRecipesList(): { recipes: SavedRecipe[] } {
  const [recipes, setRecipes] = useState<SavedRecipe[]>(() =>
    loadSavedRecipes(),
  );

  // Stage 13 PR #073 of `docs/planning/storage-roadmap.md` — recipes
  // live exclusively in the SQLite warm cache after the MMKV-write
  // tombstone. The cache tick is the only re-render signal.
  const sqliteCacheTick = useNutritionSqliteReadTick();
  useEffect(() => {
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt === null) return;
    setRecipes(loadSavedRecipes());
  }, [sqliteCacheTick]);

  return { recipes };
}
