// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFinykPersonalization } from "./useFinykPersonalization";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { buildMerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";

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

  it("частота категорій враховує правила мерчантів (явні override-и сильніші)", () => {
    const txs = [
      tx("a", "Сільпо №1", 5411),
      tx("b", "СІЛЬПО 2", 5411),
      tx("c", "Сільпо №3", 5411),
    ];
    const merchantRuleIndex = buildMerchantRuleIndex([
      {
        id: "mr_1",
        kind: "expense",
        merchantKey: "сільпо",
        categoryId: "transport",
        label: "Сільпо",
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z",
      },
    ]);
    const { result } = renderHook(() =>
      useFinykPersonalization({
        mono: { realTx: txs },
        storage: { merchantRuleIndex, txCategories: { c: "food" } },
        now: new Date("2026-06-15T09:00:00Z"),
      }),
    );
    const byId = Object.fromEntries(
      result.current.frequentCategories.map((c) => [c.id, c.count]),
    );
    // a, b — за правилом, c — явний вибір; серверного слага/MCC нема в рахунку.
    expect(byId["transport"]).toBe(2);
    expect(byId["food"]).toBe(1);
  });
});
