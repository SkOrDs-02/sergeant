// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import NutritionCard from "./NutritionCard";
import FitnessCard from "./FitnessCard";
import RoutineCard from "./RoutineCard";
import ExpensesCard from "./ExpensesCard";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../modules/finyk/lib/sqliteReader";
import { STORAGE_KEYS } from "@sergeant/shared";
import { useNutritionQuickStatsBoot } from "../../modules/nutrition/hooks/useNutritionQuickStatsBoot";
import { useFizrukQuickStatsBoot } from "../../modules/fizruk/hooks/useFizrukQuickStatsBoot";
import { useRoutineQuickStatsBoot } from "../../modules/routine/hooks/useRoutineQuickStatsBoot";
import { useNutritionQuickStatsWriter } from "../../modules/nutrition/hooks/useNutritionQuickStatsWriter";
import { useFizrukQuickStatsWriter } from "../../modules/fizruk/hooks/useFizrukQuickStatsWriter";
import { useRoutineQuickStatsWriter } from "../../modules/routine/hooks/useRoutineQuickStatsWriter";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
  getCachedNutritionSqliteState,
} from "../../modules/nutrition/lib/sqliteReader";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
} from "../../modules/fizruk/lib/sqliteReader";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../modules/routine/lib/sqliteReader";
import { loadRoutineState } from "../../modules/routine/lib/routineStorage";

// Cache seams only: the production snapshots, selectors, clocks and bus run real.
const originalTz = process.env["TZ"];
beforeEach(() => {
  process.env["TZ"] = "Europe/Kyiv";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T20:59:59Z")); // Sunday 23:59:59
  localStorage.clear();
  __setFinykSqliteStateCacheForTests({
    manualExpenses: [
      {
        id: "expense",
        date: "2026-10-18",
        amount: 100,
        description: "Крамниця",
        category: "food",
      },
    ],
  });
  __setNutritionSqliteCacheForTests({
    log: {
      "2026-10-18": {
        meals: [
          {
            id: "meal",
            name: "Суп",
            time: "12:00",
            mealType: "lunch",
            label: "Суп",
            source: "manual",
            macroSource: "manual",
            amount_g: null,
            foodId: null,
            macros: { kcal: 640, protein_g: 0, fat_g: 0, carbs_g: 0 },
          },
        ],
      },
    },
  });
  __setFizrukSqliteCacheForTests({
    workouts: [
      {
        id: "workout",
        startedAt: "2026-10-18T09:00:00Z",
        endedAt: "2026-10-18T10:00:00Z",
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      },
    ],
  });
  __setRoutineSqliteStateCacheForTests({
    habits: [
      {
        id: "habit",
        name: "Читати",
        recurrence: "daily",
        startDate: "2026-10-01",
      },
    ],
    habitOrder: ["habit"],
  });
  __setRoutineSqliteCompletionsCacheForTests({
    completions: { habit: ["2026-10-18"] },
  });
});

it.each([
  ["calories", NutritionCard, /Калорії/, /640/, /Калорії0 ккал/],
  ["workouts", FitnessCard, /Тренування/, /1 трен\./, /0 трен\./],
  ["habits", RoutineCard, /Звички/, /14%/, /0%/],
  ["expenses", ExpensesCard, /Витрати/, /100/, /Витрати0/],
] as const)(
  "report windows follow the new week for %s without a storage write",
  (_, Card, heading, before, after) => {
    render(<Card period="week" offset={0} />);
    const summary = screen.getByRole("button", { name: heading });
    expect(summary).toHaveTextContent(before);
    act(() => {
      vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(summary).toHaveTextContent(after);
  },
);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalTz === undefined) delete process.env["TZ"];
  else process.env["TZ"] = originalTz;
  clearNutritionSqliteCache();
  clearFinykSqliteCache();
  clearFizrukSqliteCache();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  localStorage.clear();
});

function useScreenWriters() {
  const nutrition = getCachedNutritionSqliteState();
  const fizruk = getCachedFizrukSqliteState();
  const routine = loadRoutineState();
  useNutritionQuickStatsWriter({ log: nutrition.log, prefs: nutrition.prefs });
  useFizrukQuickStatsWriter(fizruk.workouts);
  useRoutineQuickStatsWriter(routine);
}

describe.each([
  [
    "global boot without opening a module",
    () => {
      useNutritionQuickStatsBoot();
      useFizrukQuickStatsBoot();
      useRoutineQuickStatsBoot();
    },
  ],
  ["mounted module writers with unchanged records", useScreenWriters],
] as const)("day freshness — %s", (_, useWriters) => {
  it.each(["midnight timer", "resume visibility", "resume focus"])(
    "resets today's calories, habits and this week's workouts on %s",
    (signal) => {
      renderHook(useWriters);
      const read = (key: string) => JSON.parse(localStorage.getItem(key)!);
      expect(read(STORAGE_KEYS.NUTRITION_QUICK_STATS).todayCal).toBe(640);
      expect(read(STORAGE_KEYS.ROUTINE_QUICK_STATS).todayDone).toBe(1);
      expect(read(STORAGE_KEYS.FIZRUK_QUICK_STATS).weekWorkouts).toBe(1);
      act(() => {
        if (signal === "midnight timer") vi.advanceTimersByTime(2_001);
        else {
          // Frozen background tabs don't run their pending midnight timer.
          vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
          if (signal === "resume visibility")
            document.dispatchEvent(new Event("visibilitychange"));
          else window.dispatchEvent(new Event("focus"));
        }
      });
      expect(read(STORAGE_KEYS.NUTRITION_QUICK_STATS).todayCal).toBe(0);
      expect(read(STORAGE_KEYS.ROUTINE_QUICK_STATS).todayDone).toBe(0);
      expect(read(STORAGE_KEYS.FIZRUK_QUICK_STATS).weekWorkouts).toBe(0);
    },
  );
});
