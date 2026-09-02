/**
 * Hub fizruk quick-stats snapshot — the two figures the Hub bento card
 * shows for the fizruk module (`weekWorkouts` / `streak`).
 *
 * Thin projection over the Dashboard KPI aggregators so the Hub card
 * renders the exact same numbers as the module's own Dashboard hero kicker —
 * the Mon-first Kyiv-anchored weekly count (`computeWeeklyTotals`) and the
 * тижневий стрік (`computeWeeklyStreakWeeks`). No new maths: a
 * second source of truth would let the card drift from the module.
 */

import { computeWeeklyTotals } from "./dashboardKpis.js";
import { computeWeeklyStreakWeeks } from "./weeklyStreak.js";
import type { DashboardWorkoutInput } from "./types.js";

export interface FizrukQuickStats {
  /** Completed workouts in the current Mon-first Kyiv week. */
  weekWorkouts: number;
  /**
   * Тижнів поспіль із ≥X тренувань (канон §7). Раніше тут був щоденний
   * стрік, який рвався об правильний день відпочинку — Hub-картка
   * показувала «0» людині, що тренувалась двічі цього тижня.
   */
  streak: number;
}

export function computeFizrukQuickStats(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  now: Date = new Date(),
): FizrukQuickStats {
  return {
    weekWorkouts: computeWeeklyTotals(workouts, now).count,
    streak: computeWeeklyStreakWeeks(workouts, { now }),
  };
}
