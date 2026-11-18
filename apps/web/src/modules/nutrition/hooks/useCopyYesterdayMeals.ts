/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Як учора»: копія вчорашніх записів одного прийому в активний день з
 * тостом «Скасувати». Один шлях для двох входів: форма прийому, відкрита
 * сегментом hero, і аркуш «Додати» з кнопки в куті (OD-27 Х-3 а).
 * Винесено з `NutritionOverlays`, поведінка тієї кнопки не змінилась.
 */
import { useCallback } from "react";
import {
  addDaysISODate,
  type Meal,
  type MealTypeId,
  type NutritionLog,
} from "@sergeant/nutrition-domain";
import type { ToastApi } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { mealsByTypeForDay } from "../lib/nutritionStats";

interface CopyYesterdayLog {
  nutritionLog: NutritionLog;
  getActiveDate: () => string;
  handleCopyMeals: (
    meals: readonly Meal[],
    toDate: string,
    mealType?: MealTypeId,
  ) => string[];
  handleRemoveMeal: (date: string, id: string) => void;
}

/** Учорашні (від активного дня) записи цього прийому. */
export function yesterdayMealsOf(
  log: Pick<CopyYesterdayLog, "nutritionLog" | "getActiveDate">,
  mealType: MealTypeId,
): Meal[] {
  return mealsByTypeForDay(
    log.nutritionLog,
    addDaysISODate(log.getActiveDate(), -1),
  )[mealType];
}

export function useCopyYesterdayMeals({
  log,
  toast,
}: {
  log: CopyYesterdayLog;
  toast: ToastApi;
}): (meals: readonly Meal[], mealType: MealTypeId) => void {
  return useCallback(
    (meals: readonly Meal[], mealType: MealTypeId) => {
      const activeDate = log.getActiveDate();
      const ids = log.handleCopyMeals(meals, activeDate, mealType);
      showUndoToast(toast, {
        msg: "Скопійовано з учора",
        onUndo: () => ids.forEach((id) => log.handleRemoveMeal(activeDate, id)),
      });
    },
    [log, toast],
  );
}
