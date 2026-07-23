/**
 * Hub routine quick-stats snapshot — the figures the Hub bento card shows
 * for the routine module (`todayDone` / `todayTotal` / `streak`).
 *
 * Thin projection over the same aggregators the module's own header and
 * progress ring use: `completionRateForRange` for today's done/scheduled
 * counts and `maxActiveStreak` for the longest active-habit streak. The
 * Kyiv day boundary lives in the caller — `todayKey` is passed in as a
 * `YYYY-MM-DD` key (this package is timezone-agnostic and carries no
 * `@sergeant/shared` dependency), matching the existing streak/rate API.
 */

import { completionRateForRange, maxActiveStreak } from "./streaks.js";
import type { Habit } from "./types.js";

export interface RoutineQuickStats {
  /** Habits completed today. */
  todayDone: number;
  /** Habits scheduled for today. */
  todayTotal: number;
  /** Longest current streak across active habits, in days. */
  streak: number;
}

export function computeRoutineQuickStats(
  habits: Habit[],
  completions: Record<string, string[]>,
  todayKey: string,
): RoutineQuickStats {
  const { completed, scheduled } = completionRateForRange(
    habits,
    completions,
    todayKey,
    todayKey,
  );
  return {
    todayDone: completed,
    todayTotal: scheduled,
    streak: maxActiveStreak(habits, completions, todayKey),
  };
}
