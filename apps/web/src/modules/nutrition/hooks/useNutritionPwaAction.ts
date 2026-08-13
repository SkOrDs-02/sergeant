/**
 * Last validated: 2026-08-13
 * Status: Active
 */
import { useEffect } from "react";
import type { NutritionPage } from "../lib/nutritionRouter";

interface UseNutritionPwaActionArgs {
  pwaAction?: string | null | undefined;
  setActivePageAndHash: (page: NutritionPage) => void;
  /** Відкрити AddMealSheet на звичайному кроці вибору джерела. */
  onOpenAddMeal: () => void;
  /** Відкрити AddMealSheet одразу на кроці аналізу фото. */
  onOpenMealPhoto: () => void;
  onPwaActionConsumed?: (() => void) | undefined;
}

/**
 * Reacts to the `pwaAction` prop from the PWA shell:
 * - `add_meal` → route to «Щоденник» and open the AddMealSheet.
 * - `add_meal_photo` → route to «Щоденник» and open the AddMealSheet at
 *   its photo step (the step itself pops the native file picker).
 *
 * Обидві гілки йдуть через хостові колбеки NutritionApp (не через прямий
 * `setAddMealSheetOpen`): хост скидає/виставляє initialStep sheet-а, тож
 * `add_meal` після `add_meal_photo` не успадкує крок фото.
 *
 * AI-CONTEXT: раніше `add_meal_photo` вів на «Огляд», force-відкривав
 * `<details>` з PhotoAnalyzeCard і синтетично клікав file input (rAF +
 * 80 ms fallback). Фото тепер крок AddMealSheet, тож обидва шорткати —
 * просто «відкрий sheet», а піккер відкриває сам крок.
 */
export function useNutritionPwaAction({
  pwaAction,
  setActivePageAndHash,
  onOpenAddMeal,
  onOpenMealPhoto,
  onPwaActionConsumed,
}: UseNutritionPwaActionArgs): void {
  useEffect(() => {
    if (pwaAction === "add_meal") {
      setActivePageAndHash("log");
      onOpenAddMeal();
      onPwaActionConsumed?.();
      return;
    }
    if (pwaAction === "add_meal_photo") {
      // «Щоденник» як фон: збережена страва ляже саме туди, тож після
      // закриття sheet-а користувач бачить результат, а не дашборд.
      setActivePageAndHash("log");
      onOpenMealPhoto();
      onPwaActionConsumed?.();
    }
  }, [
    onOpenAddMeal,
    onOpenMealPhoto,
    onPwaActionConsumed,
    pwaAction,
    setActivePageAndHash,
  ]);
}
