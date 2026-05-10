import { useEffect, useState } from "react";

import { getRecipeById, type SavedRecipe } from "../lib/recipeBookStore";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";

export function useSavedRecipeById(id: string | string[] | undefined): {
  recipe: SavedRecipe | undefined;
  recipeId: string;
} {
  const recipeId = Array.isArray(id) ? (id[0] ?? "") : (id ?? "");
  const [recipe, setRecipe] = useState<SavedRecipe | undefined>(() =>
    recipeId ? getRecipeById(String(recipeId)) : undefined,
  );

  // Stage 13 PR #073 of `docs/planning/storage-roadmap.md` — recipes
  // live exclusively in the SQLite warm cache after the MMKV-write
  // tombstone. The cache tick is the only re-render signal.
  const sqliteCacheTick = useNutritionSqliteReadTick();
  useEffect(() => {
    const key = String(recipeId || "").trim();
    setRecipe(key ? getRecipeById(key) : undefined);
  }, [recipeId, sqliteCacheTick]);

  return { recipe, recipeId: String(recipeId) };
}
