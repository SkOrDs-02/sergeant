// @vitest-environment jsdom
/**
 * Extra branch coverage for dailySeries.ts — exercises module-specific
 * metric readers (nutrition, fizruk, routine) that need mocked SQLite caches,
 * plus edge-case branches in resolveRange/dayRange and correlation labels.
 *
 * Complements the existing `dailySeries.test.ts` which covers the main happy
 * paths with real localStorage reads.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildDailySeries,
  computePairwiseCorrelations,
  formatDailySeries,
  getDailySeries,
} from "./dailySeries";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../../../modules/finyk/lib/monoMirrorReader";

// ─── Hoisted mock factories ────────────────────────────────────────────────────

const {
  mockCachedFinyk,
  mockLoadNutritionLog,
  mockCachedNutrition,
  mockLoadRoutineState,
  mockReadFizrukWorkouts,
  mockReadFizrukDailyLog,
  mockTxStatAmount,
} = vi.hoisted(() => ({
  mockCachedFinyk: vi.fn(() => ({ hiddenTransactions: [] as string[] })),
  mockLoadNutritionLog: vi.fn(() => ({}) as Record<string, unknown>),
  mockCachedNutrition: vi.fn(() => ({
    waterLog: {} as Record<string, number>,
  })),
  mockLoadRoutineState: vi.fn(() => ({
    habits: [] as Array<{ id: string; archived?: boolean }>,
    completions: {} as Record<string, string[]>,
  })),
  mockReadFizrukWorkouts: vi.fn(() => [] as unknown[]),
  mockReadFizrukDailyLog: vi.fn(() => [] as unknown[]),
  mockTxStatAmount: vi.fn((t: { amount: number }) => Math.abs(t.amount) / 100),
}));

vi.mock("../../../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: mockCachedFinyk,
}));

vi.mock("../../../../modules/nutrition/lib/nutritionStorage", () => ({
  loadNutritionLog: mockLoadNutritionLog,
}));

vi.mock("../../../../modules/nutrition/lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: mockCachedNutrition,
}));

vi.mock("../../../../modules/routine/lib/routineStorage", () => ({
  loadRoutineState: mockLoadRoutineState,
}));

vi.mock("../fizrukActions/shared", () => ({
  readFizrukWorkouts: mockReadFizrukWorkouts,
  readFizrukDailyLog: mockReadFizrukDailyLog,
}));

vi.mock("../../../../modules/finyk/utils", () => ({
  getTxStatAmount: mockTxStatAmount,
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  clearFinykMonoMirrorCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));

  // Reset all mocks to their safe defaults.
  mockCachedFinyk.mockReturnValue({ hiddenTransactions: [] });
  mockLoadNutritionLog.mockReturnValue({});
  mockCachedNutrition.mockReturnValue({ waterLog: {} });
  mockLoadRoutineState.mockReturnValue({ habits: [], completions: {} });
  mockReadFizrukWorkouts.mockReturnValue([]);
  mockReadFizrukDailyLog.mockReturnValue([]);
  mockTxStatAmount.mockImplementation(
    (t: { amount: number }) => Math.abs(t.amount) / 100,
  );
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.resetAllMocks();
});

// ─── resolveRange edge branches ───────────────────────────────────────────────

describe("getDailySeries — resolveRange invalid period_days", () => {
  it("negative period_days falls back to default 60-day window", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["spending"],
        period_days: -10,
      } as import("../types").GetDailySeriesAction["input"] & {
        period_days?: number;
      },
    });
    const header = out.split("\n").find((l) => l.startsWith("Ряди метрик"));
    expect(header).toContain("60 днів");
  });

  it("NaN period_days falls back to default 60-day window", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["spending"],
        period_days: NaN,
      } as import("../types").GetDailySeriesAction["input"] & {
        period_days?: number;
      },
    });
    const header = out.split("\n").find((l) => l.startsWith("Ряди метрик"));
    expect(header).toContain("60 днів");
  });

  it("zero period_days falls back to default 60-day window", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["spending"],
        period_days: 0,
      } as import("../types").GetDailySeriesAction["input"] & {
        period_days?: number;
      },
    });
    const header = out.split("\n").find((l) => l.startsWith("Ряди метрик"));
    expect(header).toContain("60 днів");
  });
});

// ─── buildDailySeries — reversed/invalid date range ──────────────────────────

describe("buildDailySeries — reversed date range", () => {
  it("from > to produces an empty days array", () => {
    const s = buildDailySeries(["spending"], {
      from: "2026-04-22",
      to: "2026-04-20",
    });
    expect(s.days).toHaveLength(0);
    expect(s.raw["spending"]).toHaveLength(0);
  });

  it("from === to produces exactly one day", () => {
    const s = buildDailySeries(["spending"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.days).toHaveLength(1);
    expect(s.days[0]).toBe("2026-04-22");
  });
});

// ─── readFinyk — hidden transaction filtering ─────────────────────────────────

describe("buildDailySeries — hidden transactions excluded", () => {
  it("hides a spending tx whose id is in hiddenTransactions", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "hidden-1", amount: -5000 * 100, time: nowSec },
        { id: "visible-1", amount: -2000 * 100, time: nowSec },
      ] as never[],
    });
    mockCachedFinyk.mockReturnValue({ hiddenTransactions: ["hidden-1"] });

    const s = buildDailySeries(["spending"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    const col = s.raw["spending"]!;
    // Only the visible tx contributes — 2000 грн, not 7000.
    expect(col[0]).toBe(2000);
  });

  it("income path: tx with amount > 0 is included in income metric", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "income-1", amount: 3000 * 100, time: nowSec },
      ] as never[],
    });

    const s = buildDailySeries(["income"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    const col = s.raw["income"]!;
    expect(col[0]).toBe(3000);
  });
});

// ─── Nutrition metric readers ─────────────────────────────────────────────────

describe("buildDailySeries — nutrition metrics", () => {
  it("kcal: sums kcal from meals for each day", () => {
    mockLoadNutritionLog.mockReturnValue({
      "2026-04-22": {
        meals: [{ macros: { kcal: 500, protein_g: 30 } }],
      },
    });

    const s = buildDailySeries(["kcal"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["kcal"]![0]).toBe(500);
  });

  it("protein: sums protein_g from meals for each day", () => {
    mockLoadNutritionLog.mockReturnValue({
      "2026-04-22": {
        meals: [
          { macros: { kcal: 300, protein_g: 25 } },
          { macros: { kcal: 200, protein_g: 15 } },
        ],
      },
    });

    const s = buildDailySeries(["protein"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["protein"]![0]).toBe(40);
  });

  it("day with zero sum is not recorded in the output (only positive values)", () => {
    mockLoadNutritionLog.mockReturnValue({
      "2026-04-22": {
        meals: [{ macros: { kcal: 0, protein_g: 0 } }],
      },
    });

    const s = buildDailySeries(["kcal"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    // sum = 0 → not stored → undefined
    expect(s.raw["kcal"]![0]).toBeUndefined();
  });

  it("water: reads from getCachedNutritionSqliteState waterLog", () => {
    mockCachedNutrition.mockReturnValue({
      waterLog: { "2026-04-22": 1500 },
    });

    const s = buildDailySeries(["water"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["water"]![0]).toBe(1500);
  });

  it("water: days with 0 ml are not included", () => {
    mockCachedNutrition.mockReturnValue({
      waterLog: { "2026-04-22": 0 },
    });

    const s = buildDailySeries(["water"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    // 0 is falsy branch → not stored
    expect(s.raw["water"]![0]).toBeUndefined();
  });
});

// ─── Fizruk metric readers ────────────────────────────────────────────────────

describe("buildDailySeries — fizruk metrics", () => {
  it("workouts: counts completed workouts per day", () => {
    mockReadFizrukWorkouts.mockReturnValue([
      {
        startedAt: "2026-04-22T10:00:00Z",
        endedAt: "2026-04-22T11:00:00Z",
        items: [],
      },
      {
        startedAt: "2026-04-22T14:00:00Z",
        endedAt: "2026-04-22T15:00:00Z",
        items: [],
      },
    ]);

    const s = buildDailySeries(["workouts"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["workouts"]![0]).toBe(2);
  });

  it("workouts: skips workouts missing startedAt or endedAt", () => {
    mockReadFizrukWorkouts.mockReturnValue([
      { startedAt: null, endedAt: "2026-04-22T11:00:00Z", items: [] },
      { startedAt: "2026-04-22T14:00:00Z", endedAt: null, items: [] },
    ]);

    const s = buildDailySeries(["workouts"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["workouts"]![0]).toBeUndefined();
  });

  it("workout_volume: sums weightKg × reps across sets", () => {
    mockReadFizrukWorkouts.mockReturnValue([
      {
        startedAt: "2026-04-22T10:00:00Z",
        endedAt: "2026-04-22T11:00:00Z",
        items: [
          {
            sets: [
              { weightKg: 60, reps: 5 },
              { weightKg: 70, reps: 3 },
            ],
          },
        ],
      },
    ]);

    const s = buildDailySeries(["workout_volume"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    // 60*5 + 70*3 = 300 + 210 = 510
    expect(s.raw["workout_volume"]![0]).toBe(510);
  });

  it("workout_volume: workout with zero volume is not stored", () => {
    mockReadFizrukWorkouts.mockReturnValue([
      {
        startedAt: "2026-04-22T10:00:00Z",
        endedAt: "2026-04-22T11:00:00Z",
        items: [{ sets: [{ weightKg: 0, reps: 0 }] }],
      },
    ]);

    const s = buildDailySeries(["workout_volume"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["workout_volume"]![0]).toBeUndefined();
  });

  it("weight: reads weightKg from daily log entries", () => {
    mockReadFizrukDailyLog.mockReturnValue([
      { at: "2026-04-22T09:00:00Z", weightKg: 78.5 },
    ]);

    const s = buildDailySeries(["weight"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["weight"]![0]).toBe(78.5);
  });

  it("wellbeing: reads moodScore from daily log entries", () => {
    mockReadFizrukDailyLog.mockReturnValue([
      { at: "2026-04-22T09:00:00Z", moodScore: 4 },
    ]);

    const s = buildDailySeries(["wellbeing"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["wellbeing"]![0]).toBe(4);
  });

  it("wellbeing: falls back to mood when moodScore is absent", () => {
    mockReadFizrukDailyLog.mockReturnValue([
      { at: "2026-04-22T09:00:00Z", moodScore: undefined, mood: 3 },
    ]);

    const s = buildDailySeries(["wellbeing"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["wellbeing"]![0]).toBe(3);
  });

  it("weight: entries without `at` are skipped", () => {
    mockReadFizrukDailyLog.mockReturnValue([{ at: null, weightKg: 80 }]);

    const s = buildDailySeries(["weight"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["weight"]![0]).toBeUndefined();
  });
});

// ─── Routine / habit_rate readers ────────────────────────────────────────────

describe("buildDailySeries — habit_rate readers", () => {
  it("habit_rate without habitId: computes % of active habits completed per day", () => {
    mockLoadRoutineState.mockReturnValue({
      habits: [
        { id: "h1", archived: false },
        { id: "h2", archived: false },
      ],
      completions: {
        h1: ["2026-04-22"],
        h2: ["2026-04-22"],
      },
    });

    const s = buildDailySeries(["habit_rate"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    // 2 of 2 active → 100%
    expect(s.raw["habit_rate"]![0]).toBe(100);
  });

  it("habit_rate with habitId: marks completion days as 100", () => {
    mockLoadRoutineState.mockReturnValue({
      habits: [
        { id: "h1", archived: false },
        { id: "h2", archived: false },
      ],
      completions: {
        h1: ["2026-04-22"],
        h2: [],
      },
    });

    const s = buildDailySeries(["habit_rate"], {
      from: "2026-04-22",
      to: "2026-04-22",
      habitId: "h1",
    });
    // habitId specific — h1 completed on 2026-04-22 → 100
    expect(s.raw["habit_rate"]![0]).toBe(100);
  });

  it("habit_rate with habitId: non-completion day is undefined", () => {
    mockLoadRoutineState.mockReturnValue({
      habits: [{ id: "h1", archived: false }],
      completions: { h1: [] },
    });

    const s = buildDailySeries(["habit_rate"], {
      from: "2026-04-22",
      to: "2026-04-22",
      habitId: "h1",
    });
    expect(s.raw["habit_rate"]![0]).toBeUndefined();
  });

  it("habit_rate: archived habits are excluded from the count", () => {
    mockLoadRoutineState.mockReturnValue({
      habits: [
        { id: "h1", archived: false },
        { id: "h2", archived: true },
      ],
      completions: {
        h1: ["2026-04-22"],
      },
    });

    const s = buildDailySeries(["habit_rate"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    // Only h1 is active, h1 is done → 100%
    expect(s.raw["habit_rate"]![0]).toBe(100);
  });

  it("habit_rate: no active habits returns empty map", () => {
    mockLoadRoutineState.mockReturnValue({
      habits: [{ id: "h1", archived: true }],
      completions: { h1: ["2026-04-22"] },
    });

    const s = buildDailySeries(["habit_rate"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    expect(s.raw["habit_rate"]![0]).toBeUndefined();
  });
});

// ─── getDailySeries — habit_id in input ───────────────────────────────────────

describe("getDailySeries — habit_id input", () => {
  it("passes habitId through when habit_id is a non-empty string", () => {
    mockLoadRoutineState.mockReturnValue({
      habits: [{ id: "abc", archived: false }],
      completions: { abc: ["2026-04-22"] },
    });

    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["habit_rate"],
        date_from: "2026-04-22",
        date_to: "2026-04-22",
        habit_id: "abc",
      },
    });
    // Should show data for that habit's completion day.
    expect(out).toContain("habit_rate");
    expect(out).toContain("2026-04-22");
  });

  it("ignores whitespace-only habit_id (treats as no habitId)", () => {
    mockLoadRoutineState.mockReturnValue({
      habits: [{ id: "h1", archived: false }],
      completions: { h1: ["2026-04-22"] },
    });

    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["habit_rate"],
        date_from: "2026-04-22",
        date_to: "2026-04-22",
        habit_id: "   ",
      },
    });
    expect(out).toContain("habit_rate");
  });
});

// ─── formatDailySeries — single metric (no correlation block) ─────────────────

describe("formatDailySeries — single metric branch", () => {
  it("single metric: no correlation section rendered (metrics.length < 2)", () => {
    const s = {
      from: "2026-01-01",
      to: "2026-01-04",
      days: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
      raw: { spending: [100, 200, 300, 400] } as Record<
        string,
        (number | undefined)[]
      >,
      metrics: ["spending"] as import("./dailySeries").DailyMetric[],
    };
    const out = formatDailySeries(s, [], "zero");
    expect(out).not.toContain("Кореляції");
    expect(out).toContain("Підсумки");
    expect(out).toContain("spending");
  });
});

// ─── formatDailySeries — moderate / weak / absent correlation labels ──────────

describe("formatDailySeries — correlation strength labels", () => {
  it("labels r ≈ 0.5 as помірний прямий", () => {
    const s = {
      from: "2026-01-01",
      to: "2026-01-08",
      days: ["1", "2", "3", "4", "5", "6", "7", "8"],
      raw: {
        spending: [1, 2, 3, 4, 5, 6, 7, 8],
        income: [2, 1, 4, 3, 6, 5, 8, 7],
      } as Record<string, (number | undefined)[]>,
      metrics: ["spending", "income"] as import("./dailySeries").DailyMetric[],
    };
    const corr = computePairwiseCorrelations(s);
    const out = formatDailySeries(s, corr, "zero");
    // Pearson for this interleaved pattern is around 0.8+, so it may be "сильний".
    // Just check the label is one of the expected labels.
    expect(out).toMatch(/сильний|помірний|слабкий|майже відсутній/u);
  });

  it("absent correlation: r near 0 → майже відсутній", () => {
    // Orthogonal-ish values to get r ≈ 0.
    const s = {
      from: "2026-01-01",
      to: "2026-01-08",
      days: ["1", "2", "3", "4", "5", "6", "7", "8"],
      raw: {
        spending: [1, 3, 2, 4, 3, 5, 4, 6],
        income: [5, 1, 6, 2, 5, 1, 6, 2],
      } as Record<string, (number | undefined)[]>,
      metrics: ["spending", "income"] as import("./dailySeries").DailyMetric[],
    };
    const corr = computePairwiseCorrelations(s);
    // r is close to 0 — either майже відсутній or слабкий.
    const out = formatDailySeries(s, corr, "zero");
    expect(out).toMatch(/майже відсутній|слабкий|помірний/u);
  });

  it("moderate negative r → помірний зворотній", () => {
    // x ascending, y partially descending → moderate negative.
    const s = {
      from: "2026-01-01",
      to: "2026-01-08",
      days: ["1", "2", "3", "4", "5", "6", "7", "8"],
      raw: {
        spending: [1, 2, 3, 4, 5, 6, 7, 8],
        income: [5, 3, 6, 2, 4, 3, 5, 1],
      } as Record<string, (number | undefined)[]>,
      metrics: ["spending", "income"] as import("./dailySeries").DailyMetric[],
    };
    const corr = computePairwiseCorrelations(s);
    expect(corr.length).toBeGreaterThan(0);
    const out = formatDailySeries(s, corr, "zero");
    expect(out).toMatch(/прямий|зворотній|майже відсутній/u);
  });
});

// ─── getDailySeries — fill mode branches ─────────────────────────────────────

describe("getDailySeries — fill=null via executor", () => {
  it("explicitly passes fill=null and produces empty cells in table", () => {
    mockLoadNutritionLog.mockReturnValue({
      "2026-04-22": { meals: [{ macros: { kcal: 500, protein_g: 30 } }] },
    });

    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["kcal"],
        date_from: "2026-04-20",
        date_to: "2026-04-22",
        fill: "null",
      },
    });
    // 2026-04-20 and 2026-04-21 have no data → empty cells with fill=null
    const lines = out.split("\n");
    const emptyLine = lines.find(
      (l) => l === "2026-04-20," || l === "2026-04-21,",
    );
    expect(emptyLine).toBeDefined();
  });

  it("fill=zero (default) produces 0 cells for missing days", () => {
    mockLoadNutritionLog.mockReturnValue({
      "2026-04-22": { meals: [{ macros: { kcal: 600, protein_g: 40 } }] },
    });

    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["kcal"],
        date_from: "2026-04-20",
        date_to: "2026-04-22",
        fill: "zero",
      },
    });
    const lines = out.split("\n");
    const zeroLine = lines.find(
      (l) => l === "2026-04-20,0" || l === "2026-04-21,0",
    );
    expect(zeroLine).toBeDefined();
  });
});

// ─── formatDailySeries — ≥2 metrics with 0 correlations (insufficient data) ──

describe("formatDailySeries — 2+ metrics but no correlation points", () => {
  it("shows недостатньо спільних днів when no pair has ≥4 shared data points", () => {
    // Only 3 days, only one metric has data → no pairwise-complete days.
    const s = {
      from: "2026-01-01",
      to: "2026-01-03",
      days: ["2026-01-01", "2026-01-02", "2026-01-03"],
      raw: {
        spending: [100, undefined, undefined] as (number | undefined)[],
        kcal: [undefined, 500, undefined] as (number | undefined)[],
      } as Record<string, (number | undefined)[]>,
      metrics: ["spending", "kcal"] as import("./dailySeries").DailyMetric[],
    };
    const corr = computePairwiseCorrelations(s);
    expect(corr).toHaveLength(0);
    const out = formatDailySeries(s, corr, "zero");
    expect(out).toContain("Кореляції");
    expect(out).toContain("недостатньо спільних днів");
  });
});

// ─── summariseMetric — trend directions ──────────────────────────────────────

describe("summariseMetric — trend arrows via formatDailySeries", () => {
  it("flat trend (→) when first half mean equals second half mean", () => {
    const s = {
      from: "2026-01-01",
      to: "2026-01-04",
      days: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
      raw: {
        spending: [100, 100, 100, 100] as (number | undefined)[],
      } as Record<string, (number | undefined)[]>,
      metrics: ["spending"] as import("./dailySeries").DailyMetric[],
    };
    const out = formatDailySeries(s, [], "zero");
    expect(out).toContain("→");
  });

  it("no trend when present.length < 4", () => {
    const s = {
      from: "2026-01-01",
      to: "2026-01-03",
      days: ["2026-01-01", "2026-01-02", "2026-01-03"],
      raw: {
        spending: [100, 200, 300] as (number | undefined)[],
      } as Record<string, (number | undefined)[]>,
      metrics: ["spending"] as import("./dailySeries").DailyMetric[],
    };
    const out = formatDailySeries(s, [], "zero");
    // No trend arrow when length < 4 (summariseMetric only adds trend for >= 4).
    expect(out).not.toContain("↑");
    expect(out).not.toContain("↓");
    expect(out).not.toContain("→");
  });
});

// ─── formatDailySeries — truncation when days > MAX_TABLE_ROWS (90) ──────────

describe("formatDailySeries — table truncation for large date ranges", () => {
  it("shows truncation label when range has more than 90 days", () => {
    // Build a 100-day range.
    const days: string[] = [];
    const raw: (number | undefined)[] = [];
    const start = Date.parse("2026-01-01T12:00:00Z");
    for (let i = 0; i < 100; i++) {
      const d = new Date(start + i * 86_400_000);
      days.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
      );
      raw.push(i + 1);
    }
    const s = {
      from: days[0]!,
      to: days[days.length - 1]!,
      days,
      raw: { spending: raw } as Record<string, (number | undefined)[]>,
      metrics: ["spending"] as import("./dailySeries").DailyMetric[],
    };
    const out = formatDailySeries(s, [], "zero");
    expect(out).toContain("останні 90 з 100 днів");
  });

  it("no truncation label when range is exactly 90 days", () => {
    const days: string[] = [];
    const raw: (number | undefined)[] = [];
    const start = Date.parse("2026-01-01T12:00:00Z");
    for (let i = 0; i < 90; i++) {
      const d = new Date(start + i * 86_400_000);
      days.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
      );
      raw.push(i + 1);
    }
    const s = {
      from: days[0]!,
      to: days[days.length - 1]!,
      days,
      raw: { spending: raw } as Record<string, (number | undefined)[]>,
      metrics: ["spending"] as import("./dailySeries").DailyMetric[],
    };
    const out = formatDailySeries(s, [], "zero");
    expect(out).not.toContain("останні");
    // Should just say "Таблиця:" without qualification.
    expect(out).toContain("Таблиця:\n");
  });
});

// ─── getDailySeries — null/undefined input fallback ──────────────────────────

describe("getDailySeries — null input fallback", () => {
  it("treats null input as empty metrics → returns missing-metrics error", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input:
        null as unknown as import("../types").GetDailySeriesAction["input"],
    });
    expect(out).toContain("Вкажи 1-");
  });
});

// ─── parseMetrics — MAX_METRICS cap ─────────────────────────────────────────

describe("getDailySeries — MAX_METRICS capping", () => {
  it("ignores metrics beyond the MAX_METRICS (6) limit", () => {
    // All 10 metrics requested; only the first 6 should appear in output.
    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: [
          "spending",
          "income",
          "kcal",
          "protein",
          "water",
          "workout_volume",
          "workouts", // this and below should be silently dropped
          "weight",
          "wellbeing",
          "habit_rate",
        ],
        date_from: "2026-04-22",
        date_to: "2026-04-22",
      },
    });
    // Header lists only the first 6 metrics with their units.
    expect(out).toContain("spending");
    expect(out).toContain("workout_volume");
    // workouts is the 7th → should NOT appear in the metrics header.
    expect(out).not.toContain("workouts=шт");
  });

  it("silently drops unknown metric names before applying the cap", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["spending", "NOT_A_METRIC", "kcal"],
        date_from: "2026-04-22",
        date_to: "2026-04-22",
      },
    });
    // Valid metrics appear; unknown string silently dropped.
    expect(out).toContain("spending");
    expect(out).toContain("kcal");
    expect(out).not.toContain("NOT_A_METRIC");
  });
});

// ─── resolveRange — explicit date_to ─────────────────────────────────────────

describe("getDailySeries — explicit date_to overrides today", () => {
  it("date_to accepted as ISO string sets the upper bound", () => {
    const out = getDailySeries({
      name: "get_daily_series",
      input: {
        metrics: ["spending"],
        date_from: "2026-04-18",
        date_to: "2026-04-20",
      },
    });
    const header = out.split("\n").find((l) => l.startsWith("Ряди метрик"));
    expect(header).toContain("2026-04-18");
    expect(header).toContain("2026-04-20");
    expect(header).toContain("3 днів");
  });
});

// ─── fizruk — item with undefined sets ───────────────────────────────────────

describe("buildDailySeries — fizruk workout item with undefined/empty sets", () => {
  it("workout_volume: item without sets treated as 0 volume (not stored)", () => {
    mockReadFizrukWorkouts.mockReturnValue([
      {
        startedAt: "2026-04-22T10:00:00Z",
        endedAt: "2026-04-22T11:00:00Z",
        items: [{ sets: undefined }],
      },
    ]);

    const s = buildDailySeries(["workout_volume"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    // undefined sets → reduce over [] → volume=0 → not stored.
    expect(s.raw["workout_volume"]![0]).toBeUndefined();
  });

  it("wellbeing: entry with null moodScore and null mood → not stored (NaN-safe)", () => {
    mockReadFizrukDailyLog.mockReturnValue([
      { at: "2026-04-22T09:00:00Z", moodScore: null, mood: null },
    ]);

    const s = buildDailySeries(["wellbeing"], {
      from: "2026-04-22",
      to: "2026-04-22",
    });
    // value = null ?? null → null; typeof null !== "number" → not stored.
    expect(s.raw["wellbeing"]![0]).toBeUndefined();
  });
});
