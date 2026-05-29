/**
 * AI-генератор рецептів — окремий екран стеку Харчування.
 * Відкривається з Dashboard CTA «AI-рецепти» та з DailyPlan «Замінити».
 */
import { useRouter } from "expo-router";

import { RecipeRecommender } from "@/modules/nutrition/pages/RecipeRecommender";

export default function NutritionRecipeRecommendScreen() {
  const router = useRouter();
  return (
    <RecipeRecommender
      testID="nutrition-recipe-recommender"
      onClose={() => router.back()}
    />
  );
}
