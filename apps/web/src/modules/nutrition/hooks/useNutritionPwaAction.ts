/**
 * Last validated: 2026-08-13
 * Status: Active
 */
import { useEffect } from "react";
import type { NutritionPage } from "../lib/nutritionRouter";
import type { useNutritionLog } from "./useNutritionLog";

type LogController = ReturnType<typeof useNutritionLog>;

interface UseNutritionPwaActionArgs {
  pwaAction?: string | null | undefined;
  log: LogController;
  setActivePageAndHash: (page: NutritionPage) => void;
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
 * AI-CONTEXT: раніше `add_meal_photo` вів на «Огляд», force-відкривав
 * `<details>` з PhotoAnalyzeCard і синтетично клікав file input (rAF +
 * 80 ms fallback). Фото тепер крок AddMealSheet, тож обидва шорткати —
 * просто «відкрий sheet», а піккер відкриває сам крок.
 */
export function useNutritionPwaAction({
  pwaAction,
  log,
  setActivePageAndHash,
  onOpenMealPhoto,
  onPwaActionConsumed,
}: UseNutritionPwaActionArgs): void {
  useEffect(() => {
    if (pwaAction === "add_meal") {
      setActivePageAndHash("log");
      log.setAddMealSheetOpen(true);
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
    log,
    onOpenMealPhoto,
    onPwaActionConsumed,
    pwaAction,
    setActivePageAndHash,
  ]);
}
