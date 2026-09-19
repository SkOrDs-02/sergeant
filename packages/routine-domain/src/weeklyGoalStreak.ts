import {
  computeWeeklyStreakBreakdownFromInstants,
  type WeeklyStreakBreakdown,
} from "@sergeant/shared";

import type { Habit } from "./types.js";
import { weekEndKeyForDateKey, weeklyTargetForDate } from "./weeklyTarget.js";

export type WeeklyGoalStreakBreakdown = WeeklyStreakBreakdown;

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
    // Ціль тижня береться станом на його КІНЕЦЬ (неділю), а не на старт:
    // піднята в середу ціль стосується всього тижня цілком. Інакше той самий
    // тиждень на одному екрані «закритий ✓», а на іншому «2/3» — обидва числа
    // з одного сховища.
    //
    // Доти тут стояв `kyivWeekStartKey(weekMs + 6 днів)`, і це був no-op:
    // хелпер повертає понеділок тижня, що містить інстант, а понеділок+6 днів
    // — неділя ТОГО Ж тижня, тож `weekEndKey === weekStartKey`. Канонічний
    // хелпер у репо — `weekEndKeyForDateKey`; ним же міряють тиждень
    // `streaks.ts` і `periodCompletion.ts`.
    targetForWeek: (weekStartKey) =>
      weeklyTargetForDate(habit, weekEndKeyForDateKey(weekStartKey)),
  });
}

export function weeklyGoalStreakWeeks(
  habit: Habit,
  completionsForHabit: readonly string[] | undefined,
  todayKey: string,
): number {
  return weeklyGoalStreakBreakdown(habit, completionsForHabit, todayKey).weeks;
}
