// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateInsights } from "./insightsEngine";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../modules/fizruk/lib/sqliteReader";
import type { Workout } from "@sergeant/fizruk-domain/domain";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) =>
      store.has(String(k)) ? (store.get(String(k)) ?? null) : null,
    setItem: (k: string, v: string) => void store.set(String(k), String(v)),
    removeItem: (k: string) => void store.delete(String(k)),
    clear: () => void store.clear(),
  };
}

// Canonical fizruk workouts now live in the SQLite warm cache (the
// `fizruk_workouts_v1` LS key is tombstoned), so seed the cache directly.
function seedFizruk(workouts: unknown[]) {
  __setFizrukSqliteCacheForTests({
    workouts: workouts as unknown as Workout[],
  });
}

function clearAll() {
  localStorage.clear();
  clearFizrukSqliteCache();
}

/** Генерує N завершених тренувань розподілених по днях тижня */
function makeWorkouts(count: number, dayOfWeek = 1) {
  const workouts: Array<{
    id: string;
    startedAt: string;
    endedAt: string;
    items: unknown[];
  }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date("2025-01-06"); // Понеділок
    d.setDate(d.getDate() + i * 7 + dayOfWeek);
    const end = new Date(d.getTime() + 3600_000);
    workouts.push({
      id: `w${i}`,
      startedAt: d.toISOString(),
      endedAt: end.toISOString(),
      items: [],
    });
  }
  return workouts;
}

describe("generateInsights", () => {
  beforeEach(() => {
    globalThis.localStorage = createLocalStorageMock() as Storage;
    clearAll();
  });
  afterEach(clearAll);

  it("повертає масив при порожньому localStorage", () => {
    const result = generateInsights();
    expect(Array.isArray(result)).toBe(true);
  });

  it("повертає не більше 4 інсайтів", () => {
    // Заповнюємо достатньо даних для всіх інсайтів
    seedFizruk(makeWorkouts(25, 1));
    const result = generateInsights();
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it("кожен інсайт має обовʼязкові поля", () => {
    const result = generateInsights();
    for (const ins of result) {
      expect(ins).toHaveProperty("id");
      expect(ins).toHaveProperty("iconName");
      expect(ins).toHaveProperty("title");
      expect(ins).toHaveProperty("stat");
      expect(ins).toHaveProperty("detail");
    }
  });

  it("workoutDayInsight: не генерується при < 20 тренуваннях", () => {
    seedFizruk(makeWorkouts(15, 1));
    const result = generateInsights();
    expect(result.find((r) => r.id === "best_workout_day")).toBeUndefined();
  });

  it("workoutDayInsight: генерується при ≥ 20 тренуваннях та домінантному дні", () => {
    // 22 тренування в понеділок
    seedFizruk(makeWorkouts(22, 1));
    const result = generateInsights();
    const ins = result.find((r) => r.id === "best_workout_day");
    expect(ins).toBeDefined();
    expect(ins!.iconName).toBe("calendar");
    expect(typeof ins!.stat).toBe("string");
  });

  it("workoutDayInsight: бакетує день за київським часом, не UTC", () => {
    // 22:30 UTC у неділю 2025-06-22 = 01:30 понеділка в Києві (літо, UTC+3).
    // На UTC-хості (CI) старий getDay() дав би «Неділя» — Kyiv-anchoring
    // має стабільно давати «Понеділок» незалежно від часового поясу раннера.
    const DAY = 86_400_000;
    const base = Date.UTC(2025, 5, 22, 22, 30); // нд 22:30 UTC
    const workouts = Array.from({ length: 22 }, (_, i) => {
      const start = base + i * 7 * DAY;
      return {
        id: `kw${i}`,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(start + 3_600_000).toISOString(),
        items: [],
      };
    });
    seedFizruk(workouts);
    const result = generateInsights();
    const ins = result.find((r) => r.id === "best_workout_day");
    expect(ins).toBeDefined();
    expect(ins!.stat).toBe("Понеділок");
  });

  it("не дублює id інсайтів", () => {
    seedFizruk(makeWorkouts(25, 1));
    const result = generateInsights();
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
