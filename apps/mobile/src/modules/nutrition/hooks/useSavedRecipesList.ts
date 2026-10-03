import { useState } from "react";

import { loadSavedRecipes, type SavedRecipe } from "../lib/recipeBookStore";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export function useSavedRecipesList(): { recipes: SavedRecipe[] } {
  const [recipes, setRecipes] = useState<SavedRecipe[]>(() =>
    loadSavedRecipes(),
  );

  // Stage 13 PR #073 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md` — recipes
  // live exclusively in the SQLite warm cache after the MMKV-write
  // tombstone. The cache tick is the only re-render signal.
  // Render-time update avoids `react-hooks/set-state-in-effect` (init 0021).
  const sqliteCacheTick = useNutritionSqliteReadTick();
  const [prevTick, setPrevTick] = useState(sqliteCacheTick);
  if (sqliteCacheTick !== prevTick) {
    setPrevTick(sqliteCacheTick);
    const cache = getCachedNutritionSqliteState();
    if (cache.refreshedAt !== null) {
      setRecipes(loadSavedRecipes());
    }
  }

  return { recipes };
}
