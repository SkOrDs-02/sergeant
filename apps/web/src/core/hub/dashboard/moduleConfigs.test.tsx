/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import { MODULE_CONFIGS, type ModuleId } from "./moduleConfigs";

const MODULE_IDS: ModuleId[] = ["finyk", "fizruk", "routine", "nutrition"];

describe("MODULE_CONFIGS", () => {
  afterEach(() => localStorage.clear());

  it("registers the four dashboard modules with goal metadata", () => {
    expect(Object.keys(MODULE_CONFIGS).sort()).toEqual([...MODULE_IDS].sort());
    expect(MODULE_CONFIGS.finyk.hasGoal).toBe(false);
    expect(MODULE_CONFIGS.fizruk.hasGoal).toBe(false);
    expect(MODULE_CONFIGS.routine.hasGoal).toBe(true);
    expect(MODULE_CONFIGS.nutrition.hasGoal).toBe(true);
  });

  it("reads quick stats for every dashboard module from the shared storage keys", () => {
    localStorage.setItem(
      STORAGE_KEYS.FINYK_QUICK_STATS,
      JSON.stringify({ todaySpent: 120, budgetLeft: 880 }),
    );
    localStorage.setItem(
      STORAGE_KEYS.FIZRUK_QUICK_STATS,
      JSON.stringify({ weekWorkouts: 3, streak: 5 }),
    );
    localStorage.setItem(
      STORAGE_KEYS.ROUTINE_QUICK_STATS,
      JSON.stringify({ todayDone: 4, todayTotal: 5, streak: 2 }),
    );
    localStorage.setItem(
      STORAGE_KEYS.NUTRITION_QUICK_STATS,
      JSON.stringify({ todayCal: 1400, calGoal: 2000 }),
    );

    expect(MODULE_CONFIGS.finyk.getPreview()).toEqual({
      main: "120 ₴",
      sub: "Залишок: 880 ₴",
    });
    expect(MODULE_CONFIGS.fizruk.getPreview()).toEqual({
      main: "3 трен.",
      sub: "Серія: 5 днів",
    });
    expect(MODULE_CONFIGS.routine.getPreview()).toEqual({
      main: "4/5",
      sub: "Серія: 2 днів",
      progress: 80,
    });
    expect(MODULE_CONFIGS.nutrition.getPreview()).toEqual({
      main: "1400 ккал",
      sub: "Ціль: 2000 ккал",
      progress: 70,
    });
  });

  it("returns neutral progress shapes for missing goal-module stats", () => {
    expect(MODULE_CONFIGS.routine.getPreview()).toEqual({
      main: null,
      sub: null,
      progress: 0,
    });
    expect(MODULE_CONFIGS.nutrition.getPreview()).toEqual({
      main: null,
      sub: null,
      progress: 0,
    });
  });
});
