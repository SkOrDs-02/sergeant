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
import { CATEGORY_META, writeMemoryEntries } from "../../profile/memoryBank";
import {
  GOAL_MEMORY_CATEGORY,
  HEALTH_MEMORY_CATEGORIES,
  HEALTH_MEMORY_CATEGORY_LABELS,
  isHealthProfileLabel,
} from "@sergeant/shared";
import { dateKeyFromDate } from "@sergeant/routine-domain";

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
    const todayKey = dateKeyFromDate(NOW);
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

  /**
   * ADR-0078: межа особистої доби — за пристроєм, не за Києвом.
   *
   * Момент навмисно взятий такий, де київська й UTC-дати РОЗХОДЯТЬСЯ:
   * 21:30 UTC — це вже 00:30 наступного дня в Києві. Відмітка лежить під
   * локальним ключем пристрою (так її пише Рутина), тож київський розрахунок
   * шукав би її під завтрашньою датою й показав «виконано 0».
   *
   * Межа тесту, чесно: на машині з київською таймзоною локальна й київська
   * дати збігаються, і регресію він не зловить. Ловить її CI (UTC).
   */
  it("бере день-ключ пристрою, а не київський, на межі доби", () => {
    const lateUtc = new Date("2026-06-15T21:30:00Z");
    const deviceKey = dateKeyFromDate(lateUtc);
    __setRoutineSqliteStateCacheForTests({
      habits: [
        { id: "h1", name: "Біг", emoji: "🏃", archived: false },
      ] as never,
    });
    __setRoutineSqliteCompletionsCacheForTests({
      completions: { h1: [deviceKey] },
    });
    const lines: string[] = [];
    appendRoutineLines(lines, lateUtc);
    const out = lines.join("\n");
    expect(out).toContain("виконано сьогодні: 1 з 1");
    expect(out).toContain("Біг (id:h1): виконано");
  });
});

describe("appendNutritionLines", () => {
  it("emits nothing when no nutrition data", () => {
    const lines: string[] = [];
    appendNutritionLines(lines, NOW);
    expect(lines).toEqual([]);
  });

  it("emits nutrition summary for today's meals + targets + weekly avg", () => {
    const todayKey = dateKeyFromDate(NOW);
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
      goalPeriods: [
        {
          id: "goal",
          effectiveFrom: "2026-06-01",
          kcal: 2000,
          proteinG: 150,
          fatG: null,
          carbsG: null,
          waterMl: null,
          origin: "manual",
          createdAt: "2026-06-01T00:00:00.000Z",
          deletedAt: null,
        },
      ],
    });
    const lines: string[] = [];
    appendNutritionLines(lines, NOW);
    const out = lines.join("\n");
    expect(out).toContain("[Харчування сьогодні]");
    expect(out).toContain("[Харчування прийоми]");
    expect(out).toContain("[Харчування поденні цілі]");
    expect(out).toContain(`${todayKey}: 2000`);
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

  // priv-06: сервер зрізає health-рядки за міткою з @sergeant/shared; мітка,
  // яку пише клієнт, мусить із нею збігатись.
  it("мітки health-категорій у CATEGORY_META збігаються з переліком у shared", () => {
    for (const cat of HEALTH_MEMORY_CATEGORIES) {
      expect(CATEGORY_META[cat]?.label).toBe(
        HEALTH_MEMORY_CATEGORY_LABELS[cat],
      );
    }
  });

  it.each(HEALTH_MEMORY_CATEGORIES.map((c) => [c]))(
    "категорія %s пишеться рядком із міткою, яку сервер визнає health",
    (category) => {
      writeMemoryEntries([
        { id: "m1", fact: "СЕКРЕТНИЙ-ФАКТ", category, createdAt: 1 },
      ] as never);
      const lines: string[] = [];
      appendAiSignalLines(lines);
      const line = lines.find((l) => l.includes("СЕКРЕТНИЙ-ФАКТ"));
      expect(line).toBeDefined();
      const label = line!.trim().split(":")[0]!;
      expect(isHealthProfileLabel(label)).toBe(true);
    },
  );

  it("ціль про вагу йде окремим рядком із health-міткою, ціль без ваги лишається «Цілі»", () => {
    writeMemoryEntries([
      {
        id: "g1",
        fact: "схуднути до 70 кг",
        category: GOAL_MEMORY_CATEGORY,
        createdAt: 1,
      },
      {
        id: "g2",
        fact: "накопичити на відпустку",
        category: GOAL_MEMORY_CATEGORY,
        createdAt: 2,
      },
    ] as never);
    const lines: string[] = [];
    appendAiSignalLines(lines);
    const weight = lines.find((l) => l.includes("70 кг"))!;
    const plain = lines.find((l) => l.includes("відпустку"))!;
    expect(isHealthProfileLabel(weight.trim().split(":")[0]!)).toBe(true);
    expect(weight).not.toContain("відпустку");
    expect(plain.trim().startsWith("Цілі:")).toBe(true);
    expect(isHealthProfileLabel(plain.trim().split(":")[0]!)).toBe(false);
  });
});
