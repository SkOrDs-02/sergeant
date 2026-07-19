import { describe, it, expect } from "vitest";
import {
  calcFinykPeriodAggregate,
  calcFinykSpendingByDate,
  calcFinykSpendingTotal,
} from "./spending.js";

const monday = new Date("2026-04-20T00:00:00").getTime();
const sunday = new Date("2026-04-27T00:00:00").getTime();

interface MakeTx {
  id: string;
  amount: number;
  time?: number;
  mcc?: number;
  description?: string;
}

function tx(t: MakeTx): MakeTx {
  return { time: monday + 3_600_000, ...t };
}

describe("calcFinykPeriodAggregate", () => {
  it("returns zeroes for empty input", () => {
    const r = calcFinykPeriodAggregate([], { start: monday, end: sunday });
    expect(r).toEqual({
      totalSpent: 0,
      totalIncome: 0,
      txCount: 0,
      byCategory: {},
    });
  });

  it("aggregates expenses and income inside the range", () => {
    const r = calcFinykPeriodAggregate(
      [
        tx({ id: "a", amount: -25_000 }),
        tx({ id: "b", amount: -7_500 }),
        tx({ id: "c", amount: 50_000 }),
      ],
      { start: monday, end: sunday },
    );
    expect(r.totalSpent).toBe(325);
    expect(r.totalIncome).toBe(500);
    expect(r.txCount).toBe(3);
    expect(r.byCategory).toEqual({ other: 325 });
  });

  it("excludes ids and respects unix-seconds time", () => {
    const r = calcFinykPeriodAggregate(
      [
        tx({ id: "a", amount: -10_000 }),
        // unix seconds (small) — same Monday slot
        { id: "b", amount: -20_000, time: (monday + 3_600_000) / 1000 },
        tx({ id: "skip", amount: -99_900 }),
      ],
      {
        start: monday,
        end: sunday,
        excludedTxIds: new Set(["skip"]),
      },
    );
    expect(r.totalSpent).toBe(300);
    expect(r.txCount).toBe(2);
  });

  it("ignores transactions outside the range", () => {
    const before = monday - 86_400_000;
    const after = sunday + 1;
    const r = calcFinykPeriodAggregate(
      [
        { id: "before", amount: -10_000, time: before },
        { id: "after", amount: -10_000, time: after },
        tx({ id: "in", amount: -10_000 }),
      ],
      { start: monday, end: sunday },
    );
    expect(r.totalSpent).toBe(100);
    expect(r.txCount).toBe(1);
  });

  it("buckets expenses by categoryKey()", () => {
    const r = calcFinykPeriodAggregate(
      [
        tx({ id: "a", amount: -10_000, mcc: 5411 }),
        tx({ id: "b", amount: -5_000, mcc: 5411 }),
        tx({ id: "c", amount: -2_500, mcc: 4111 }),
        tx({ id: "d", amount: 30_000 }), // income — never bucketed
      ],
      {
        start: monday,
        end: sunday,
        categoryKey: (t) => String(t.mcc ?? "other"),
      },
    );
    expect(r.byCategory).toEqual({
      "5411": 150,
      "4111": 25,
    });
    expect(r.totalSpent).toBe(175);
    expect(r.totalIncome).toBe(300);
    expect(r.txCount).toBe(4);
  });

  it("honors txSplits for expense amounts", () => {
    const r = calcFinykPeriodAggregate([tx({ id: "a", amount: -100_000 })], {
      start: monday,
      end: sunday,
      txSplits: {
        a: [
          { categoryId: "food", amount: 600 },
          // internal_transfer split is dropped
          { categoryId: "internal_transfer", amount: 400 },
        ],
      },
      categoryKey: (t) => String(t.mcc ?? "other"),
    });
    // Splits-aware: only 600 (the food split) counted, not the full 1000
    expect(r.totalSpent).toBe(600);
  });

  it("end is exclusive — sunday boundary tx counted in the next week, not this one", () => {
    const r = calcFinykPeriodAggregate(
      [{ id: "boundary", amount: -10_000, time: sunday }],
      { start: monday, end: sunday },
    );
    expect(r.txCount).toBe(0);
    expect(r.totalSpent).toBe(0);
  });
});

