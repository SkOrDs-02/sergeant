/**
 * Hub routine quick-stats snapshot — the figures the Hub bento card shows
 * for the routine module (`todayDone` / `todayTotal` / `streak`).
 *
 * Thin projection over the same aggregators the module's own header and
 * progress ring use: `completionRateForRange` for today's done/scheduled
 * counts and `flexibleMaxActiveStreak` for the longest active-habit streak.
 * The day boundary lives in the caller — `todayKey` is passed in as a
 * `YYYY-MM-DD` key (this package stays timezone-agnostic itself), matching
 * the existing streak/rate API.
 *
 * `skips` is optional and defaults to `{}` (unification audit 2026-08-31,
 * findings 1.5/1.6): without it, the Hub card showed the hard streak
 * (breaks on the first missed day) while the module's own hero already
 * showed the flexible one (canon §4 — pause/skip/grace-aware), and the
 * "N of M" counter didn't exclude a "не зміг" day from the denominator
 * the way the module's own progress ring does. Passing the same `skips`
 * the caller already has closes both gaps without moving the payload
 * shape consumers read from `STORAGE_KEYS.ROUTINE_QUICK_STATS`.
 */

import { completionRateForRange } from "./streaks.js";
import { flexibleMaxActiveStreak } from "./flexStreak.js";
import type { Habit, HabitSkip } from "./types.js";

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
  skips: Record<string, Record<string, HabitSkip>> = {},
): RoutineQuickStats {
  // `includeOnce` — todayDone/todayTotal є лічильником чек-листа дня, а не
  // метрикою: разова подія в списку видима, тож і тут рахується (канон
  // §7 п.2). Стрік нижче лишається метрикою — там `once` не бере участі.
  // `pausedFrom: todayKey` — заморозка минулого (ADR-0079 §2): quick-stats
  // завжди рахує «сьогодні», тож пауза, поставлена сьогодні, не має
  // ретроактивно вимивати звичку з цього самого дня.
  const { completed, scheduled } = completionRateForRange(
    habits,
    completions,
    todayKey,
    todayKey,
    { includeOnce: true, skips, pausedFrom: todayKey },
  );
  return {
    todayDone: completed,
    todayTotal: scheduled,
    streak: flexibleMaxActiveStreak(habits, completions, todayKey, skips),
  };
}
