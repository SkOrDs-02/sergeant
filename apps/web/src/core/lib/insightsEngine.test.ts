// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateInsights } from "./insightsEngine";

function createLocalStorageMock() {
  /** @type {Map<string, string>} */
  const store = new Map();
  return {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => void store.set(String(k), String(v)),
    removeItem: (k) => void store.delete(String(k)),
    clear: () => void store.clear(),
  };
}

function setLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clearAll() {
  localStorage.clear();
}

/** Генерує N завершених тренувань розподілених по днях тижня */
function makeWorkouts(count, dayOfWeek = 1) {
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
    setLS("fizruk_workouts_v1", {
      schemaVersion: 1,
      workouts: makeWorkouts(25, 1),
    });
    const result = generateInsights();
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it("кожен інсайт має обовʼязкові поля", () => {
    const result = generateInsights();
    for (const ins of result) {
      expect(ins).toHaveProperty("id");
      expect(ins).toHaveProperty("emoji");
      expect(ins).toHaveProperty("title");
      expect(ins).toHaveProperty("stat");
      expect(ins).toHaveProperty("detail");
    }
  });

  it("workoutDayInsight: не генерується при < 20 тренуваннях", () => {
    setLS("fizruk_workouts_v1", {
      schemaVersion: 1,
      workouts: makeWorkouts(15, 1),
    });
    const result = generateInsights();
    expect(result.find((r) => r.id === "best_workout_day")).toBeUndefined();
  });

  it("workoutDayInsight: генерується при ≥ 20 тренуваннях та домінантному дні", () => {
    // 22 тренування в понеділок
    const workouts = makeWorkouts(22, 1);
    setLS("fizruk_workouts_v1", { schemaVersion: 1, workouts });
    const result = generateInsights();
    const ins = result.find((r) => r.id === "best_workout_day");
    expect(ins).toBeDefined();
    expect(ins!.emoji).toBe("📅");
    expect(typeof ins!.stat).toBe("string");
  });

  it("не дублює id інсайтів", () => {
    setLS("fizruk_workouts_v1", {
      schemaVersion: 1,
      workouts: makeWorkouts(25, 1),
    });
    const result = generateInsights();
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