describe("calcFinykSpendingTotal", () => {
  it("returns 0 for null/undefined/non-array input", () => {
    expect(calcFinykSpendingTotal(null)).toBe(0);
    expect(calcFinykSpendingTotal(undefined)).toBe(0);
    expect(calcFinykSpendingTotal("nope" as never)).toBe(0);
  });

  it("sums only negative-amount (expense) transactions", () => {
    const total = calcFinykSpendingTotal([
      tx({ id: "a", amount: -10_000 }),
      tx({ id: "b", amount: 5_000 }), // income, skipped
      tx({ id: "c", amount: -2_500 }),
    ]);
    expect(total).toBe(125);
  });

  it("skips falsy transaction entries", () => {
    const total = calcFinykSpendingTotal([
      null as never,
      tx({ id: "a", amount: -10_000 }),
    ]);
    expect(total).toBe(100);
  });

  it("excludes ids given as a Set or as an array", () => {
    const txs = [
      tx({ id: "a", amount: -10_000 }),
      tx({ id: "b", amount: -20_000 }),
    ];
    expect(calcFinykSpendingTotal(txs, { excludedTxIds: new Set(["a"]) })).toBe(
      200,
    );
    expect(calcFinykSpendingTotal(txs, { excludedTxIds: ["a"] })).toBe(200);
  });

  it("uses txSplits to compute the stat amount, dropping internal_transfer splits", () => {
    const total = calcFinykSpendingTotal([tx({ id: "a", amount: -100_000 })], {
      txSplits: {
        a: [
          { categoryId: "food", amount: 300 },
          { categoryId: "internal_transfer", amount: 700 },
        ],
      },
    });
    expect(total).toBe(300);
  });
});

describe("calcFinykSpendingByDate", () => {
  const localDateKeyFn = (d: Date) => d.toISOString().slice(0, 10);

  it("buckets expenses by local date key, ignoring dates outside dateSet", () => {
    const dateSet = new Set(["2026-04-20"]);
    const { total, daily } = calcFinykSpendingByDate(
      [
        { id: "a", amount: -10_000, time: monday / 1000 + 3600 }, // unix seconds
        { id: "b", amount: -5_000, time: monday + 3_600_000 }, // ms
        { id: "outside", amount: -1_000, time: sunday }, // outside dateSet
      ],
      { dateSet, localDateKeyFn },
    );
    expect(daily["2026-04-20"]).toBe(150);
    expect(total).toBe(150);
  });

  it("returns empty totals for non-array/empty input", () => {
    const dateSet = new Set(["2026-04-20"]);
    const { total, daily } = calcFinykSpendingByDate(undefined as never, {
      dateSet,
      localDateKeyFn,
    });
    expect(total).toBe(0);
    expect(daily).toEqual({});
  });

  it("skips falsy entries, income, and excluded ids", () => {
    const dateSet = new Set(["2026-04-20"]);
    const { total } = calcFinykSpendingByDate(
      [
        null as never,
        tx({ id: "income", amount: 5_000 }),
        tx({ id: "excluded", amount: -10_000 }),
        tx({ id: "kept", amount: -3_000 }),
      ],
      { dateSet, localDateKeyFn, excludedTxIds: new Set(["excluded"]) },
    );
    expect(total).toBe(30);
  });

  it("sums rounded daily buckets so total equals the sum of daily values", () => {
    const dateSet = new Set(["2026-04-20"]);
    const { total, daily } = calcFinykSpendingByDate(
      [
        tx({ id: "a", amount: -10_050 }), // 100.5
        tx({ id: "b", amount: -10_050 }), // 100.5 -> bucket sums to 201 exactly
      ],
      { dateSet, localDateKeyFn },
    );
    expect(daily["2026-04-20"]).toBe(201);
    expect(total).toBe(201);
  });

  it("respects txSplits when bucketing by date", () => {
    const dateSet = new Set(["2026-04-20"]);
    const { daily } = calcFinykSpendingByDate(
      [tx({ id: "a", amount: -100_000 })],
      {
        dateSet,
        localDateKeyFn,
        txSplits: { a: [{ categoryId: "food", amount: 400 }] },
      },
    );
    expect(daily["2026-04-20"]).toBe(400);
  });
});
