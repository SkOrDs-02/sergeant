// @vitest-environment jsdom
/**
 * Unit tests for useBudgetOverrunInsight.
 *
 * The hook is a pure useMemo derivation — no network, no storage.
 * We verify the three main branches: null guards, overrun detection,
 * and worst-offender selection.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type {
  Transaction,
  LimitBudget,
} from "@sergeant/finyk-domain/domain/types";
import {
  useBudgetOverrunInsight,
  OVERRUN_THRESHOLD,
} from "./useBudgetOverrunInsight";

// Minimal transaction factory. amount is in kopecks (negative = expense).
function mkTx(id: string, amountKopecks: number): Transaction {
  return {
    id,
    amount: amountKopecks,
    date: "2026-06-01",
    categoryId: "other",
    type: "expense",
    source: "manual",
    time: 0,
    description: "",
    mcc: 0,
    accountId: null,
    manual: true,
    _source: "manual",
    _accountId: null,
    _manual: true,
  };
}

function mkBudget(id: string, categoryId: string, limit: number): LimitBudget {
  return { id, type: "limit", categoryId, limit };
}

describe("useBudgetOverrunInsight", () => {
  it("returns null when there are no limit budgets", () => {
    const { result } = renderHook(() =>
      useBudgetOverrunInsight({
        budgets: [],
        transactions: [mkTx("t1", -50000)],
        txCategories: {},
        txSplits: {},
      }),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when there are no transactions", () => {
    const { result } = renderHook(() =>
      useBudgetOverrunInsight({
        budgets: [mkBudget("b1", "food", 500)],
        transactions: [],
        txCategories: {},
        txSplits: {},
      }),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when spend is below the overrun threshold", () => {
    // Limit 1000 UAH; spend exactly at threshold (110%) would fire, but
    // we stay just below: 109% = 1090 UAH = 109 000 kopecks.
    const tx = mkTx("t1", -109_000);
    const { result } = renderHook(() =>
      useBudgetOverrunInsight({
        budgets: [mkBudget("b1", "food", 1000)],
        transactions: [tx],
        txCategories: { t1: "food" },
        txSplits: {},
      }),
    );
    // ratio = 1090 / 1000 = 1.09 < OVERRUN_THRESHOLD (1.1) → null
    expect(result.current).toBeNull();
  });

  it("fires an insight when spend exceeds the overrun threshold", () => {
    // Limit 1000 UAH; spend 1200 UAH (120%) = 120 000 kopecks.
    const tx = mkTx("t1", -120_000);
    const { result } = renderHook(() =>
      useBudgetOverrunInsight({
        budgets: [mkBudget("b1", "food", 1000)],
        transactions: [tx],
        txCategories: { t1: "food" },
        txSplits: {},
      }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.id).toBe("finyk-budget-overrun-food");
    expect(result.current!.module).toBe("finyk");
    expect(result.current!.title).toContain("20%");
    expect(result.current!.action).toMatchObject({
      type: "navigate",
      path: expect.stringContaining("food"),
    });
  });

  it("selects the worst offender when multiple budgets are overrun", () => {
    // food: 150% overrun; transport: 120% overrun — food should win.
    const txFood = mkTx("t1", -150_000); // 1500 UAH on food (limit 1000)
    const txTransport = mkTx("t2", -240_000); // 2400 UAH on transport (limit 2000)

    const { result } = renderHook(() =>
      useBudgetOverrunInsight({
        budgets: [
          mkBudget("b1", "food", 1000),
          mkBudget("b2", "transport", 2000),
        ],
        transactions: [txFood, txTransport],
        txCategories: { t1: "food", t2: "transport" },
        txSplits: {},
      }),
    );

    // food ratio = 1.5, transport ratio = 1.2 → food wins
    expect(result.current).not.toBeNull();
    expect(result.current!.id).toBe("finyk-budget-overrun-food");
  });

  it("OVERRUN_THRESHOLD is exported and equals 1.1", () => {
    // Guard the public constant so a refactor can't silently change the
    // trigger level without updating this test.
    expect(OVERRUN_THRESHOLD).toBe(1.1);
  });
});
