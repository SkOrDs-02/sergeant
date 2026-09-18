// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFinykPersonalization } from "./useFinykPersonalization";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

function tx(id: string, description: string, mcc: number): Transaction {
  return {
    id,
    time: Math.floor(Date.now() / 1000),
    date: "2026-06-01",
    amount: -5000,
    description,
    mcc,
  } as unknown as Transaction;
}

describe("useFinykPersonalization", () => {
  it("returns empty signal for no data", () => {
    const { result } = renderHook(() => useFinykPersonalization());
    expect(result.current.frequentCategories).toEqual([]);
    expect(result.current.frequentMerchants).toEqual([]);
    expect(result.current.hasSignal).toBe(false);
  });

  it("derives frequent categories/merchants from repeated transactions", () => {
    const txs = [
      tx("a", "Сільпо", 5411),
      tx("b", "Сільпо", 5411),
      tx("c", "Сільпо", 5411),
    ];
    const { result } = renderHook(() =>
      useFinykPersonalization({ mono: { realTx: txs } }),
    );
    expect(result.current.frequentCategories.length).toBeGreaterThan(0);
    expect(result.current.hasSignal).toBe(true);
  });

  it("keeps a stable reference across re-renders with the same excludedTxIds content", () => {
    const txs = [tx("a", "Сільпо", 5411), tx("b", "Сільпо", 5411)];
    const excluded = new Set(["x", "y"]);
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useFinykPersonalization>[0]) =>
        useFinykPersonalization(props),
    );
    rerender({ mono: { realTx: txs }, storage: { excludedTxIds: excluded } });
    const first = result.current.frequentCategories;
    // Re-render with a NEW Set instance but identical contents.
    rerender({
      mono: { realTx: txs },
      storage: { excludedTxIds: new Set(["x", "y"]) },
    });
    expect(result.current.frequentCategories).toBe(first);
  });
});
