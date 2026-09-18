// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAnalytics } from "./useAnalytics";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

function spend(id: string, mcc: number, amountKop: number): Transaction {
  return {
    id,
    time: Math.floor(new Date(2026, 5, 5).getTime() / 1000),
    date: "2026-06-05",
    amount: -Math.abs(amountKop),
    description: "Store",
    mcc,
  } as unknown as Transaction;
}

describe("useAnalytics", () => {
  it("returns zeroed views for an empty transaction set", () => {
    const { result } = renderHook(() =>
      useAnalytics({ mono: { realTx: [] }, storage: {} }),
    );
    expect(result.current.summary.spent).toBe(0);
    expect(result.current.topCategories).toEqual([]);
    expect(result.current.distribution).toEqual([]);
    expect(result.current.distributionTotal).toBe(0);
    expect(result.current.topMerchants).toEqual([]);
    expect(result.current.comparison).toBeNull();
  });

  it("aggregates spend across transactions", () => {
    const txs = [spend("a", 5411, 10000), spend("b", 5812, 20000)];
    const { result } = renderHook(() =>
      useAnalytics({
        mono: { realTx: txs, loadingTx: false },
        storage: {},
      }),
    );
    expect(result.current.summary.spent).toBeGreaterThan(0);
    expect(result.current.distributionTotal).toBeGreaterThan(0);
    expect(result.current.topCategories.length).toBeGreaterThan(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("computes a comparison when monthlyHistory has >=2 months", () => {
    const curr = [spend("c1", 5411, 30000)];
    const prev = [spend("p1", 5411, 10000)];
    const { result } = renderHook(() =>
      useAnalytics({
        mono: { realTx: curr },
        storage: {},
        monthlyHistory: [
          { month: "2026-05", transactions: prev } as never,
          { month: "2026-06", transactions: curr } as never,
        ],
      }),
    );
    expect(result.current.comparison).not.toBeNull();
  });

  it("respects excludedTxIds in the summary", () => {
    const txs = [spend("a", 5411, 10000), spend("b", 5411, 20000)];
    const withAll = renderHook(() =>
      useAnalytics({ mono: { realTx: txs }, storage: {} }),
    );
    const excludedSpent = renderHook(() =>
      useAnalytics({
        mono: { realTx: txs },
        storage: { excludedTxIds: new Set(["b"]) },
      }),
    );
    expect(excludedSpent.result.current.summary.spent).toBeLessThan(
      withAll.result.current.summary.spent,
    );
  });
});
