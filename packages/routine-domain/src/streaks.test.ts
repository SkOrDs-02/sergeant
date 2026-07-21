import { describe, it, expect } from "vitest";
import {
  completionRateForRange,
  habitCompletionRate,
  maxActiveStreak,
  maxStreakAllTime,
  streakForHabit,
} from "./streaks.js";
import type { Habit } from "./types.js";

function dailyHabit(id = "h1"): Habit {
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

describe("routine-domain/streaks", () => {
  it("streakForHabit counts consecutive scheduled completions backwards", () => {
    const h = dailyHabit("h");
    const todayKey = "2026-01-10";
    const completions = ["2026-01-10", "2026-01-09", "2026-01-08"];
    expect(streakForHabit(h, completions, todayKey)).toBe(3);
    expect(streakForHabit(h, ["2026-01-10", "2026-01-08"], todayKey)).toBe(1);
  });

  it("streakForHabit returns 0 for no completions", () => {
    const h = dailyHabit("h");
    expect(streakForHabit(h, [], "2026-01-10")).toBe(0);
    expect(streakForHabit(h, undefined, "2026-01-10")).toBe(0);
  });

  it("streakForHabit skips unscheduled days when counting backwards", () => {
    const h: Habit = {
      ...dailyHabit("weekly"),
      recurrence: "weekly",
      weekdays: [0, 2, 4],
    };

    expect(
      streakForHabit(
        h,
        ["2026-01-05", "2026-01-07", "2026-01-09"],
        "2026-01-09",
      ),
    ).toBe(3);
  });

  it("maxStreakAllTime finds best streak", () => {
    const h = dailyHabit("h");
    const completions = [
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-05",
      "2026-01-06",
    ];
    expect(maxStreakAllTime(h, completions)).toBe(3);
  });

  it("maxStreakAllTime returns 0 for empty completion history", () => {
    expect(maxStreakAllTime(dailyHabit("h"), undefined)).toBe(0);
  });

  it("maxStreakAllTime keeps historical completions after schedule narrowing", () => {
    // Звичка зараз weekly (пн/ср/пт), але раніше була daily і користувач
    // виконував її щодня. Історичний best streak не має зникати.
    const h: Habit = {
      id: "h",
      name: "h",
      archived: false,
      recurrence: "weekly",
      startDate: "2026-01-01",
      endDate: null,
      weekdays: [0, 2, 4], // пн, ср, пт (ISO 0-based)
    };
    const completions = [
      "2026-01-05", // пн
      "2026-01-06", // вт (не заплановано зараз)
      "2026-01-07", // ср
      "2026-01-08", // чт (не заплановано)
      "2026-01-09", // пт
    ];
    expect(maxStreakAllTime(h, completions)).toBe(5);
  });

  it("maxStreakAllTime bridges unscheduled days between weekly completions", () => {
    const h: Habit = {
      ...dailyHabit("weekly"),
      recurrence: "weekly",
      weekdays: [0, 4], // Monday + Friday.
    };

    expect(maxStreakAllTime(h, ["2026-01-05", "2026-01-09"])).toBe(2);
  });

  it("streakForHabit terminates for monthly habits with long history", () => {
    // Раніше магічний ліміт 500 ітерацій обривав multi-year monthly-стрік.
    const h: Habit = {
      id: "h",
      name: "h",
      archived: false,
      recurrence: "monthly",
      startDate: "2023-01-15",
      endDate: null,
    };
    const completions: string[] = [];
    for (let y = 2023; y <= 2026; y++) {
      for (let m = 1; m <= 12; m++) {
        if (y === 2026 && m > 1) break;
        completions.push(`${y}-${String(m).padStart(2, "0")}-15`);
      }
    }
    // Сьогодні — 15 січ 2026; 37 послідовних місячних виконань підряд.
    expect(streakForHabit(h, completions, "2026-01-15")).toBe(37);
  });

  it("completionRateForRange returns scheduled/completed/rate", () => {
    const h1 = dailyHabit("h1");
    const h2 = dailyHabit("h2");
    const completions = {
      h1: ["2026-01-02"],
      h2: ["2026-01-01", "2026-01-02"],
    };
    const r = completionRateForRange(
      [h1, h2],
      completions,
      "2026-01-01",
      "2026-01-02",
    );
    expect(r.scheduled).toBe(4);
    expect(r.completed).toBe(3);
    expect(r.rate).toBeCloseTo(0.75);
  });

  it("completionRateForRange returns 0-rate for empty scheduled set", () => {
    const r = completionRateForRange([], {}, "2026-01-01", "2026-01-02");
    expect(r.scheduled).toBe(0);
    expect(r.completed).toBe(0);
    expect(r.rate).toBe(0);
  });

  it("maxActiveStreak ignores archived habits", () => {
    const active = dailyHabit("active");
    const archived = { ...dailyHabit("archived"), archived: true };

    expect(
      maxActiveStreak(
        [active, archived],
        {
          active: ["2026-01-09", "2026-01-10"],
          archived: ["2026-01-08", "2026-01-09", "2026-01-10"],
        },
        "2026-01-10",
      ),
    ).toBe(2);
  });

  it("habitCompletionRate counts scheduled/completed across an explicit Kyiv range", () => {
    const r = habitCompletionRate(
      dailyHabit("h"),
      ["2026-01-08", "2026-01-10"],
      "2026-01-08",
      "2026-01-10",
    );

    expect(r).toEqual({
      scheduled: 3,
      completed: 2,
      rate: 2 / 3,
    });
  });

  it("habitCompletionRate returns 0-rate when the habit is never scheduled", () => {
    const r = habitCompletionRate(
      { ...dailyHabit("paused"), paused: true },
      ["2026-01-08"],
      "2026-01-08",
      "2026-01-10",
    );

    expect(r).toEqual({
      scheduled: 0,
      completed: 0,
      rate: 0,
    });
  });
});
