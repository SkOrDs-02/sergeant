// @vitest-environment jsdom
/**
 * Дрил-даун з Аналітики за тиждень, рік чи діапазон (Р5.6 спеки
 * finyk-analytics-v3): список Операцій звужується до днів періоду, навіть
 * коли той зачіпає кілька місяців, а гортання місяця знімає звуження.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { useTransactionFilters } from "./useTransactionFilters";

const mirror: Transaction[] = [];
vi.mock("../../hooks/useFinykStatTransactions", () => ({
  useFinykMirrorTransactions: () => mirror,
}));

function mkTx(id: string, iso: string): Transaction {
  return {
    id,
    amount: -10_000,
    time: Math.floor(new Date(iso).getTime() / 1000),
    description: "",
    mcc: 5411,
    categoryId: "food",
  } as unknown as Transaction;
}

function params(
  overrides: Partial<Parameters<typeof useTransactionFilters>[0]> = {},
) {
  return {
    realTx: [],
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
    categoryFilter: "all",
    categoryMonth: { year: 2026, month: 6 },
    categoryRange: { fromKey: "2026-05-28", toKey: "2026-06-03" },
    dayFilter: null,
    ...overrides,
  };
}

describe("useTransactionFilters: період дрил-дауну", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
    mirror.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("тиждень через межу місяців бере обидва місяці з дзеркала і лише свої дні", () => {
    mirror.push(
      mkTx("may-27", "2026-05-27T10:00:00Z"),
      mkTx("may-29", "2026-05-29T10:00:00Z"),
      mkTx("jun-02", "2026-06-02T10:00:00Z"),
      mkTx("jun-04", "2026-06-04T10:00:00Z"),
    );
    const { result } = renderHook(() =>
      useTransactionFilters(
        params({
          manualExpenses: [
            {
              id: "m-jun-01",
              amount: 50,
              date: "2026-06-01",
              description: "",
              category: "food",
            },
          ],
        }),
      ),
    );
    expect(result.current.rangeFilter).toEqual({
      fromKey: "2026-05-28",
      toKey: "2026-06-03",
    });
    expect(result.current.activeTx.map((t) => t.id).sort()).toEqual(
      ["jun-02", "may-29", "manual_m-jun-01"].sort(),
    );
  });

  it("гортання місяця знімає звуження періодом", () => {
    mirror.push(mkTx("jun-10", "2026-06-10T10:00:00Z"));
    const { result } = renderHook(() =>
      useTransactionFilters(
        params({ realTx: [mkTx("jun-10", "2026-06-10T10:00:00Z")] }),
      ),
    );
    expect(result.current.activeTx).toHaveLength(0);
    act(() => {
      result.current.goMonth(-1);
    });
    act(() => {
      result.current.goMonth(1);
    });
    expect(result.current.rangeFilter).toBeNull();
    expect(result.current.activeTx.map((t) => t.id)).toEqual(["jun-10"]);
  });
});
