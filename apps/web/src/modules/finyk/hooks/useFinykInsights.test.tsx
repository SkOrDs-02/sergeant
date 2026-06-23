// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const cachedState = { transactions: [] as unknown[] };

vi.mock("../lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: () => cachedState,
}));
vi.mock("../lib/monoMirrorGate", () => ({
  useFinykMonoMirrorTick: () => 0,
}));

const slotsValue = {
  budgets: [] as unknown[],
  txCategories: {} as Record<string, string>,
  txSplits: {},
  customCategories: [] as unknown[],
  subscriptions: [] as unknown[],
  dismissedRecurring: [] as string[],
};
vi.mock("./useFinykStorageSlots", () => ({
  useFinykStorageSlots: () => slotsValue,
}));

import { useFinykInsights } from "./useFinykInsights";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  cachedState.transactions = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useFinykInsights", () => {
  it("returns an empty array when no insight triggers fire", () => {
    const { result } = renderHook(() => useFinykInsights());
    expect(result.current).toEqual([]);
  });

  it("surfaces the coffee-limit insight when MoM growth crosses the threshold", () => {
    const tx = (id: string, dateMs: number) =>
      ({
        id,
        time: Math.floor(dateMs / 1000),
        date: new Date(dateMs).toISOString().slice(0, 10),
        amount: -20000,
        description: "café",
        mcc: 5812,
      }) as unknown;
    cachedState.transactions = [
      tx("a", new Date(2026, 5, 5).getTime()),
      {
        ...(tx("b", new Date(2026, 4, 5).getTime()) as object),
        amount: -10000,
      },
    ];
    slotsValue.txCategories = { a: "restaurant", b: "restaurant" };

    const { result } = renderHook(() => useFinykInsights());
    expect(result.current.length).toBeGreaterThanOrEqual(1);
    expect(result.current.some((i) => i.id.includes("coffee"))).toBe(true);

    slotsValue.txCategories = {};
  });
});
