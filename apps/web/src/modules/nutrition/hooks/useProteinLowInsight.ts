/**
 * Last validated: 2026-06-15
 * Status: Active
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
import {
  todayISODate,
  type NutritionLog,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import {
  ESTIMATED_KCAL_SHARE_THRESHOLD,
  getDaySummary,
} from "../lib/nutritionStorage";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import type { Insight } from "@shared/lib/insights/types";
import { messages } from "@shared/i18n/uk";

export function useProteinLowInsight(
  log: NutritionLog,
  prefs: NutritionPrefs,
): Insight | null {
  return useMemo(() => {
    const goal = prefs.dailyTargetProtein_g ?? 0;
    if (goal <= 0) return null;

    // Час доби (>= 18:00) лишається Kyiv-анкорним навмисно — це НЕ день-ключ,
    // а wall-clock gate, поза межами виміру ADR-0078 для цієї зміни.
    const { hour } = getKyivDateParts();
    if (hour < 18) return null;

    // ADR-0078: читаємо той самий день, під яким журнал зберігає прийоми
    // їжі — день пристрою, а не Kyiv.
    const today = todayISODate();
    const summary = getDaySummary(log, today);
    const consumed = Math.round(summary.protein_g ?? 0);

    if (consumed >= goal * 0.6) return null;

    // Nutrition audit E-5 / founder decision 2026-08-04: a mostly-guessed
    // day (>50% of kcal from photoAI) must not read as a categorical
    // verdict — soften the wording instead of silencing the nudge.
    const isMostlyEstimated =
      summary.estimatedKcalShare > ESTIMATED_KCAL_SHARE_THRESHOLD;

    return {
      id: "nutrition-protein-low",
      module: "nutrition",
      title: `Білку: ${consumed} з ${goal}г`,
      subtitle: isMostlyEstimated
        ? messages.nutrition.proteinLowEstimated.subtitle
        : `Час додати джерело білка?`,
      askAiPrompt: `Сьогодні білка ${consumed} г із цілі ${goal} г, уже вечір. Що реально додати з простого, щоб добрати хоча б до ${Math.round(goal * 0.8)} г?`,
      action: { type: "navigate", path: "/nutrition/log" },
      // Hub surface promoted post-Phase 5e: end-of-day protein gap is an
      // actionable nudge that doesn't require in-Nutrition context — single
      // "log a meal" navigation closes the loop.
      showOn: "both",
    } satisfies Insight;
  }, [log, prefs]);
}
