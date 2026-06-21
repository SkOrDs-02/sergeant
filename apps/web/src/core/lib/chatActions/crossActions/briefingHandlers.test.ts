/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "@fizruk/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "@nutrition/lib/sqliteReader";
import { morningBriefing, weeklySummary } from "./briefingHandlers";

// `fizruk_workouts_v1` / `nutrition_log_v1` are tombstoned — these handlers now
// read the canonical SQLite warm-caches (ADR-0067 residual). Seed those caches
// directly and assert the briefings reflect the seeded data (proving they no
// longer read the drained LS keys).

function todayKey(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function seedFizruk(workouts: unknown[]): void {
  __setFizrukSqliteCacheForTests({ workouts } as unknown as Parameters<
    typeof __setFizrukSqliteCacheForTests
  >[0]);
}

function seedNutrition(log: unknown): void {
  __setNutritionSqliteCacheForTests({ log } as unknown as Parameters<
    typeof __setNutritionSqliteCacheForTests
  >[0]);
}

beforeEach(() => {
  localStorage.clear();
  clearFizrukSqliteCache();
  clearNutritionSqliteCache();
});

describe("briefingHandlers — canonical SQLite reads (ADR-0067 residual)", () => {
  it("morningBriefing counts today's planned workout from the SQLite cache", () => {
    const dk = todayKey();
    seedFizruk([
      {
        id: "w1",
        startedAt: `${dk}T08:00:00.000Z`,
        endedAt: null,
        planned: true,
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      },
    ]);
    expect(morningBriefing()).toContain("Заплановано тренувань: 1");
  });

  it("morningBriefing sums today's kcal from the canonical nutrition log", () => {
    const dk = todayKey();
    seedNutrition({
      [dk]: { meals: [{ id: "m1", name: "Сніданок", macros: { kcal: 450 } }] },
    });
    expect(morningBriefing()).toContain("Калорії: 450 ккал");
  });

  it("weeklySummary counts completed workouts + volume from the SQLite cache", () => {
    const dk = todayKey();
    seedFizruk([
      {
        id: "w2",
        startedAt: `${dk}T07:00:00.000Z`,
        endedAt: `${dk}T08:00:00.000Z`,
        planned: false,
        items: [{ nameUk: "Жим", sets: [{ weightKg: 50, reps: 10 }] }],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      },
    ]);
    const out = weeklySummary();
    expect(out).toContain("Тренувань: 1");
    expect(out).toContain("Об'єм: 500 кг×повт");
  });
});
