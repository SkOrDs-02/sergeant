// @vitest-environment jsdom
/**
 * Р9 спеки аналітики v2: попередження до перевищення ліміту.
 *
 * Пінимо три межі: картка є, коли прогноз за темпом вищий за ліміт, а факт
 * ще ні; зникає, щойно факт перейшов ліміт (тоді говорить картка
 * перевищення); мовчить у перші два дні місяця, бо темпу ще нема.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type {
  LimitBudget,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";
import { useBudgetPaceInsight } from "./useBudgetPaceInsight";
import { useBudgetOverrunInsight } from "./useBudgetOverrunInsight";

function mkTx(id: string, amountKopecks: number, day: number): Transaction {
  return {
    id,
    amount: amountKopecks,
    date: `2026-09-${String(day).padStart(2, "0")}`,
    categoryId: "transport",
    type: "expense",
    source: "manual",
    time: Math.floor(Date.UTC(2026, 8, day, 9) / 1000),
    description: "",
    mcc: 0,
    accountId: null,
    manual: true,
    _source: "manual",
    _accountId: null,
    _manual: true,
  };
}

const TRANSPORT: LimitBudget = {
  id: "b1",
  type: "limit",
  categoryId: "transport",
  limit: 150,
};

function setDay(day: number) {
  vi.setSystemTime(
    new Date(`2026-09-${String(day).padStart(2, "0")}T09:00:00Z`),
  );
}

function render(transactions: Transaction[]) {
  const args = {
    budgets: [TRANSPORT],
    transactions,
    txCategories: {},
    txSplits: {},
  };
  return {
    pace: renderHook(() => useBudgetPaceInsight(args)).result.current,
    overrun: renderHook(() => useBudgetOverrunInsight(args)).result.current,
  };
}

describe("useBudgetPaceInsight", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("«Транспорт» 150, витрачено 120 на 20-й день: попередження, перевищення нема", () => {
    setDay(20);
    const { pace, overrun } = render([mkTx("t1", -12_000, 10)]);
    expect(overrun).toBeNull();
    expect(pace?.id).toBe("finyk-budget-pace-transport");
    // Темп 6 ₴/день, до ліміту 30 ₴ → 5 днів.
    expect(pace?.title).toBe(
      "Транспорт: за темпом перевищиш ліміт через 5 днів",
    );
    expect(pace?.subtitle).toContain("~180 ₴");
    expect(pace?.showOn).toBe("hub");
  });

  it("після фактичного перевищення попередження зникає, лишається картка перевищення", () => {
    setDay(20);
    const { pace, overrun } = render([mkTx("t1", -16_000, 10)]);
    expect(pace).toBeNull();
    expect(overrun?.id).toBe("finyk-budget-overrun-transport");
  });

  it("у перші два дні місяця попередження нема", () => {
    setDay(2);
    const { pace } = render([mkTx("t1", -12_000, 1)]);
    expect(pace).toBeNull();
  });

  it("темп укладається в ліміт: попередження нема", () => {
    setDay(20);
    const { pace } = render([mkTx("t1", -5_000, 10)]);
    expect(pace).toBeNull();
  });
});
