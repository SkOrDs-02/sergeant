// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFinanceContext } from "./financeContext";

// Fixed clock so monthStart is deterministic across runs.
const FIXED_NOW = new Date("2026-04-15T10:30:00.000Z");

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("buildFinanceContext — defaults", () => {
  it("returns sane empty defaults when no LS data is present", () => {
    const ctx = buildFinanceContext();
    expect(ctx.now.toISOString()).toBe(FIXED_NOW.toISOString());
    expect(ctx.monthStart.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(ctx.transactions).toEqual([]);
    expect(ctx.manualExpenses).toEqual([]);
    expect(ctx.budgets).toEqual([]);
    expect(ctx.limits).toEqual([]);
    expect(ctx.txCategories).toEqual({});
    expect(ctx.customCategories).toEqual([]);
    expect(ctx.hiddenTxIds.size).toBe(0);
    expect(ctx.transferIds.size).toBe(0);
    expect(ctx.thisMonthTx).toEqual([]);
    expect(ctx.categorySpend).toEqual({});
    expect(ctx.canonicalMonthSpend.size).toBe(0);
    expect(ctx.canonicalTotalCount.size).toBe(0);
  });

  it("monthStart is local first-of-month at 00:00", () => {
    const { monthStart } = buildFinanceContext();
    expect(monthStart.getDate()).toBe(1);
    expect(monthStart.getHours()).toBe(0);
    expect(monthStart.getMinutes()).toBe(0);
    expect(monthStart.getSeconds()).toBe(0);
  });
});

describe("buildFinanceContext — transactions cache shapes", () => {
  it("supports the legacy { txs: […] } cache shape", () => {
    const tx = { id: "t1", amount: -1500, time: FIXED_NOW.getTime() };
    localStorage.setItem("finyk_tx_cache", JSON.stringify({ txs: [tx] }));
    const ctx = buildFinanceContext();
    expect(ctx.transactions).toEqual([tx]);
  });

  it("supports a bare-array cache shape", () => {
    const tx = { id: "t1", amount: -1500, time: FIXED_NOW.getTime() };
    localStorage.setItem("finyk_tx_cache", JSON.stringify([tx]));
    const ctx = buildFinanceContext();
    expect(ctx.transactions).toEqual([tx]);
  });

  it("falls back to empty array when cache is malformed JSON", () => {
    localStorage.setItem("finyk_tx_cache", "{not-json");
    const ctx = buildFinanceContext();
    expect(ctx.transactions).toEqual([]);
  });
});

describe("buildFinanceContext — thisMonthTx filtering", () => {
  it("filters out transactions before monthStart", () => {
    const monthStartMs = new Date("2026-04-01T00:00:00.000Z").getTime();
    const txs = [
      { id: "before", amount: -100, time: monthStartMs - 86_400_000 },
      { id: "in", amount: -200, time: monthStartMs + 86_400_000 },
    ];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["in"]);
  });

  it("excludes hidden transactions", () => {
    const txs = [
      { id: "visible", amount: -100, time: FIXED_NOW.getTime() },
      { id: "hidden", amount: -200, time: FIXED_NOW.getTime() },
    ];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["hidden"]));
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["visible"]);
    expect(ctx.hiddenTxIds.has("hidden")).toBe(true);
  });

  it("excludes internal_transfer transactions and exposes transferIds", () => {
    const txs = [
      { id: "spend", amount: -100, time: FIXED_NOW.getTime() },
      { id: "transfer", amount: -1000, time: FIXED_NOW.getTime() },
    ];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    localStorage.setItem(
      "finyk_tx_cats",
      JSON.stringify({ transfer: "internal_transfer" }),
    );
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["spend"]);
    expect(ctx.transferIds.has("transfer")).toBe(true);
  });

  it("interprets unix-second time stamps via txTimestamp heuristic", () => {
    // FIXED_NOW = 2026-04-15 → seconds form below is well after monthStart.
    const seconds = Math.floor(FIXED_NOW.getTime() / 1000);
    const txs = [{ id: "in", amount: -100, time: seconds }];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["in"]);
  });
});

