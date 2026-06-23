// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  appendWorkoutLines,
  appendRoutineLines,
  appendNutritionLines,
  appendAiSignalLines,
} from "./sections";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../../modules/routine/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../../modules/nutrition/lib/sqliteReader";
import { writeMemoryEntries } from "../../profile/memoryBank";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";

const NOW = new Date("2026-06-15T12:00:00Z");

beforeEach(() => {
  localStorage.clear();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  clearNutritionSqliteCache();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("appendWorkoutLines", () => {
  it("emits nothing when no workouts in LS", () => {
    const lines: string[] = [];
    appendWorkoutLines(lines);
    expect(lines).toEqual([]);
  });

  it("emits workout summary lines when LS has workouts", () => {
    const now = Date.now();
    const workouts = [
      {
        id: "w1",
        startedAt: new Date(now - 2 * 86400000).toISOString(),
        endedAt: new Date(now - 2 * 86400000 + 3600000).toISOString(),
        items: [{ nameUk: "Присід" }, { name: "Жим" }],
      },
    ];
    localStorage.setItem("fizruk_workouts_v1", JSON.stringify(workouts));
    const lines: string[] = [];
    appendWorkoutLines(lines);
    const out = lines.join("\n");
    expect(out).toContain("[Тренування]");
    expect(out).toContain("[Фізрук тиждень]");
    expect(out).toContain("[Фізрук загалом]");
    expect(out).toContain("[Фізрук активне тренування]");
    expect(out).toContain("[Останнє тренування вправи]");
  });

  it("reports an active workout when ACTIVE_WORKOUT_KEY is set", () => {
    const now = Date.now();
    localStorage.setItem(
      "fizruk_workouts_v1",
      JSON.stringify([
        {
          id: "active1",
          startedAt: new Date(now - 3600000).toISOString(),
          items: [{ nameUk: "Тяга" }],
        },
      ]),
    );
    localStorage.setItem("fizruk_active_workout_id_v1", "active1");
    const lines: string[] = [];
    appendWorkoutLines(lines);
    const activeLine = lines.find((l) => l.startsWith("[Фізрук активне"));
    expect(activeLine).toContain("поточній сесії");
  });
});

describe("appendRoutineLines", () => {
  it("emits nothing when no habits", () => {
    const lines: string[] = [];
    appendRoutineLines(lines, NOW);
    expect(lines).toEqual([]);
  });

  it("emits routine summary when habits + completions exist", () => {
    const todayKey = getKyivDayKey(NOW);
    __setRoutineSqliteStateCacheForTests({
      habits: [
        { id: "h1", name: "Біг", emoji: "🏃", archived: false },
        { id: "h2", name: "Вода", emoji: "💧", archived: false },
      ] as never,
    });
    __setRoutineSqliteCompletionsCacheForTests({
      completions: { h1: [todayKey], h2: [] },
    });
    const lines: string[] = [];
    appendRoutineLines(lines, NOW);
    const out = lines.join("\n");
    expect(out).toContain("[Рутина]");
    expect(out).toContain("[Рутина сьогодні]");
    expect(out).toContain("[Рутина тиждень]");
  });
});

describe("appendNutritionLines", () => {
  it("emits nothing when no nutrition data", () => {
    const lines: string[] = [];
    appendNutritionLines(lines, NOW);
    expect(lines).toEqual([]);
  });

  it("emits nutrition summary for today's meals + targets + weekly avg", () => {
    const todayKey = getKyivDayKey(NOW);
    __setNutritionSqliteCacheForTests({
      log: {
        [todayKey]: {
          meals: [
            {
              name: "Омлет",
              macros: { kcal: 400, protein_g: 30, fat_g: 20, carbs_g: 10 },
            },
          ],
        },
      } as never,
      prefs: {
        prefsJson: JSON.stringify({
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 150,
        }),
      } as never,
    });
    const lines: string[] = [];
    appendNutritionLines(lines, NOW);
    const out = lines.join("\n");
    expect(out).toContain("[Харчування сьогодні]");
    expect(out).toContain("[Харчування прийоми]");
  });
});

describe("appendAiSignalLines", () => {
  it("emits profile section when memory entries exist", () => {
    writeMemoryEntries([
      { id: "m1", fact: "Любить каву", category: "preferences", createdAt: 1 },
    ] as never);
    const lines: string[] = [];
    appendAiSignalLines(lines);
    const out = lines.join("\n");
    expect(out).toContain("[Профіль користувача]");
    expect(out).toContain("Любить каву");
  });

  it("does not throw with empty data", () => {
    const lines: string[] = [];
    expect(() => appendAiSignalLines(lines)).not.toThrow();
  });
});
