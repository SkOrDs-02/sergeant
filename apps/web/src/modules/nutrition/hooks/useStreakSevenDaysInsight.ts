/**
 * Detection hook for `nutrition-streak-7-days` insight.
 *
 * Fires when the last 7 consecutive Kyiv-local calendar days all had
 * kcal consumption within [0.95*goal, 1.05*goal] — the same band used
 * by the W4 daily-close toast in NutritionDashboard.
 *
 * Deduplication: the insight id is keyed per ISO week (`nutrition-streak-7-days-YYYY-WW`)
 * so `useInsightDismissal` natural behaviour (dismiss once → gone) silences
 * it for the rest of that week. A new calendar week resets the key,
 * allowing the insight to fire again if the user maintains their streak.
 *
 * @lifecycle experimental (Phase 5d)
 */

import { useMemo } from "react";
import type { NutritionLog, NutritionPrefs } from "@sergeant/nutrition-domain";
import { getDayMacros, addDaysISODate } from "../lib/nutritionStorage";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import type { Insight } from "@shared/lib/insights/types";

/** Returns an ISO week identifier like `2026-W20` from Kyiv-local parts. */
function kyivISOWeekKey(): string {
  // Use a Thursday-of-the-week trick to get the ISO week year correct,
  // but a simple YYYY-WW approximation is sufficient for dedup purposes
  // since we only need the key to be stable within a calendar week.
  const { year, month, day } = getKyivDateParts();
  // Compute week-of-year using the Jan 1 ordinal approach (approximate,
  // good enough for dedup — does not need to be ISO-8601 perfect).
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear =
    Math.floor(
      (Date.UTC(year, month - 1, day) - jan1.getTime()) / 86_400_000,
    ) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

const STREAK_DAYS = 7;

export function useStreakSevenDaysInsight(
  log: NutritionLog,
  prefs: NutritionPrefs,
): Insight | null {
  return useMemo(() => {
    const goal = prefs.dailyTargetKcal ?? 0;
    if (goal <= 0) return null;

    const today = getKyivDayKey();

    // Full window scan — iterate all 7 days, bail early on first miss.
    for (let i = 0; i < STREAK_DAYS; i++) {
      const dateKey = addDaysISODate(today, -i);
      const macros = getDayMacros(log, dateKey);
      const kcal = macros.kcal ?? 0;
      const ratio = kcal / goal;
      if (ratio < 0.95 || ratio > 1.05) return null;
    }

    const weekKey = kyivISOWeekKey();

    return {
      id: `nutrition-streak-7-days-${weekKey}`,
      module: "nutrition",
      title: `7 днів у нормі калорій`,
      subtitle: `Хочеш план на наступний тиждень?`,
      action: { type: "navigate", path: "/nutrition/menu" },
      showOn: "module",
    } satisfies Insight;
  }, [log, prefs]);
}
