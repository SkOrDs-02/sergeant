/**
 * Hub fizruk quick-stats snapshot — the two figures the Hub bento card
 * shows for the fizruk module (`weekWorkouts` / `streak`).
 *
 * Thin projection over the Dashboard KPI aggregators so the Hub card
 * renders the exact same numbers as the module's own StatusStrip — the
 * Mon-first Kyiv-anchored weekly count (`computeWeeklyTotals`) and the
 * consecutive-day workout streak (`computeStreakDays`). No new maths: a
 * second source of truth would let the card drift from the module.
 */

import { computeStreakDays, computeWeeklyTotals } from "./dashboardKpis.js";
import type { DashboardWorkoutInput } from "./types.js";

export interface FizrukQuickStats {
  /** Completed workouts in the current Mon-first Kyiv week. */
  weekWorkouts: number;
  /** Consecutive-day workout streak ending today (1-day grace). */
  streak: number;
}

export function computeFizrukQuickStats(
  workouts: readonly DashboardWorkoutInput[] | null | undefined,
  now: Date = new Date(),
): FizrukQuickStats {
  return {
    weekWorkouts: computeWeeklyTotals(workouts, now).count,
    streak: computeStreakDays(workouts, now),
  };
}
