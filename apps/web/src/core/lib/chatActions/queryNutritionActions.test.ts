// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleQueryNutritionAction } from "./queryNutritionActions";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../../modules/nutrition/lib/sqliteReader";
import type { ChatAction } from "./types";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  clearNutritionSqliteCache();
  vi.useRealTimers();
});

function call(action: ChatAction): string {
  const out = handleQueryNutritionAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

function meal(name: string, kcal: number, protein = 0, fat = 0, carbs = 0) {
  return {
    id: `m_${name}`,
    name,
    macros: { kcal, protein_g: protein, fat_g: fat, carbs_g: carbs },
    addedAt: "2026-04-22T08:00:00.000Z",
  };
}

/** Seed the canonical nutrition SQLite warm cache (readLog reads it). */
function seedLog(byDay: Record<string, ReturnType<typeof meal>[]>): void {
  const log: Record<string, { meals: ReturnType<typeof meal>[] }> = {};
  for (const [day, meals] of Object.entries(byDay)) {
    log[day] = { meals };
  }
  __setNutritionSqliteCacheForTests({
    log,
  } as unknown as Parameters<typeof __setNutritionSqliteCacheForTests>[0]);
}

// ---------------------------------------------------------------------------
// query_nutrition
// ---------------------------------------------------------------------------
describe("query_nutrition", () => {
  it("happy: lists meals in the default 7-day window with totals", () => {
    seedLog({
      "2026-04-22": [meal("Вівсянка", 350, 12), meal("Курка з рисом", 600, 45)],
      "2026-04-20": [meal("Салат", 200, 5)],
      // outside default 7-day window from 2026-04-22 (cutoff 2026-04-16):
      "2026-04-10": [meal("Старе", 999)],
    });
    const out = call({ name: "query_nutrition", input: {} });
    expect(out).toContain("Прийомів за");
    expect(out).toContain("3"); // 3 meals in window
    expect(out).toContain("1150"); // 350+600+200
    expect(out).not.toContain("Старе");
  });

  it("happy: filters by product name", () => {
    seedLog({
      "2026-04-22": [meal("Курка з рисом", 600), meal("Вівсянка", 350)],
      "2026-04-21": [meal("Курка гриль", 400)],
    });
    const out = call({
      name: "query_nutrition",
      input: { query: "курка" },
    });
    expect(out).toContain("Курка з рисом");
    expect(out).toContain("Курка гриль");
    expect(out).not.toContain("Вівсянка");
  });

  it("happy: explicit date range", () => {
    seedLog({
      "2026-03-15": [meal("Березень", 500)],
      "2026-04-22": [meal("Квітень", 600)],
    });
    const out = call({
      name: "query_nutrition",
      input: { date_from: "2026-03-01", date_to: "2026-03-31" },
    });
    expect(out).toContain("Березень");
    expect(out).not.toContain("Квітень");
  });

  it("error: no meals in window", () => {
    seedLog({ "2026-01-01": [meal("Старе", 500)] });
    const out = call({ name: "query_nutrition", input: { period_days: 7 } });
    expect(out).toContain("не знайдено");
  });

  it("shape: result is a non-empty string", () => {
    seedLog({ "2026-04-22": [meal("Вівсянка", 350)] });
    const out = call({
      name: "query_nutrition",
      input: { period_days: 365 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// nutrition_averages
// ---------------------------------------------------------------------------
describe("nutrition_averages", () => {
  it("happy: averages kcal/macros over days with records", () => {
    seedLog({
      "2026-04-22": [meal("День1", 2000, 100, 60, 200)],
      "2026-04-21": [meal("День2", 1000, 50, 30, 100)],
    });
    const out = call({
      name: "nutrition_averages",
      input: { period_days: 7 },
    });
    expect(out).toContain("Середнє харчування");
    expect(out).toContain("1500 ккал/день"); // (2000+1000)/2
    expect(out).toMatch(/Тренд калорій/);
  });

  it("happy: ignores empty days in the average", () => {
    seedLog({
      "2026-04-22": [meal("День1", 2000)],
      // a logged-but-zero-kcal day should not drag the average down
      "2026-04-21": [meal("Вода", 0)],
    });
    const out = call({
      name: "nutrition_averages",
      input: { period_days: 7 },
    });
    expect(out).toContain("2000 ккал/день");
    expect(out).toContain("1 день");
  });

  it("error: no records in window", () => {
    seedLog({ "2026-01-01": [meal("Старе", 500)] });
    const out = call({
      name: "nutrition_averages",
      input: { period_days: 7 },
    });
    expect(out).toContain("Немає записів");
  });

  it("shape: result is a non-empty string", () => {
    seedLog({ "2026-04-22": [meal("День1", 1800)] });
    const out = call({
      name: "nutrition_averages",
      input: { period_days: 30 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------
describe("handleQueryNutritionAction router", () => {
  it("returns undefined for non-nutrition-query actions", () => {
    const out = handleQueryNutritionAction({
      name: "query_transactions",
      input: { query: "АТБ" },
    } as ChatAction);
    expect(out).toBeUndefined();
  });
});
