import { describe, expect, it } from "vitest";

import type { Habit } from "./types.js";
import {
  weeklyGoalStreakBreakdown,
  weeklyGoalStreakWeeks,
} from "./weeklyGoalStreak.js";

/**
 * Тижнева серія для гнучкої звички: тиждень зараховано, коли відміток у ньому
 * не менше за ціль, чинну на КІНЕЦЬ того тижня. До 2026-09-03 модуль не мав
 * жодного тесту (11% рядків), хоча несе всю арифметику стрічки «N тижнів».
 */
function flexHabit(
  history: readonly { from: string; target: number }[],
): Habit {
  return {
    id: "h1",
    name: "Спорт",
    emoji: "check",
    archived: false,
    recurrence: "flexible",
    startDate: "2026-01-01",
    endDate: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    weeklyTargetHistory: history,
  } as Habit;
}

// Понеділки: 05.01, 12.01, 19.01 (ISO-тиждень починається з понеділка).
describe("routine-domain/weeklyGoalStreak", () => {
  it("рахує нуль без жодної відмітки", () => {
    const habit = flexHabit([{ from: "2026-01-01", target: 2 }]);
    expect(weeklyGoalStreakWeeks(habit, undefined, "2026-01-21")).toBe(0);
    expect(weeklyGoalStreakWeeks(habit, [], "2026-01-21")).toBe(0);
  });

  it("зараховує тиждень, у якому ціль виконана", () => {
    const habit = flexHabit([{ from: "2026-01-01", target: 2 }]);
    const done = ["2026-01-12", "2026-01-14"];
    const out = weeklyGoalStreakBreakdown(habit, done, "2026-01-21");
    expect(out.weeks).toBeGreaterThanOrEqual(1);
  });

  it("не зараховує тиждень, де відміток менше за ціль", () => {
    const habit = flexHabit([{ from: "2026-01-01", target: 3 }]);
    const done = ["2026-01-12", "2026-01-14"];
    const out = weeklyGoalStreakBreakdown(habit, done, "2026-01-21");
    expect(out.weeks).toBe(0);
  });

  // Ціль може змінитись усередині історії, і тиждень звіряється з тією, що
  // діяла на його КІНЕЦЬ — інакше підняття цілі заднім числом переписало б
  // уже зароблені тижні.
  it("бере ціль, чинну на кінець тижня, а не сьогоднішню", () => {
    const habit = flexHabit([
      { from: "2026-01-01", target: 2 },
      { from: "2026-01-19", target: 5 },
    ]);
    const done = ["2026-01-12", "2026-01-14"];
    const out = weeklyGoalStreakBreakdown(habit, done, "2026-01-21");
    expect(out.weeks).toBeGreaterThanOrEqual(1);
  });

  it("ігнорує сміття у списку відміток", () => {
    const habit = flexHabit([{ from: "2026-01-01", target: 1 }]);
    const dirty = [
      "2026-01-12",
      "не-дата",
      "",
      "2026-1-12",
    ] as unknown as string[];
    expect(() =>
      weeklyGoalStreakBreakdown(habit, dirty, "2026-01-14"),
    ).not.toThrow();
  });

  it("`weeks` — це те саме число, що й у розбивці", () => {
    const habit = flexHabit([{ from: "2026-01-01", target: 1 }]);
    const done = ["2026-01-12"];
    expect(weeklyGoalStreakWeeks(habit, done, "2026-01-14")).toBe(
      weeklyGoalStreakBreakdown(habit, done, "2026-01-14").weeks,
    );
  });
});
