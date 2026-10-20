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

import { calcRoutineDayProgress } from "./dayProgress.js";
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
  // Той самий селектор, що й кільце «Прогрес дня» в модулі
  // (`calcRoutineDayProgress`): `includeOnce` (лічильник чек-листа, не
  // метрика — канон §7 п.2), `pausedFrom: todayKey` (заморозка минулого,
  // ADR-0079 §2) і гнучкі звички за `weekDoneCount`, а не тижневою
  // арифметикою (logic-11). Стрік нижче лишається метрикою — там `once` не
  // бере участі.
  const { completed, scheduled } = calcRoutineDayProgress(
    habits,
    completions,
    todayKey,
    todayKey,
    skips,
  );
  return {
    todayDone: completed,
    todayTotal: scheduled,
    streak: flexibleMaxActiveStreak(habits, completions, todayKey, skips),
  };
}
