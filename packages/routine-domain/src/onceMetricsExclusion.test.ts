/**
 * `once` поза агрегатними метриками — канон `routine.md` §7 п.2, рішення
 * founder-а 2026-08-30 (`METRICS_VERSION` 11): разова подія лишається в
 * розкладі дня (чекін працює), але не рухає стрік, heatmap і % виконання.
 *
 * Один файл на всі агрегатори навмисно: виняток має триматись скрізь
 * однаково, і саме «скрізь» тут — обʼєкт перевірки.
 */

import { describe, it, expect } from "vitest";
import {
  flexibleStreakBreakdown,
  flexibleMaxActiveStreak,
} from "./flexStreak.js";
import { buildHabitRangeRows } from "./habitRangeRows.js";
import { calcRoutinePeriodCompletion } from "./periodCompletion.js";
import { habitCountsTowardMetrics, habitScheduledOnDate } from "./schedule.js";
import {
  completionRateForRange,
  habitCompletionRate,
  maxActiveStreak,
  maxStreakAllTime,
  streakForHabit,
} from "./streaks.js";
import { buildHeatmapGrid } from "./domain/heatmap/grid.js";
import type { Habit } from "./types.js";

function dailyHabit(id = "daily"): Habit {
  return {
    id,
    name: id,
    archived: false,
    recurrence: "daily",
    startDate: "2026-01-01",
    endDate: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };
}

function onceHabit(id = "once", startDate = "2026-01-05"): Habit {
  return {
    id,
    name: id,
    archived: false,
    recurrence: "once",
    startDate,
    endDate: null,
    weekdays: [],
  };
}

const TODAY = "2026-01-10";

describe("once поза метриками", () => {
  it("habitCountsTowardMetrics вирізняє лише once", () => {
    expect(habitCountsTowardMetrics(onceHabit())).toBe(false);
    expect(habitCountsTowardMetrics(dailyHabit())).toBe(true);
    // Відсутня рекурентність трактується як daily — рахується.
    expect(
      habitCountsTowardMetrics({ ...dailyHabit(), recurrence: undefined }),
    ).toBe(true);
  });

  it("розклад once НЕ змінюється — чек-лист дня її бачить", () => {
    const h = onceHabit("o", "2026-01-05");
    expect(habitScheduledOnDate(h, "2026-01-05")).toBe(true);
    expect(habitScheduledOnDate(h, "2026-01-06")).toBe(false);
  });

  it("стрік (жорсткий): once дає 0 і не тягне max", () => {
    const o = onceHabit("o", TODAY);
    expect(streakForHabit(o, [TODAY], TODAY)).toBe(0);
    expect(maxStreakAllTime(o, [TODAY])).toBe(0);
    const habits = [o, dailyHabit("d")];
    const completions = { o: [TODAY], d: [TODAY, "2026-01-09"] };
    expect(maxActiveStreak(habits, completions, TODAY)).toBe(2);
    // Стрік, що тримався б лише на once-відмітці, — нуль.
    expect(maxActiveStreak([o], { o: [TODAY] }, TODAY)).toBe(0);
  });

  it("стрік (гнучкий): once дає порожній breakdown без todayPending", () => {
    const o = onceHabit("o", TODAY);
    const b = flexibleStreakBreakdown(o, [TODAY], TODAY);
    expect(b.days).toBe(0);
    expect(b.window).toEqual([]);
    expect(b.todayPending).toBe(false);
    expect(
      flexibleMaxActiveStreak(
        [o, dailyHabit("d")],
        { o: [TODAY], d: [TODAY] },
        TODAY,
      ),
    ).toBe(1);
  });

  it("rate за період: once виходить зі знаменника і чисельника", () => {
    const habits = [onceHabit("o", "2026-01-05"), dailyHabit("d")];
    const completions = { o: ["2026-01-05"], d: ["2026-01-05"] };
    const r = completionRateForRange(
      habits,
      completions,
      "2026-01-05",
      "2026-01-05",
    );
    expect(r).toEqual({ completed: 1, scheduled: 1, rate: 1 });
  });

  it("includeOnce (лічильник чек-листа): once рахується", () => {
    const habits = [onceHabit("o", "2026-01-05"), dailyHabit("d")];
    const completions = { o: ["2026-01-05"], d: [] as string[] };
    const r = completionRateForRange(
      habits,
      completions,
      "2026-01-05",
      "2026-01-05",
      { includeOnce: true },
    );
    expect(r).toEqual({ completed: 1, scheduled: 2, rate: 0.5 });
  });

  it("habitCompletionRate для once — порожній результат", () => {
    const r = habitCompletionRate(
      onceHabit("o", "2026-01-05"),
      ["2026-01-05"],
      "2026-01-01",
      "2026-01-10",
    );
    expect(r).toEqual({ completed: 0, scheduled: 0, rate: 0 });
  });

  it("канонічна періодна агрегація: once не дає ні числа, ні рядка", () => {
    const res = calcRoutinePeriodCompletion(
      [onceHabit("o", "2026-01-05"), dailyHabit("d")],
      { o: ["2026-01-05"], d: ["2026-01-05"] },
      ["2026-01-05"],
    );
    expect(res.scheduled).toBe(1);
    expect(res.completed).toBe(1);
    expect(res.perHabit.map((h) => h.id)).toEqual(["d"]);
  });

  it("heatmap: once поза знаменником в обох режимах", () => {
    const habits = [onceHabit("o", "2026-01-05"), dailyHabit("d")];
    const completions = { o: ["2026-01-05"], d: [] as string[] };
    const today = new Date(2026, 0, 10, 12);

    const scheduled = buildHeatmapGrid(habits, completions, today, 2, {
      denominator: "scheduled",
    });
    const cell = scheduled.weeks.flat().find((c) => c.dateKey === "2026-01-05");
    expect(cell?.total).toBe(1); // лише daily
    expect(cell?.cnt).toBe(0); // once-відмітка не рахується

    const legacy = buildHeatmapGrid(habits, completions, today, 2);
    const legacyCell = legacy.weeks
      .flat()
      .find((c) => c.dateKey === "2026-01-05");
    // Легасі-режим: плоский знаменник без once (раніше once роздувала
    // його кожного дня сітки).
    expect(legacyCell?.total).toBe(1);
    expect(legacyCell?.cnt).toBe(0);
  });

  it("per-habit рядки статистики: once не отримує рядка", () => {
    const rows = buildHabitRangeRows(
      [onceHabit("o", "2026-01-05"), dailyHabit("d")],
      { o: ["2026-01-05"], d: ["2026-01-05"] },
      new Date(2026, 0, 10, 12),
      7,
    );
    expect(rows.map((r) => r.habitId)).toEqual(["d"]);
  });
});
