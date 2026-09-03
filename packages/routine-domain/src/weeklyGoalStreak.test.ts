import { describe, expect, it } from "vitest";

import type { Habit } from "./types.js";
import {
  weeklyGoalStreakBreakdown,
  weeklyGoalStreakWeeks,
} from "./weeklyGoalStreak.js";

// 2026-01-05 — понеділок, тож поточний тиждень 05..11, попередній 12-29..01-04.
function habit(patch: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Зарядка",
    recurrence: "flexible",
    startDate: "2025-12-01",
    ...patch,
  };
}

describe("weeklyGoalStreakBreakdown", () => {
  it("порожні відмітки — нульовий стрік із поточною ціллю", () => {
    const b = weeklyGoalStreakBreakdown(
      habit({ weeklyTargetHistory: [{ from: "2025-12-01", target: 2 }] }),
      undefined,
      "2026-01-07",
    );
    expect(b).toEqual({
      weeks: 0,
      targetPerWeek: 2,
      currentWeekWorkouts: 0,
      currentWeekPending: false,
      brokenOnWeekStart: null,
    });
  });

  it("два добрані тижні поспіль дають стрік 2", () => {
    const b = weeklyGoalStreakBreakdown(
      habit({ weeklyTargetHistory: [{ from: "2025-12-01", target: 2 }] }),
      ["2025-12-29", "2025-12-30", "2026-01-05", "2026-01-06", "сміття"],
      "2026-01-07",
    );
    expect(b.weeks).toBe(2);
    expect(b.currentWeekWorkouts).toBe(2);
    expect(b.currentWeekPending).toBe(false);
  });

  it("недобраний поточний тиждень не рве стрік, а лишається pending", () => {
    const b = weeklyGoalStreakBreakdown(
      habit({ weeklyTargetHistory: [{ from: "2025-12-01", target: 2 }] }),
      ["2025-12-29", "2025-12-30", "2026-01-05"],
      "2026-01-07",
    );
    expect(b.weeks).toBe(1);
    expect(b.currentWeekPending).toBe(true);
    expect(b.brokenOnWeekStart).toBe(null);
  });

  it("кожен тиждень міряється своєю ціллю з історії", () => {
    // Ціль піднято до 3 з 2026-01-05: попередній тиждень лишається під ціллю 1.
    const h = habit({
      weeklyTargetHistory: [
        { from: "2025-12-01", target: 1 },
        { from: "2026-01-05", target: 3 },
      ],
    });
    const done = ["2025-12-29", "2026-01-05", "2026-01-06"];
    const b = weeklyGoalStreakBreakdown(h, done, "2026-01-07");
    expect(b.targetPerWeek).toBe(3);
    expect(b.currentWeekPending).toBe(true);
    expect(b.weeks).toBe(1);

    const met = weeklyGoalStreakBreakdown(
      h,
      [...done, "2026-01-07"],
      "2026-01-07",
    );
    expect(met.currentWeekPending).toBe(false);
    expect(met.weeks).toBe(2);
  });

  it("порожній тиждень усередині рве стрік", () => {
    const b = weeklyGoalStreakBreakdown(
      habit({ weeklyTargetHistory: [{ from: "2025-12-01", target: 1 }] }),
      ["2025-12-22", "2026-01-05"],
      "2026-01-07",
    );
    expect(b.weeks).toBe(1);
    expect(b.brokenOnWeekStart).toBe("2025-12-29");
  });
});

describe("weeklyGoalStreakWeeks", () => {
  it("повертає тільки кількість тижнів", () => {
    expect(
      weeklyGoalStreakWeeks(
        habit({ weeklyTargetHistory: [{ from: "2025-12-01", target: 1 }] }),
        ["2025-12-29", "2026-01-05"],
        "2026-01-07",
      ),
    ).toBe(2);
  });
});
