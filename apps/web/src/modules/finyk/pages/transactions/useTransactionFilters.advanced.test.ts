// @vitest-environment jsdom
/**
 * Аркуш «Фільтри» (Ф-2 (б), спека finyk-operations-filters): сума, рахунок і
 * тег звужують список поверх пошуку, розгортають дні зі збігами, переживають
 * зміну місяця і скидаються одним викликом.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { useTransactionFilters } from "./useTransactionFilters";

vi.mock("../../hooks/useFinykStatTransactions", () => ({
  useFinykMirrorTransactions: () => [],
}));

function mkTx(id: string, iso: string, amount: number): Transaction {
  return {
    id,
    amount,
    time: Math.floor(new Date(iso).getTime() / 1000),
    description: id,
    mcc: 5411,
    _accountId: "card-1",
  } as unknown as Transaction;
}

const realTx = [
  mkTx("small", "2026-06-02T10:00:00Z", -5_000),
  mkTx("big", "2026-06-03T10:00:00Z", -250_000),
  mkTx("coffee", "2026-06-04T10:00:00Z", -9_000),
];

function params(
  overrides: Partial<Parameters<typeof useTransactionFilters>[0]> = {},
) {
  return {
    realTx,
    historyTx: [],
    loadingTx: false,
    loadingHistory: false,
    manualExpenses: [],
    accounts: [],
    hiddenTxIds: [],
    excludedTxIds: new Set<string>(),
    txSplits: {},
    txCategories: {},
    customCategories: [],
    fetchMonth: () => Promise.resolve(undefined),
    categoryFilter: null,
    dayFilter: null,
    txTags: { coffee: ["Кава"], small: ["Кава"] },
    ...overrides,
  };
}

describe("useTransactionFilters: аркуш «Фільтри»", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("сума і тег звужують список, дні зі збігами розгорнуті", () => {
    const { result } = renderHook(() => useTransactionFilters(params()));
    expect(result.current.advancedActive).toBe(false);
    act(() => {
      result.current.setAdvancedFilters({
        minKop: 8_000,
        maxKop: null,
        accountKey: null,
        tagKey: "кава",
      });
    });
    expect(result.current.advancedActive).toBe(true);
    expect(result.current.filtered.map((t) => t.id)).toEqual(["coffee"]);
    expect(result.current.collapsedKeys.size).toBe(0);
    // Чернетка аркуша рахує від списку до його фільтрів.
    expect(result.current.searchedTx).toHaveLength(3);
  });

  it("переживає зміну місяця і скидається одним викликом", () => {
    const { result } = renderHook(() => useTransactionFilters(params()));
    act(() => {
      result.current.setAdvancedFilters({
        minKop: 100_000,
        maxKop: null,
        accountKey: null,
        tagKey: null,
      });
    });
    act(() => {
      result.current.goMonth(-1);
    });
    act(() => {
      result.current.goMonth(1);
    });
    expect(result.current.filtered.map((t) => t.id)).toEqual(["big"]);
    act(() => {
      result.current.clearAdvancedFilters();
    });
    expect(result.current.advancedActive).toBe(false);
    expect(result.current.filtered).toHaveLength(3);
  });

  it("нічого не підходить: порожній список, а місяць не порожній", () => {
    const { result } = renderHook(() => useTransactionFilters(params()));
    act(() => {
      result.current.setAdvancedFilters({
        minKop: null,
        maxKop: null,
        accountKey: "card-2",
        tagKey: null,
      });
    });
    expect(result.current.filtered).toEqual([]);
    expect(result.current.activeTx).toHaveLength(3);
  });
});
