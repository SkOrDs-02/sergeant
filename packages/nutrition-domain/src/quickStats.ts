/**
 * Hub nutrition quick-stats snapshot — the figures the Hub bento card
 * shows for the nutrition module (`todayCal` / `calGoal`).
 *
 * Reuses `getDayMacros` (the same day-total the NutritionDashboard shows)
 * so the card can never drift from the module, and reads the daily kcal
 * target straight from prefs. The Kyiv day boundary lives in the caller —
 * `dayKey` is passed in as a `YYYY-MM-DD` key, matching `getDayMacros`.
 */

import { getDayMacros } from "./nutritionLog.js";
import type { NutritionLogLike, NutritionPrefs } from "./nutritionTypes.js";

export interface NutritionQuickStats {
  /** Total kcal logged for `dayKey`, rounded. */
  todayCal: number;
  /** Daily kcal target, or `0` when the user has not set one. */
  calGoal: number;
}

export function computeNutritionQuickStats(
  log: NutritionLogLike,
  prefs: Pick<NutritionPrefs, "dailyTargetKcal"> | null | undefined,
  dayKey: string,
): NutritionQuickStats {
  return {
    todayCal: Math.round(getDayMacros(log, dayKey).kcal),
    calGoal: prefs?.dailyTargetKcal ?? 0,
  };
}
