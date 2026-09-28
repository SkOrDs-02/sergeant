import { deviceDayKey } from "@sergeant/shared";

import { parseFizrukWorkouts } from "../../../core/lib/insightsEngine";
import { buildCrossModuleSeries } from "../../../core/insights/digestCorrelations";
import { detectMealMoment } from "../../../core/insights/moments/mealMoments";
import { applyMoment } from "../../../core/insights/moments/momentsStore";
import type { NutritionLog } from "./nutritionStorage";

/** Ціль рядка: картка сьогоднішнього дня журналу. */
export const NUTRITION_MOMENT_TARGET = "nutrition:day";

/**
 * Момент запису їжі (ADR-0096). Лише запис на сьогодні: рядок живе до
 * кінця доби пристрою, у минулого дня «сьогодні» немає.
 */
export function recordMealMoment(
  prevLog: NutritionLog,
  nextLog: NutritionLog,
  dateKey: string,
): void {
  const todayKey = deviceDayKey();
  if (dateKey !== todayKey) return;
  const moment = detectMealMoment({
    prevLog,
    nextLog,
    workouts: parseFizrukWorkouts(),
    series: buildCrossModuleSeries(),
    target: NUTRITION_MOMENT_TARGET,
  });
  if (moment) applyMoment(todayKey, "nutrition", moment);
}

/** Видалений запис прибирає рядок: наслідку, який він називав, може вже не бути. */
export function clearMealMoment(dateKey: string): void {
  const todayKey = deviceDayKey();
  if (dateKey !== todayKey) return;
  applyMoment(todayKey, "nutrition", null, [NUTRITION_MOMENT_TARGET]);
}
