// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import { generateInsights } from "./insightsEngine";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../modules/fizruk/lib/sqliteReader";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../modules/routine/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../modules/nutrition/lib/sqliteReader";
import type { Workout } from "@sergeant/fizruk-domain/domain";

const DAY = 86_400_000;

function clearAll() {
  localStorage.clear();
  clearFizrukSqliteCache();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  clearNutritionSqliteCache();
}

function seedFizruk(workouts: unknown[]) {
  __setFizrukSqliteCacheForTests({
    workouts: workouts as unknown as Workout[],
  });
}

/** ISO day key (UTC) for `daysAgo` days before now. */
function dayKey(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
}

/** Build N recent workouts spread across the last weeks for week-window insights. */
function recentWorkouts(specs: Array<{ daysAgo: number }>): unknown[] {
  return specs.map((s, i) => {
    const start = Date.now() - s.daysAgo * DAY;
    return {
      id: `rw${i}`,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(start + 3_600_000).toISOString(),
      items: [],
    };
  });
}

describe("generateInsights — cross-module insights", () => {
  beforeEach(() => {
    clearAll();
  });
  afterEach(clearAll);

  // Mid-week anchor: weeksAgo*7 + 3 days lands inside a single Kyiv week
  // regardless of today's day-of-week, so 3 same-week workouts cluster cleanly.
  function weekMidDaysAgo(weeksAgo: number): number {
    return weeksAgo * 7 + 3;
  }

  it("activeWeeksSpendingInsight: produces a spending-correlation insight", () => {
    // Weeks 0 & 1 active (3 workouts each, same midweek day → same week),
    // weeks 2 & 3 rest (0 workouts).
    const specs: Array<{ daysAgo: number }> = [];
    for (const w of [0, 1]) {
      const d = weekMidDaysAgo(w);
      specs.push({ daysAgo: d }, { daysAgo: d }, { daysAgo: d });
    }
    seedFizruk(recentWorkouts(specs));

    const txs: Array<{ id: string; amount: number; time: number }> = [];
    let txId = 0;
    const addTx = (daysAgo: number, amountUah: number) => {
      txs.push({
        id: `tx${txId++}`,
        amount: -amountUah * 100,
        time: Math.floor((Date.now() - daysAgo * DAY) / 1000),
      });
    };
    // active weeks (0,1): spend 100; rest weeks (2,3): spend 1000 → active less.
    addTx(weekMidDaysAgo(0), 100);
    addTx(weekMidDaysAgo(1), 100);
    addTx(weekMidDaysAgo(2), 1000);
    addTx(weekMidDaysAgo(3), 1000);

    localStorage.setItem(STORAGE_KEYS.FINYK_TX_CACHE, JSON.stringify(txs));

    const result = generateInsights();
    const ins = result.find((r) => r.id === "active_weeks_spending");
    expect(ins).toBeDefined();
    expect(ins!.iconName).toBe("lightbulb");
  });

  it("activeWeeksSpendingInsight: reads txs from { txs } cache wrapper shape and hidden/transfer exclusion", () => {
    const specs: Array<{ daysAgo: number }> = [];
    for (const w of [0, 1]) {
      const d = weekMidDaysAgo(w);
      specs.push({ daysAgo: d }, { daysAgo: d }, { daysAgo: d });
    }
    seedFizruk(recentWorkouts(specs));

    const inner: Array<{ id: string; amount: number; time: number }> = [];
    let txId = 0;
    const addTx = (daysAgo: number, amountUah: number) => {
      inner.push({
        id: `tx${txId++}`,
        amount: -amountUah * 100,
        time: Math.floor((Date.now() - daysAgo * DAY) / 1000),
      });
    };
    addTx(weekMidDaysAgo(0), 2000); // active week — high
    addTx(weekMidDaysAgo(1), 2000);
    addTx(weekMidDaysAgo(2), 100); // rest week — low (active spends more → diff < 0 branch)
    addTx(weekMidDaysAgo(3), 100);
    // Hidden + transfer tx should be excluded — give them huge amounts.
    inner.push({
      id: "hidden1",
      amount: -999999,
      time: Math.floor(Date.now() / 1000),
    });
    inner.push({
      id: "transfer1",
      amount: -999999,
      time: Math.floor(Date.now() / 1000),
    });

    localStorage.setItem(
      STORAGE_KEYS.FINYK_TX_CACHE,
      JSON.stringify({ txs: inner }),
    );
    localStorage.setItem(
      STORAGE_KEYS.FINYK_HIDDEN_TXS,
      JSON.stringify(["hidden1"]),
    );
    localStorage.setItem(
      STORAGE_KEYS.FINYK_TX_CATS,
      JSON.stringify({ transfer1: "internal_transfer" }),
    );

    const result = generateInsights();
    const ins = result.find((r) => r.id === "active_weeks_spending");
    expect(ins).toBeDefined();
    // active weeks spend more → "+" stat
    expect(ins!.stat.startsWith("+")).toBe(true);
  });

  it("bestHabitMonthInsight: produces a habit-month insight with enough completions", () => {
    const habits = [
      { id: "h1", name: "Біг", archived: false },
      { id: "h2", name: "Вода", archived: false },
    ];
    __setRoutineSqliteStateCacheForTests({ habits: habits as never });

    // Two months of completions, month A stronger than month B; ≥28 total, ≥4 weeks.
    const completions: { h1: string[]; h2: string[] } = { h1: [], h2: [] };
    // Month 2025-01: 20 days each habit (40 completions)
    for (let d = 1; d <= 20; d++) {
      const dk = `2025-01-${String(d).padStart(2, "0")}`;
      completions.h1.push(dk);
      completions.h2.push(dk);
    }
    // Month 2025-02: fewer
    for (let d = 1; d <= 5; d++) {
      const dk = `2025-02-${String(d).padStart(2, "0")}`;
      completions.h1.push(dk);
    }
    __setRoutineSqliteCompletionsCacheForTests({ completions });

    const result = generateInsights();
    const ins = result.find((r) => r.id === "best_habit_month");
    expect(ins).toBeDefined();
    expect(ins!.iconName).toBe("flame");
    expect(ins!.stat).toContain("%");
  });

  it("workoutKcalInsight: correlates kcal on workout vs rest days", () => {
    // 10 workout days + 10 rest days, all logged with kcal.
    const workoutDays: string[] = [];
    for (let i = 0; i < 10; i++) workoutDays.push(dayKey(i * 2 + 1)); // odd days ago
    seedFizruk(
      workoutDays.map((dk, i) => {
        const start = new Date(dk + "T10:00:00.000Z").getTime();
        return {
          id: `wk${i}`,
          startedAt: new Date(start).toISOString(),
          endedAt: new Date(start + 3_600_000).toISOString(),
          items: [],
        };
      }),
    );

    const log: Record<string, { meals: Array<{ macros: { kcal: number } }> }> =
      {};
    // workout days: 3000 kcal
    for (const dk of workoutDays) {
      log[dk] = { meals: [{ macros: { kcal: 3000 } }] };
    }
    // rest days: 1500 kcal
    for (let i = 0; i < 10; i++) {
      const dk = dayKey(i * 2 + 2); // even days ago — not workout days
      log[dk] = { meals: [{ macros: { kcal: 1500 } }] };
    }
    __setNutritionSqliteCacheForTests({ log: log as never });

    const result = generateInsights();
    const ins = result.find((r) => r.id === "workout_kcal");
    expect(ins).toBeDefined();
    expect(ins!.iconName).toBe("leaf");
    expect(ins!.stat).toContain("ккал");
  });

  it("habitWeeksKcalInsight: correlates habit completion with weekly kcal", () => {
    const habits = [{ id: "h1", name: "Біг", archived: false }];
    __setRoutineSqliteStateCacheForTests({ habits: habits as never });

    const completions: { h1: string[] } = { h1: [] };
    const log: Record<string, { meals: Array<{ macros: { kcal: number } }> }> =
      {};

    // Span ~6 recent weeks of calendar days so the engine's Kyiv week buckets
    // are fully populated. Days in the most-recent ~18 days are completed
    // (high-habit weeks); older weeks get sparse completions so they stay below
    // 70% but are not discarded by the engine's `habitDone === 0` sufficiency
    // guard. kcal is higher on high-habit days so the correlation is non-trivial.
    for (let daysAgo = 0; daysAgo < 42; daysAgo++) {
      const dk = dayKey(daysAgo);
      const high = daysAgo < 18;
      if (high) {
        completions.h1.push(dk);
        log[dk] = { meals: [{ macros: { kcal: 2800 } }] };
      } else {
        if (daysAgo % 7 === 0) {
          completions.h1.push(dk);
        }
        log[dk] = { meals: [{ macros: { kcal: 2000 } }] };
      }
    }
    __setRoutineSqliteCompletionsCacheForTests({ completions });
    __setNutritionSqliteCacheForTests({ log: log as never });

    const result = generateInsights();
    const ins = result.find((r) => r.id === "habit_weeks_kcal");
    expect(ins).toBeDefined();
    expect(ins!.iconName).toBe("activity");
  });

  it("returns empty when habits exist but completions are insufficient", () => {
    __setRoutineSqliteStateCacheForTests({
      habits: [{ id: "h1", name: "x", archived: false }] as never,
    });
    __setRoutineSqliteCompletionsCacheForTests({
      completions: { h1: ["2025-01-01"] },
    });
    const result = generateInsights();
    expect(result.find((r) => r.id === "best_habit_month")).toBeUndefined();
  });
});
