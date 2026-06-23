// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRecurringDetectedInsight } from "./useRecurringDetectedInsight";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

const NOW = new Date(2026, 5, 20, 12, 0, 0); // 2026-06-20

function tx(id: string, daysAgo: number, amountKop: number): Transaction {
  const ms = NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000;
  return {
    id,
    time: Math.floor(ms / 1000),
    date: new Date(ms).toISOString().slice(0, 10),
    amount: -Math.abs(amountKop),
    description: "Netflix",
    mcc: 4899,
  } as unknown as Transaction;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useRecurringDetectedInsight", () => {
  it("returns null when there are no transactions", () => {
    const { result } = renderHook(() =>
      useRecurringDetectedInsight({ transactions: [] }),
    );
    expect(result.current).toBeNull();
  });

  it("fires for a monthly recurring merchant pattern", () => {
    // Three Netflix charges ~30 days apart, latest 5 days ago.
    const transactions = [
      tx("n1", 5, 39900),
      tx("n2", 35, 39900),
      tx("n3", 65, 39900),
    ];
    const { result } = renderHook(() =>
      useRecurringDetectedInsight({ transactions }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.id).toBe("finyk-recurring-detected");
    expect(result.current!.module).toBe("finyk");
    expect(result.current!.title).toContain("Netflix");
  });

  it("respects excludedTxIds passed as a Set without throwing", () => {
    const transactions = [tx("n1", 5, 39900), tx("n2", 35, 39900)];
    const { result } = renderHook(() =>
      useRecurringDetectedInsight({
        transactions,
        excludedTxIds: new Set(["n1"]),
      }),
    );
    // With a charge excluded the pattern drops below the occurrence floor.
    expect(result.current).toBeNull();
  });
});
