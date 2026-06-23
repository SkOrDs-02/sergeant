// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setGoal, convertUnits } from "./goalAndUtility";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../../../modules/nutrition/lib/sqliteReader";

beforeEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  // Warm the nutrition cache so persistNutritionPrefs has a prev state to peek.
  __setNutritionSqliteCacheForTests({});
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});
afterEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  vi.useRealTimers();
});

describe("setGoal", () => {
  it("requires a description", () => {
    expect(setGoal({ name: "set_goal", input: { description: "   " } })).toBe(
      "Потрібен опис цілі.",
    );
  });

  it("creates a minimal goal and persists to LS", () => {
    const out = setGoal({
      name: "set_goal",
      input: { description: "Схуднути" },
    });
    expect(out).toContain('Ціль "Схуднути" створено');
    expect(out).toContain("id:goal_");
    const stored = JSON.parse(localStorage.getItem("hub_goals_v1") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].description).toBe("Схуднути");
  });

  it("captures all optional fields", () => {
    const out = setGoal({
      name: "set_goal",
      input: {
        description: "Набір маси",
        target_weight_kg: 85,
        target_date: "2026-12-31",
        daily_kcal: 3000,
        workouts_per_week: 4,
      },
    });
    expect(out).toContain("цільова вага: 85 кг");
    expect(out).toContain("дедлайн: 2026-12-31");
    expect(out).toContain("калорії: 3000 ккал/день");
    expect(out).toContain("тренувань/тиждень: 4");
    const stored = JSON.parse(localStorage.getItem("hub_goals_v1") || "[]");
    expect(stored[0]).toMatchObject({
      targetWeightKg: 85,
      targetDate: "2026-12-31",
      dailyKcal: 3000,
      workoutsPerWeek: 4,
    });
  });

  it("ignores invalid optional values", () => {
    const out = setGoal({
      name: "set_goal",
      input: {
        description: "Ціль",
        target_weight_kg: -5,
        target_date: "not-a-date",
        daily_kcal: 0,
        workouts_per_week: "abc",
      },
    });
    expect(out).not.toContain("цільова вага");
    expect(out).not.toContain("дедлайн");
    expect(out).not.toContain("калорії");
    expect(out).not.toContain("тренувань/тиждень");
  });

  it("appends to existing goals", () => {
    setGoal({ name: "set_goal", input: { description: "Перша" } });
    setGoal({ name: "set_goal", input: { description: "Друга" } });
    const stored = JSON.parse(localStorage.getItem("hub_goals_v1") || "[]");
    expect(stored).toHaveLength(2);
  });
});

describe("convertUnits", () => {
  it("rejects non-numeric value", () => {
    expect(
      convertUnits({
        name: "convert_units",
        input: { value: "x", from: "kg", to: "lb" },
      }),
    ).toBe("Значення має бути числом.");
  });

  it("converts kg → lb", () => {
    expect(
      convertUnits({
        name: "convert_units",
        input: { value: 10, from: "kg", to: "lb" },
      }),
    ).toBe("10 kg = 22.05 lb");
  });

  it("converts c → f", () => {
    expect(
      convertUnits({
        name: "convert_units",
        input: { value: 100, from: "C", to: "F" },
      }),
    ).toBe("100 c = 212 f");
  });

  it("converts km → mi and g → oz", () => {
    expect(
      convertUnits({
        name: "convert_units",
        input: { value: 5, from: "km", to: "mi" },
      }),
    ).toContain("mi");
    expect(
      convertUnits({
        name: "convert_units",
        input: { value: 100, from: "g", to: "oz" },
      }),
    ).toContain("oz");
  });

  it("supports every registered conversion pair", () => {
    const pairs: Array<[string, string]> = [
      ["kg", "lb"],
      ["lb", "kg"],
      ["cm", "in"],
      ["in", "cm"],
      ["km", "mi"],
      ["mi", "km"],
      ["c", "f"],
      ["f", "c"],
      ["kcal", "kj"],
      ["kj", "kcal"],
      ["m", "ft"],
      ["ft", "m"],
      ["g", "oz"],
      ["oz", "g"],
    ];
    for (const [from, to] of pairs) {
      const out = convertUnits({
        name: "convert_units",
        input: { value: 10, from, to },
      });
      expect(out).toContain(`${from} = `);
      expect(out).toContain(to);
    }
  });

  it("rejects unknown conversion pairs", () => {
    expect(
      convertUnits({
        name: "convert_units",
        input: { value: 1, from: "kg", to: "km" },
      }),
    ).toContain("Невідома конвертація");
  });
});
