import { describe, it, expect } from "vitest";
import { calcForecast } from "./forecastEngine.js";

describe("finyk/forecastEngine", () => {
  it("calcForecast computes spent and forecast for a simple category", () => {
    const today = new Date(2026, 0, 10); // local time
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2, 12).getTime() / 1000),
        amount: -10000,
        description: "A",
      },
      {
        id: "t2",
        time: Math.floor(new Date(2026, 0, 3, 12).getTime() / 1000),
        amount: -20000,
        description: "B",
      },
    ];
    const categoryLimits = [{ categoryId: "food", limit: 200 }];
    const txCategories = { t1: "food", t2: "food" };
    const out = calcForecast(txs, categoryLimits, today, txCategories, {}, []);
    expect(out).toHaveLength(1);
    expect(out[0]!.categoryId).toBe("food");
    expect(out[0]!.spent).toBe(300);
    expect(out[0]!.dailyData).toHaveLength(31);
  });

  it("ignores non-negative (income) transactions", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2).getTime() / 1000),
        amount: 5000,
        description: "salary",
      },
    ];
    const out = calcForecast(txs, [{ categoryId: "food", limit: 100 }], today, {
      t1: "food",
    });
    expect(out[0]!.spent).toBe(0);
  });

  it("ignores transactions outside the current month window", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      // before monthStart
      {
        id: "t1",
        time: Math.floor(new Date(2025, 11, 20).getTime() / 1000),
        amount: -10000,
        description: "A",
      },
      // after "today"
      {
        id: "t2",
        time: Math.floor(new Date(2026, 0, 20).getTime() / 1000),
        amount: -10000,
        description: "B",
      },
    ];
    const out = calcForecast(txs, [{ categoryId: "food", limit: 100 }], today, {
      t1: "food",
      t2: "food",
    });
    expect(out[0]!.spent).toBe(0);
  });

  it("uses tx splits when present, skipping empty/internal_transfer categoryIds", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2).getTime() / 1000),
        amount: -30000,
        description: "A",
      },
    ];
    const txSplits = {
      t1: [
        { categoryId: "food", amount: 100 },
        { categoryId: "internal_transfer", amount: 50 }, // skipped
        { categoryId: "", amount: 25 } as never, // skipped (falsy id)
        { categoryId: "food", amount: 50 }, // accumulates onto food
      ],
    };
    const out = calcForecast(
      txs,
      [{ categoryId: "food", limit: 500 }],
      today,
      {},
      txSplits,
    );
    expect(out[0]!.spent).toBe(150);
  });

  it("skips the whole transaction when its resolved category is internal_transfer", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2).getTime() / 1000),
        amount: -10000,
        description: "A",
      },
    ];
    // A custom category overlay resolving the override id to
    // "internal_transfer" is the only way `getCategory` returns that id
    // (it is not a built-in MCC category), which exercises the
    // non-split `if (cat.id === "internal_transfer") continue;` branch.
    const out = calcForecast(
      txs,
      [{ categoryId: "internal_transfer", limit: 500 }],
      today,
      { t1: "internal_transfer" },
      {},
      [{ id: "internal_transfer", label: "Переказ" }],
    );
    expect(out[0]!.spent).toBe(0);
  });

  it("splits with an empty array fall through to category-based lookup", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2).getTime() / 1000),
        amount: -10000,
        description: "A",
      },
    ];
    const out = calcForecast(
      txs,
      [{ categoryId: "food", limit: 500 }],
      today,
      { t1: "food" },
      { t1: [] }, // empty splits -> falls back to txCategories
    );
    expect(out[0]!.spent).toBe(100);
  });

  it("marks overLimit and computes overPercent when forecast exceeds a positive limit", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2).getTime() / 1000),
        amount: -100000,
        description: "A",
      },
    ];
    const out = calcForecast(txs, [{ categoryId: "food", limit: 100 }], today, {
      t1: "food",
    });
    expect(out[0]!.overLimit).toBe(true);
    expect(out[0]!.overPercent).toBeGreaterThan(0);
  });

  it("does not flag overLimit when limit is zero or negative", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2).getTime() / 1000),
        amount: -100000,
        description: "A",
      },
    ];
    const zeroLimit = calcForecast(
      txs,
      [{ categoryId: "food", limit: 0 }],
      today,
      { t1: "food" },
    );
    expect(zeroLimit[0]!.overLimit).toBe(false);
    expect(zeroLimit[0]!.overPercent).toBe(0);

    const negLimit = calcForecast(
      txs,
      [{ categoryId: "food", limit: -50 }],
      today,
      { t1: "food" },
    );
    expect(negLimit[0]!.overLimit).toBe(false);
  });

  it("does not flag overLimit when forecast stays within limit", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2).getTime() / 1000),
        amount: -1000,
        description: "A",
      },
    ];
    const out = calcForecast(
      txs,
      [{ categoryId: "food", limit: 10000 }],
      today,
      { t1: "food" },
    );
    expect(out[0]!.overLimit).toBe(false);
    expect(out[0]!.overPercent).toBe(0);
  });

  it("handles multiple categories independently in one call", () => {
    const today = new Date(2026, 0, 10);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 2).getTime() / 1000),
        amount: -10000,
        description: "A",
      },
      {
        id: "t2",
        time: Math.floor(new Date(2026, 0, 3).getTime() / 1000),
        amount: -20000,
        description: "B",
      },
    ];
    const out = calcForecast(
      txs,
      [
        { categoryId: "food", limit: 500 },
        { categoryId: "transport", limit: 500 },
      ],
      today,
      { t1: "food", t2: "transport" },
    );
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.categoryId === "food")!.spent).toBe(100);
    expect(out.find((r) => r.categoryId === "transport")!.spent).toBe(200);
  });

  it("skips the bridge point when today is the last day of the month", () => {
    // 2026-01-31 is the last day of January.
    const today = new Date(2026, 0, 31);
    const txs = [
      {
        id: "t1",
        time: Math.floor(new Date(2026, 0, 15).getTime() / 1000),
        amount: -10000,
        description: "A",
      },
    ];
    const out = calcForecast(txs, [{ categoryId: "food", limit: 500 }], today, {
      t1: "food",
    });
    // Every day should be "past" (actual), none should be a null-actual forecast day.
    expect(out[0]!.dailyData.every((p) => p.actual !== null)).toBe(true);
    expect(out[0]!.daysRemaining).toBe(0);
  });

  it("defaults today to the current date and empty maps when omitted", () => {
    const out = calcForecast([], [{ categoryId: "food", limit: 100 }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.spent).toBe(0);
  });

  it("returns an empty result set for empty categoryLimits", () => {
    const today = new Date(2026, 0, 10);
    expect(calcForecast([], [], today)).toEqual([]);
  });
});
