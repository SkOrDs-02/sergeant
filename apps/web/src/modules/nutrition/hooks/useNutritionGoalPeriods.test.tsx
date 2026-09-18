// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GoalPeriod } from "@sergeant/nutrition-domain";

const cache = vi.hoisted(() => ({ goalPeriods: [] as GoalPeriod[] }));
const gate = vi.hoisted(() => ({ tick: 0 }));

vi.mock("../lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => cache,
}));
vi.mock("../lib/sqliteReadGate", () => ({
  useNutritionSqliteReadTick: () => gate.tick,
}));

import { useNutritionGoalPeriods } from "./useNutritionGoalPeriods";

afterEach(() => {
  cache.goalPeriods = [];
  gate.tick = 0;
});

it("returns the current SQLite goal history after the cache refreshes", () => {
  cache.goalPeriods = [{ id: "goal-1" } as GoalPeriod];
  gate.tick = 1;

  const { result } = renderHook(() => useNutritionGoalPeriods());

  expect(result.current).toEqual([{ id: "goal-1" }]);
});
