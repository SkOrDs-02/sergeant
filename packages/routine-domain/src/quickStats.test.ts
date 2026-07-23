import { describe, it, expect } from "vitest";
import { computeRoutineQuickStats } from "./quickStats.js";
import type { Habit } from "./types.js";

const daily = (id: string): Habit => ({
  id,
  name: id,
  recurrence: "daily",
  startDate: "2026-07-01",
});

// Thu 2026-07-23 (Kyiv day key supplied by the caller).
const TODAY = "2026-07-23";

describe("computeRoutineQuickStats", () => {
  const habits: Habit[] = [
    daily("a"),
    daily("b"),
    { ...daily("archived"), archived: true },
    // Weekly, Mondays only → not scheduled on Thursday.
    {
      id: "mon-only",
      name: "mon",
      recurrence: "weekly",
      weekdays: [0],
      startDate: "2026-07-01",
    },
  ];
  const completions: Record<string, string[]> = {
    a: ["2026-07-23", "2026-07-22", "2026-07-21"], // done today, 3-day streak
    b: [], // scheduled today, not done
  };

  it("counts today's done/total over scheduled active habits and the max streak", () => {
    const stats = computeRoutineQuickStats(habits, completions, TODAY);
    // scheduled today: a + b (archived excluded, mon-only not on Thu).
    expect(stats).toEqual({ todayDone: 1, todayTotal: 2, streak: 3 });
  });

  it("keys 'done today' off the supplied Kyiv day key", () => {
    // Same data, but the caller's Kyiv day rolled over to 07-24 with no
    // completion yet → today's completions drop to 0 while the habit stays
    // scheduled. A UTC-vs-Kyiv day-key mismatch would show a stale count.
    const stats = computeRoutineQuickStats(habits, completions, "2026-07-24");
    expect(stats.todayDone).toBe(0);
    expect(stats.todayTotal).toBe(2);
  });

  it("returns zeroes for no habits", () => {
    expect(computeRoutineQuickStats([], {}, TODAY)).toEqual({
      todayDone: 0,
      todayTotal: 0,
      streak: 0,
    });
  });
});