describe("buildFinanceContext — categorySpend (legacy)", () => {
  it("aggregates negative-amount transactions by override category", () => {
    const txs = [
      { id: "t1", amount: -10000, time: FIXED_NOW.getTime() }, // 100 UAH
      { id: "t2", amount: -5000, time: FIXED_NOW.getTime() }, // 50 UAH
      { id: "income", amount: 30000, time: FIXED_NOW.getTime() }, // ignored (positive)
    ];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    localStorage.setItem(
      "finyk_tx_cats",
      JSON.stringify({ t1: "food", t2: "food" }),
    );
    const ctx = buildFinanceContext();
    expect(ctx.categorySpend.food).toBe(150);
  });

  it("falls back to category 'other' when no override exists", () => {
    const txs = [{ id: "t1", amount: -10000, time: FIXED_NOW.getTime() }];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    const ctx = buildFinanceContext();
    expect(ctx.categorySpend.other).toBe(100);
  });

  it("uses txSplits to distribute amounts across split categoryIds", () => {
    const txs = [{ id: "t1", amount: -20000, time: FIXED_NOW.getTime() }];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        t1: [
          { categoryId: "food", amount: 80 },
          { categoryId: "shopping", amount: 120 },
        ],
      }),
    );
    const ctx = buildFinanceContext();
    expect(ctx.categorySpend.food).toBe(80);
    expect(ctx.categorySpend.shopping).toBe(120);
  });

  it("ignores split entries marked as internal_transfer", () => {
    const txs = [{ id: "t1", amount: -20000, time: FIXED_NOW.getTime() }];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        t1: [
          { categoryId: "food", amount: 100 },
          { categoryId: "internal_transfer", amount: 100 },
        ],
      }),
    );
    const ctx = buildFinanceContext();
    expect(ctx.categorySpend.food).toBe(100);
    expect(ctx.categorySpend.internal_transfer).toBeUndefined();
  });

  it("adds manual expenses inside current month to categorySpend", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        { id: "m1", amount: 25, date: "2026-04-10", category: "food" },
        { id: "m2", amount: 99, date: "2026-03-28", category: "food" },
      ]),
    );
    const ctx = buildFinanceContext();
    expect(ctx.categorySpend.food).toBe(25);
  });

  it("manual expense without category falls back to 'other'", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([{ id: "m1", amount: 40, date: "2026-04-10" }]),
    );
    const ctx = buildFinanceContext();
    expect(ctx.categorySpend.other).toBe(40);
  });
});

describe("buildFinanceContext — canonical aggregations", () => {
  it("counts every spend transaction (across all months) into canonicalTotalCount", () => {
    const monthStartMs = new Date("2026-04-01T00:00:00.000Z").getTime();
    const txs = [
      // pre-month spend should still count toward total counter
      {
        id: "old",
        amount: -100,
        time: monthStartMs - 30 * 86_400_000,
        description: "АТБ",
        mcc: 5411,
      },
      {
        id: "new",
        amount: -100,
        time: monthStartMs + 86_400_000,
        description: "АТБ",
        mcc: 5411,
      },
    ];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    const ctx = buildFinanceContext();
    // Both transactions categorize via MCC 5411 → "food"; counter should be 2.
    expect(ctx.canonicalTotalCount.get("food")).toBe(2);
  });

  it("does not count positive amounts (income) in canonicalTotalCount", () => {
    const txs = [
      {
        id: "income",
        amount: 5000,
        time: FIXED_NOW.getTime(),
        description: "Salary",
      },
    ];
    localStorage.setItem("finyk_tx_cache", JSON.stringify(txs));
    const ctx = buildFinanceContext();
    expect(ctx.canonicalTotalCount.size).toBe(0);
  });

  it("includes manual expenses in canonicalTotalCount via Ukrainian label mapping", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        { id: "m1", amount: 10, date: "2026-04-10", category: "їжа" },
      ]),
    );
    const ctx = buildFinanceContext();
    expect(ctx.canonicalTotalCount.get("food")).toBe(1);
  });

  it("excludes manual transfers from canonicalTotalCount", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        {
          id: "m1",
          amount: 10,
          date: "2026-04-10",
          category: "internal_transfer",
        },
      ]),
    );
    const ctx = buildFinanceContext();
    // "internal_transfer" maps to itself (no entry in MANUAL_CATEGORY_ID_MAP),
    // and the rule below skips internal_transfer keys explicitly.
    expect(ctx.canonicalTotalCount.has("internal_transfer")).toBe(false);
  });
});

describe("buildFinanceContext — budgets", () => {
  it("filters limits from the full budgets list", () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        { id: "b1", type: "limit", categoryId: "food", limit: 500 },
        { id: "b2", type: "goal", categoryId: "savings", limit: 1000 },
        { id: "b3", type: "limit", categoryId: "transport", limit: 200 },
      ]),
    );
    const ctx = buildFinanceContext();
    expect(ctx.budgets).toHaveLength(3);
    expect(ctx.limits.map((b) => b.id)).toEqual(["b1", "b3"]);
  });

  it("returns empty arrays when budgets LS is malformed", () => {
    localStorage.setItem("finyk_budgets", "not-json");
    const ctx = buildFinanceContext();
    expect(ctx.budgets).toEqual([]);
    expect(ctx.limits).toEqual([]);
  });
});
