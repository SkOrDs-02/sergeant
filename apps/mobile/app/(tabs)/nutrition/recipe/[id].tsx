/**
 * Deep-link target for `sergeant://food/recipe/{id}`.
 * Показує збережений на пристрої рецепт із SQLite-таблиці `nutrition_recipes`
 * (Stage 13 PR #073 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md` — MMKV-write tombstoned).
 */
import { useLocalSearchParams } from "expo-router";

import { RecipeDetailPage } from "@/modules/nutrition/pages/RecipeDetail";

export default function NutritionRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeDetailPage id={id} />;
}
