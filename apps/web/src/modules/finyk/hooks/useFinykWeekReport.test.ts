// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

const state = vi.hoisted(() => ({
  statTransactions: [] as unknown[],
  budgets: [] as unknown[],
}));

vi.mock("./useFinykStatTransactions", () => ({
  useFinykStatTransactions: () => ({
    statTransactions: state.statTransactions,
    slots: {
      budgets: state.budgets,
      txCategories: {},
      txSplits: {},
      customCategories: [],
    },
  }),
}));

import { useFinykWeekReport } from "./useFinykWeekReport";

function tx(id: string, amount: number, daysAgo: number, mcc = 5411) {
  const time = Math.floor(Date.now() / 1000) - daysAgo * 86_400;
  return {
    id,
    amount,
    time,
    description: "tx",
    mcc,
    categoryId: "",
  } as unknown as Transaction;
}

describe("useFinykWeekReport", () => {
  beforeEach(() => {
    state.statTransactions = [];
    state.budgets = [];
  });

  it("каже одним рядком, що за тиждень записів немає", () => {
    state.statTransactions = [tx("old", -10_000, 20)];
    const { result } = renderHook(() => useFinykWeekReport());
    expect(result.current).toEqual(["За останні 7 днів записів немає"]);
  });

  it("мовчить зовсім, коли Фінік вимкнено", () => {
    state.statTransactions = [tx("old", -10_000, 20)];
    const { result } = renderHook(() => useFinykWeekReport(false));
    expect(result.current).toEqual([]);
  });

  it("дає рядки найбільшої категорії, зростання і ліміту", () => {
    state.statTransactions = [
      tx("f1", -80_000, 1, 5411),
      tx("c1", -30_000, 2, 5814),
      tx("c0", -10_000, 9, 5814),
    ];
    state.budgets = [
      { id: "b", type: "limit", categoryId: "food", limit: 500 },
    ];
    const { result } = renderHook(() => useFinykWeekReport());
    const [top, growth, limit] = result.current;
    expect(top).toMatch(/^Найбільше за тиждень: Продукти, 800/);
    expect(growth).toMatch(/^Виросло проти минулого тижня: Кафе.*\+200/);
    expect(limit).toMatch(/^Продукти: /);
  });
});
