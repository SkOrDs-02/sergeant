import { describe, it, expect, beforeEach } from "vitest";
import { seedHubQuickStats } from "./seedHubQuickStats";
import {
  FINYK_QUICK_STATS_KEY,
  FIZRUK_QUICK_STATS_KEY,
  ROUTINE_QUICK_STATS_KEY,
  NUTRITION_QUICK_STATS_KEY,
} from "./keys";

beforeEach(() => {
  localStorage.clear();
});

describe("seedHubQuickStats", () => {
  it("writes non-zero finyk quick stats", () => {
    seedHubQuickStats();
    const finyk = JSON.parse(localStorage.getItem(FINYK_QUICK_STATS_KEY)!);
    expect(finyk).toEqual({ todaySpent: 450, budgetLeft: 18800 });
  });

  it("writes non-zero fizruk quick stats", () => {
    seedHubQuickStats();
    const fizruk = JSON.parse(localStorage.getItem(FIZRUK_QUICK_STATS_KEY)!);
    expect(fizruk).toEqual({ weekWorkouts: 2, streak: 5 });
  });

  it("writes non-zero routine quick stats with all habits done", () => {
    seedHubQuickStats();
    const routine = JSON.parse(localStorage.getItem(ROUTINE_QUICK_STATS_KEY)!);
    expect(routine).toEqual({ todayDone: 5, todayTotal: 5, streak: 14 });
    expect(routine.todayDone).toBe(routine.todayTotal);
  });

  it("writes non-zero nutrition quick stats under the calorie goal", () => {
    seedHubQuickStats();
    const nutrition = JSON.parse(
      localStorage.getItem(NUTRITION_QUICK_STATS_KEY)!,
    );
    expect(nutrition).toEqual({ todayCal: 1250, calGoal: 2200 });
    expect(nutrition.todayCal).toBeLessThan(nutrition.calGoal);
  });
});
