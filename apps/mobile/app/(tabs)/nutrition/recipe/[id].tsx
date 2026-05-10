/**
 * Deep-link target for `sergeant://food/recipe/{id}`.
 * Показує збережений на пристрої рецепт із SQLite-таблиці `nutrition_recipes`
 * (Stage 13 PR #073 of `docs/planning/storage-roadmap.md` — MMKV-write tombstoned).
 */
import { useLocalSearchParams } from "expo-router";

import { RecipeDetailPage } from "@/modules/nutrition/pages/RecipeDetail";

export default function NutritionRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecipeDetailPage id={id} />;
}
