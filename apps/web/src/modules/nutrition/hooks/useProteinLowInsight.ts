/**
 * Detection hook for `nutrition-protein-low` insight.
 *
 * Fires when:
 *   - protein consumed < 60% of dailyTargetProtein_g
 *   - current Kyiv-local hour >= 18
 *   - goal > 0
 *
 * Returns `null` when the condition is not met or should not surface.
 *
 * @lifecycle experimental (Phase 5d)
 */

import { useMemo } from "react";
import type { NutritionLog, NutritionPrefs } from "@sergeant/nutrition-domain";
import { getDayMacros } from "../lib/nutritionStorage";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import type { Insight } from "@shared/lib/insights/types";

export function useProteinLowInsight(
  log: NutritionLog,
  prefs: NutritionPrefs,
): Insight | null {
  return useMemo(() => {
    const goal = prefs.dailyTargetProtein_g ?? 0;
    if (goal <= 0) return null;

    const { hour } = getKyivDateParts();
    if (hour < 18) return null;

    const today = getKyivDayKey();
    const macros = getDayMacros(log, today);
    const consumed = Math.round(macros.protein_g ?? 0);

    if (consumed >= goal * 0.6) return null;

    return {
      id: "nutrition-protein-low",
      module: "nutrition",
      title: `Білку: ${consumed} з ${goal}г`,
      subtitle: `Час додати джерело білка?`,
      action: { type: "navigate", path: "/nutrition/log" },
      // Hub surface promoted post-Phase 5e: end-of-day protein gap is an
      // actionable nudge that doesn't require in-Nutrition context — single
      // "log a meal" navigation closes the loop.
      showOn: "both",
    } satisfies Insight;
  }, [log, prefs]);
}
