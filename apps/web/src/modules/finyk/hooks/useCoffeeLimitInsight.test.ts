// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useCoffeeLimitInsight,
  COFFEE_CATEGORY_SLUG,
} from "./useCoffeeLimitInsight";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

// Build a spend tx (negative amount = expense, kopiykas) at a given local
// epoch-seconds time. Category is forced via `txCategories` in the test.
function spendTx(id: string, dateMs: number, amountKop: number): Transaction {
  return {
    id,
    time: Math.floor(dateMs / 1000),
    date: new Date(dateMs).toISOString().slice(0, 10),
    amount: -Math.abs(amountKop),
    description: "café",
    mcc: 5812,
  } as unknown as Transaction;
}

beforeEach(() => {
  vi.useFakeTimers();
  // Pin "now" to 2026-06-15 so currentMonth() === "2026-6".
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useCoffeeLimitInsight", () => {
  it("returns null with no transactions", () => {
    const { result } = renderHook(() =>
      useCoffeeLimitInsight({
        transactions: [],
        txCategories: {},
        txSplits: {},
      }),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when growth is below the 25% threshold", () => {
    const thisM = spendTx("a", new Date(2026, 5, 5).getTime(), 11000);
    const lastM = spendTx("b", new Date(2026, 4, 5).getTime(), 10000);
    const { result } = renderHook(() =>
      useCoffeeLimitInsight({
        transactions: [thisM, lastM],
        txCategories: { a: COFFEE_CATEGORY_SLUG, b: COFFEE_CATEGORY_SLUG },
        txSplits: {},
      }),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when last month spend is zero", () => {
    const thisM = spendTx("a", new Date(2026, 5, 5).getTime(), 50000);
    const { result } = renderHook(() =>
      useCoffeeLimitInsight({
        transactions: [thisM],
        txCategories: { a: COFFEE_CATEGORY_SLUG },
        txSplits: {},
      }),
    );
    expect(result.current).toBeNull();
  });

  it("emits an insight when growth exceeds the threshold", () => {
    // last month: 100 grn, this month: 200 grn → +100% growth.
    const thisM = spendTx("a", new Date(2026, 5, 5).getTime(), 20000);
    const lastM = spendTx("b", new Date(2026, 4, 5).getTime(), 10000);
    const { result } = renderHook(() =>
      useCoffeeLimitInsight({
        transactions: [thisM, lastM],
        txCategories: { a: COFFEE_CATEGORY_SLUG, b: COFFEE_CATEGORY_SLUG },
        txSplits: {},
      }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.module).toBe("finyk");
    expect(result.current!.id).toContain("finyk-coffee-limit");
    expect(result.current!.action).toEqual({
      type: "navigate",
      path: `/finyk/budgets?cat=${COFFEE_CATEGORY_SLUG}`,
    });
    expect(result.current!.title).toContain("100%");
  });
});
