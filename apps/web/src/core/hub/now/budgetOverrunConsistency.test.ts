// @vitest-environment jsdom
/**
 * Р5 спеки аналітики v2: одне джерело стану ліміту.
 *
 * Сліпий замір 2026-09-24 бачив на одному екрані хаба картку «Продукти:
 * використано 162% ліміту» і рядок «записано, перевищень немає». Три
 * поверхні рахували стан ліміту трьома шляхами; тут усі три читають
 * `calcLimitUsages` на тих самих даних, і тест тримає їх разом: той самий
 * `pctRaw` у рекомендації `budget_over_*` і в хаб-картці, а «Закрито
 * сьогодні» при перевищенні рядка Фініка не дає.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "@finyk/lib/sqliteReader";
import { useBudgetOverrunInsight } from "@finyk/hooks/useBudgetOverrunInsight";
import { calculateLimitUsage } from "@sergeant/finyk-domain/domain/budget";
import { withManualExpenses } from "@sergeant/finyk-domain/domain/transactions";
import type { Budget } from "@sergeant/finyk-domain/domain/types";

vi.mock("@finyk/lib/monoMirrorReader", () => {
  // Анонімний сценарій без банку: усі витрати ручні.
  const state = () => ({ transactions: [], accounts: [], refreshedAt: null });
  return {
    getCachedFinykMonoMirrorState: state,
    getVisibleFinykMonoMirrorState: state,
  };
});

const { generateRecommendations } =
  await import("../../lib/recommendationEngine");
const { computeClosedToday } = await import("./closedToday");

// 24 вересня 2026, 04:15 за Києвом: записи датасету v2 внесено о 04:00-04:30.
const NOW = new Date("2026-09-24T01:15:00Z");
const BUDGETS: Budget[] = [
  { id: "b1", type: "limit", categoryId: "food", limit: 500 },
];
// Записи 1 і 5 датасету: 247,50 + 560 «Продукти» = 807,50 проти ліміту 500.
const MANUAL = [
  {
    id: "m1",
    amount: 247.5,
    date: "2026-09-24T01:05:00.000Z",
    category: "groceries",
  },
  {
    id: "m2",
    amount: 560,
    date: "2026-09-24T01:10:00.000Z",
    category: "groceries",
  },
];

describe("стан ліміту: хаб-картка, рекомендація і «Закрито сьогодні» читають одне число", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    __setFinykSqliteStateCacheForTests({
      budgets: BUDGETS,
      manualExpenses: MANUAL,
    } as Parameters<typeof __setFinykSqliteStateCacheForTests>[0]);
  });

  afterEach(() => {
    clearFinykSqliteCache();
    vi.useRealTimers();
  });

  it("162 % ліміту: рекомендація і картка дають той самий pctRaw, рядка «перевищень немає» немає", () => {
    const expected = calculateLimitUsage({ limit: 500 }, 807.5);
    expect(expected.pctRaw).toBeCloseTo(161.5, 5);

    const recs = generateRecommendations();
    const over = recs.find((r) => r.id === "budget_over_food");
    expect(over?.title).toContain(
      `перевищено на ${Math.round(expected.pctRaw - 100)}%`,
    );

    const { result } = renderHook(() =>
      useBudgetOverrunInsight({
        budgets: BUDGETS,
        transactions: withManualExpenses([], MANUAL),
        txCategories: {},
        txSplits: {},
      }),
    );
    expect(result.current?.title).toBe(
      `Продукти: використано ${Math.round(expected.pctRaw)}% ліміту`,
    );

    // Сьогоднішні витрати є, тож без активного перевищення рядок був би:
    // саме так «перевищень немає» і зʼявлялось поруч із карткою 162 %.
    expect(
      computeClosedToday({ now: NOW, activeModules: ["finyk"], recs: [] })[0]
        ?.statement,
    ).toBe("записано, перевищень немає");
    expect(
      computeClosedToday({ now: NOW, activeModules: ["finyk"], recs }),
    ).toEqual([]);
  });
});
