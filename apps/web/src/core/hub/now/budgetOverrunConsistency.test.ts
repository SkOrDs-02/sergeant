// @vitest-environment jsdom
/**
 * Р5 спеки аналітики v2: одне джерело стану ліміту.
 *
 * Сліпий замір 2026-09-24 бачив на одному екрані хаба картку «Продукти:
 * використано 162% ліміту» і рядок «записано, перевищень немає» (тепер «записано · у межах лімітів»). Три
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
const { useDashboardFocus } = await import("../../insights/dashboardFocus");

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
    localStorage.clear();
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
    // саме так «в межах» і зʼявлялось поруч із карткою 162 %.
    expect(
      computeClosedToday({ now: NOW, activeModules: ["finyk"], recs: [] })[0]
        ?.statement,
    ).toBe("записано · у межах лімітів");
    expect(
      computeClosedToday({ now: NOW, activeModules: ["finyk"], recs }),
    ).toEqual([]);
  });

  it("сховали картку перевищення («✕»): ліміт усе одно перевищено, рядка Фініка немає", () => {
    // Те, що HubDashboard віддавав у «Закрито сьогодні», — `focus` + `rest`,
    // тобто рекомендації ПІСЛЯ фільтра відкинутих. Сховав картку — перевищення
    // зникало зі списку, і рядок казав «в межах лімітів» поруч із 162 %.
    localStorage.setItem(
      "hub_recs_dismissed_v1",
      JSON.stringify({ budget_over_food: NOW.getTime() }),
    );
    const { result } = renderHook(() => useDashboardFocus());

    const shown = [result.current.focus, ...result.current.rest].flatMap((r) =>
      r ? [r] : [],
    );
    expect(shown.map((r) => r.id)).not.toContain("budget_over_food");
    // Перевищення нікуди не ділось — лише картка схована.
    expect(result.current.allRecs.map((r) => r.id)).toContain(
      "budget_over_food",
    );

    // Стара проводка (`[focus, ...rest]`) давала хибний рядок:
    expect(
      computeClosedToday({ now: NOW, activeModules: ["finyk"], recs: shown })[0]
        ?.statement,
    ).toBe("записано · у межах лімітів");
    // Нова — усі активні рекомендації — рядка не дає:
    expect(
      computeClosedToday({
        now: NOW,
        activeModules: ["finyk"],
        recs: result.current.allRecs,
      }),
    ).toEqual([]);
  });
});
