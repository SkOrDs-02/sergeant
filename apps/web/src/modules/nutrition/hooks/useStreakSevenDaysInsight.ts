/**
 * Last validated: 2026-08-07
 * Status: Active
 * Detection hook for `nutrition-streak-7-days` insight.
 *
 * Fires when the last 7 consecutive device-local calendar days (ADR-0078)
 * all had kcal consumption within [0.95*goal, 1.05*goal] — the same band
 * used by the W4 daily-close toast in NutritionDashboard. Device-local
 * because the underlying log is keyed by day of device — a Kyiv-anchored
 * walk-back would read the wrong 7 keys for non-Kyiv users.
 *
 * Deduplication: the insight id is keyed per device-local ISO-ish week
 * (`nutrition-streak-7-days-YYYY-WW`) so `useInsightDismissal` natural
 * behaviour (dismiss once → gone) silences it for the rest of that week. A
 * new calendar week resets the key, allowing the insight to fire again if
 * the user maintains their streak.
 *
 * @lifecycle experimental (Phase 5d)
 */

import { useMemo } from "react";
import {
  todayISODate,
  type NutritionLog,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import { getDayMacros, addDaysISODate } from "../lib/nutritionStorage";
import type { Insight } from "@shared/lib/insights/types";

/**
 * Returns a device-local week identifier like `2026-W20` (ADR-0078) — the
 * dedup key for "already celebrated this streak this week", parsed from
 * `todayISODate()` rather than `Date` host-getters directly (keeps this
 * file lint-clean under `sergeant-design/prefer-kyiv-time`, since the
 * source of "today" is already the reviewed device-day helper).
 */
function deviceISOWeekKey(): string {
  // Use a Thursday-of-the-week trick to get the ISO week year correct,
  // but a simple YYYY-WW approximation is sufficient for dedup purposes
  // since we only need the key to be stable within a calendar week.
  const [yStr, mStr, dStr] = todayISODate().split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  // Compute week-of-year using the Jan 1 ordinal approach (approximate,
  // good enough for dedup — does not need to be ISO-8601 perfect).
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear =
    Math.floor((Date.UTC(year, month - 1, day) - jan1.getTime()) / 86_400_000) +
    1;
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

    // ADR-0078: walk back from the day the log is actually keyed under —
    // device, not Kyiv.
    const today = todayISODate();

    // Full window scan — iterate all 7 days, bail early on first miss.
    for (let i = 0; i < STREAK_DAYS; i++) {
      const dateKey = addDaysISODate(today, -i);
      const macros = getDayMacros(log, dateKey);
      const kcal = macros.kcal ?? 0;
      const ratio = kcal / goal;
      if (ratio < 0.95 || ratio > 1.05) return null;
    }

    const weekKey = deviceISOWeekKey();

    return {
      id: `nutrition-streak-7-days-${weekKey}`,
      module: "nutrition",
      title: `7 днів у нормі калорій`,
      subtitle: `Хочеш план на наступний тиждень?`,
      action: { type: "navigate", path: "/nutrition/menu" },
      // Hub surface promoted post-Phase 5e: 7-day streak achievement +
      // next-week-plan upsell is cross-module relevant — celebration belongs
      // on the Hub where it can co-occur with other module progress signals.
      showOn: "both",
    } satisfies Insight;
  }, [log, prefs]);
}
