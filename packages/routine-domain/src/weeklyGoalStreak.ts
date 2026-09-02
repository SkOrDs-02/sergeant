import {
  computeWeeklyStreakBreakdownFromInstants,
  kyivWeekStartKey,
  type WeeklyStreakBreakdown,
} from "@sergeant/shared";

import type { Habit } from "./types.js";
import { weeklyTargetForDate } from "./weeklyTarget.js";

export type WeeklyGoalStreakBreakdown = WeeklyStreakBreakdown;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateKeyToNoonUtc(dateKey: string): string {
  return `${dateKey}T12:00:00.000Z`;
}

export function weeklyGoalStreakBreakdown(
  habit: Habit,
  completionsForHabit: readonly string[] | undefined,
  todayKey: string,
): WeeklyGoalStreakBreakdown {
  const done = (completionsForHabit ?? []).filter(
    (key) => typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key),
  );
  return computeWeeklyStreakBreakdownFromInstants(done.map(dateKeyToNoonUtc), {
    now: new Date(dateKeyToNoonUtc(todayKey)),
    targetPerWeek: weeklyTargetForDate(habit, todayKey),
    targetForWeek: (weekStartKey) => {
      const weekMs = Date.parse(dateKeyToNoonUtc(weekStartKey));
      const weekEndKey = kyivWeekStartKey(weekMs + 6 * MS_PER_DAY);
      return weeklyTargetForDate(habit, weekEndKey);
    },
  });
}

export function weeklyGoalStreakWeeks(
  habit: Habit,
  completionsForHabit: readonly string[] | undefined,
  todayKey: string,
): number {
  return weeklyGoalStreakBreakdown(habit, completionsForHabit, todayKey).weeks;
}
