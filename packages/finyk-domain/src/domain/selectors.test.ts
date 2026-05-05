import { describe, it, expect } from "vitest";
import {
  computeCategorySpendIndex,
  formatComparisonSummary,
  getCategoryDistribution,
  getCurrentVsPreviousComparison,
  getMonthlySummary,
  getTopMerchants,
} from "./selectors";
import type { Transaction } from "./types";
import { INTERNAL_TRANSFER_ID } from "../constants";

// Minimal tx factory — fills only the fields our aggregation actually reads
// (`time`, `amount`, `id`) so tests stay readable and focused.
function tx(
  id: string,
  isoDate: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    amount,
    time: Math.floor(new Date(isoDate).getTime() / 1000),
    date: isoDate,
    description: "",
    mcc: 0,
    accountId: null,
    manual: false,
    categoryId: "misc",
    type: amount < 0 ? "expense" : "income",
    source: "manual",
    _source: "manual",
    _accountId: null,
    _manual: false,
    ...extra,
  };
}

describe("getCurrentVsPreviousComparison", () => {
  it("compares current and previous calendar months by default", () => {
    const txs = [
      // Березень 2025 — поточний
      tx("c1", "2025-03-05T10:00:00Z", -50000),
      tx("c2", "2025-03-15T10:00:00Z", -30000),
      tx("c3", "2025-03-20T10:00:00Z", 400000),
      // Лютий 2025 — попередній
      tx("p1", "2025-02-10T10:00:00Z", -40000),
      tx("p2", "2025-02-20T10:00:00Z", -20000),
      tx("p3", "2025-02-25T10:00:00Z", 300000),
      // Січень — ігнорується
      tx("j1", "2025-01-10T10:00:00Z", -99999),
    ];
    const result = getCurrentVsPreviousComparison(txs, {
      now: new Date("2025-03-21T00:00:00Z"),
    });

    expect(result.currentMonth).toBe("2025-03");
    expect(result.previousMonth).toBe("2025-02");
    expect(result.currentSpent).toBe(800);
    expect(result.prevSpent).toBe(600);
    expect(result.diff).toBe(200);
    expect(result.diffPct).toBe(33);
    expect(result.currentIncome).toBe(4000);
    expect(result.prevIncome).toBe(3000);
    expect(result.incomeDiff).toBe(1000);
    expect(result.incomeDiffPct).toBe(33);
  });

  it("wraps from January back to previous December", () => {
    const txs = [
      tx("c", "2025-01-15T10:00:00Z", -10000),
      tx("p", "2024-12-15T10:00:00Z", -20000),
    ];
    const result = getCurrentVsPreviousComparison(txs, {
      now: new Date("2025-01-20T00:00:00Z"),
    });
    expect(result.currentMonth).toBe("2025-01");
    expect(result.previousMonth).toBe("2024-12");
    expect(result.currentSpent).toBe(100);
    expect(result.prevSpent).toBe(200);
    expect(result.diff).toBe(-100);
    expect(result.diffPct).toBe(-50);
  });

  it("returns null diffPct when there is no previous-month spend", () => {
    const txs = [tx("c", "2025-03-05T10:00:00Z", -10000)];
    const result = getCurrentVsPreviousComparison(txs, {
      now: new Date("2025-03-10T00:00:00Z"),
    });
    expect(result.prevSpent).toBe(0);
    expect(result.diffPct).toBeNull();
    expect(result.incomeDiffPct).toBeNull();
  });

  it("respects excludedTxIds in both periods", () => {
    const txs = [
      tx("c1", "2025-03-05T10:00:00Z", -50000),
      tx("c2", "2025-03-15T10:00:00Z", -30000),
      tx("p1", "2025-02-10T10:00:00Z", -40000),
      tx("p2", "2025-02-20T10:00:00Z", -20000),
    ];
    const result = getCurrentVsPreviousComparison(txs, {
      now: new Date("2025-03-21T00:00:00Z"),
      excludedTxIds: new Set(["c2", "p2"]),
    });
    expect(result.currentSpent).toBe(500);
    expect(result.prevSpent).toBe(400);
    expect(result.diff).toBe(100);
  });

  it("accepts explicit currentMonth/previousMonth overrides", () => {
    const txs = [
      tx("c", "2024-07-05T10:00:00Z", -10000),
      tx("p", "2024-05-05T10:00:00Z", -5000),
    ];
    const result = getCurrentVsPreviousComparison(txs, {
      currentMonth: "2024-07",
      previousMonth: "2024-05",
    });
    expect(result.currentMonth).toBe("2024-07");
    expect(result.previousMonth).toBe("2024-05");
    expect(result.currentSpent).toBe(100);
    expect(result.prevSpent).toBe(50);
    expect(result.diffPct).toBe(100);
  });
});

describe("formatComparisonSummary", () => {
  it("describes an increase with sign and percent", () => {
    const summary = formatComparisonSummary({
      currentSpent: 1200,
      prevSpent: 1000,
      diff: 200,
      diffPct: 20,
    });
    expect(summary.direction).toBe("up");
    expect(summary.text).toContain("більше");
    expect(summary.text).toContain("20%");
  });

  it("describes a decrease", () => {
    const summary = formatComparisonSummary({
      currentSpent: 800,
      prevSpent: 1000,
      diff: -200,
      diffPct: -20,
    });
    expect(summary.direction).toBe("down");
    expect(summary.text).toContain("менше");
    expect(summary.text).toContain("20%");
  });

  it("handles zero diff", () => {
    const summary = formatComparisonSummary({
      currentSpent: 500,
      prevSpent: 500,
      diff: 0,
      diffPct: 0,
    });
    expect(summary.direction).toBe("equal");
    expect(summary.text).toMatch(/такі сам/);
  });

  it("handles missing previous data", () => {
    const summary = formatComparisonSummary({
      currentSpent: 500,
      prevSpent: 0,
      diff: 500,
      diffPct: null,
    });
    expect(summary.direction).toBe("no_prev");
  });

  it("uses provided prevLabel in the sentence", () => {
    const summary = formatComparisonSummary(
      { currentSpent: 1200, prevSpent: 1000, diff: 200, diffPct: 20 },
      { prevLabel: "лютого 2025" },
    );
    expect(summary.text).toContain("лютого 2025");
  });

  it("returns no_prev when comparison itself is null", () => {
    const summary = formatComparisonSummary(null);
    expect(summary.direction).toBe("no_prev");
  });
});

describe("computeCategorySpendIndex — internal transfers", () => {
  it("виключає tx, що повністю позначений внутрішнім переказом (через excludedTxIds)", () => {
    const txs = [
      tx("t1", "2025-03-05T10:00:00Z", -50000),
      tx("t2", "2025-03-10T10:00:00Z", -20000),
    ];
    const index = computeCategorySpendIndex(txs, {
      excludedTxIds: new Set(["t2"]),
      txCategories: { t2: INTERNAL_TRANSFER_ID },
    });
    expect(index.totalSpent).toBe(500);
    expect(index.catSpend[INTERNAL_TRANSFER_ID]).toBeUndefined();
  });

  it("ігнорує спліт-частку з internal_transfer, узгоджено з getTxStatAmount", () => {
    const txs = [tx("t1", "2025-03-05T10:00:00Z", -50000)];
    const splits = {
      t1: [
        { amount: 300, categoryId: "food" },
        { amount: 200, categoryId: INTERNAL_TRANSFER_ID },
      ],
    };
    const index = computeCategorySpendIndex(txs, { txSplits: splits });
    expect(index.catSpend["food"]).toBe(300);
    expect(index.catSpend[INTERNAL_TRANSFER_ID]).toBeUndefined();
    expect(index.totalSpent).toBe(300);
  });

  it("пай 'Категорії' збігається з витратами з 'Підсумку місяця' для сплітів з переказом", () => {
    const txs = [tx("t1", "2025-03-05T10:00:00Z", -50000)];
    const splits = {
      t1: [
        { amount: 300, categoryId: "food" },
        { amount: 200, categoryId: INTERNAL_TRANSFER_ID },
      ],
    };
    const summary = getMonthlySummary(txs, { txSplits: splits });
    const distribution = getCategoryDistribution(txs, { txSplits: splits });
    const distTotal = distribution.reduce((s, c) => s + c.spent, 0);
    expect(distTotal).toBe(summary.spent);
    expect(
      distribution.some((c) => c.categoryId === INTERNAL_TRANSFER_ID),
    ).toBe(false);
  });
});

describe("getTopMerchants", () => {
  it("без сплітів агрегує повну суму транзакції по мерчанту", () => {
    const txs = [
      tx("a1", "2025-03-05T10:00:00Z", -50000, { description: "АТБ" }),
      tx("a2", "2025-03-15T10:00:00Z", -30000, { description: "атб  " }),
      tx("r1", "2025-03-20T10:00:00Z", -100000, { description: "Ранчо" }),
    ];
    const merchants = getTopMerchants(txs);
    expect(merchants[0]).toMatchObject({
      name: "Ранчо",
      total: 1000,
      count: 1,
    });
    expect(merchants[1]).toMatchObject({ name: "АТБ", total: 800, count: 2 });
  });

  it("для сплітованих транзакцій рахує лише чисту частку користувача", () => {
    // 14 000 ₴ оренда з карти — своя частка 6 000 ₴, повернення від хлопців
    // трактуються як internal_transfer. У Топ мерчантах має показатись 6 000 ₴,
    // а не 14 000, щоб цифри збігалися з «Підсумком місяця» та «Категоріями».
    const txs = [
      tx("rent", "2025-03-01T10:00:00Z", -1400000, {
        description: "536354****8294",
      }),
      tx("food", "2025-03-05T10:00:00Z", -50000, { description: "АТБ" }),
    ];
    const splits = {
      rent: [
        { amount: 6000, categoryId: "housing" },
        { amount: 8000, categoryId: INTERNAL_TRANSFER_ID },
      ],
    };
    const merchants = getTopMerchants(txs, { txSplits: splits });
    expect(merchants[0]).toMatchObject({
      name: "536354****8294",
      total: 6000,
      count: 1,
    });
    expect(merchants[1]).toMatchObject({ name: "АТБ", total: 500, count: 1 });
  });

  it("пропускає мерчанта, якщо після сплітів чиста частка = 0", () => {
    // Вся сума транзакції — внутрішній переказ (повністю повернули),
    // тож такий «мерчант» не має потрапляти в топ.
    const txs = [
      tx("t1", "2025-03-01T10:00:00Z", -500000, { description: "Monobank" }),
      tx("t2", "2025-03-05T10:00:00Z", -10000, { description: "АТБ" }),
    ];
    const splits = {
      t1: [{ amount: 5000, categoryId: INTERNAL_TRANSFER_ID }],
    };
    const merchants = getTopMerchants(txs, { txSplits: splits });
    expect(merchants).toHaveLength(1);
    expect(merchants[0]?.name).toBe("АТБ");
  });

  it("сума топ-мерчантів узгоджена з витратами 'Підсумку місяця' для сплітованих витрат", () => {
    const txs = [
      tx("rent", "2025-03-01T10:00:00Z", -1400000, { description: "Оренда" }),
      tx("food", "2025-03-05T10:00:00Z", -50000, { description: "АТБ" }),
    ];
    const splits = {
      rent: [
        { amount: 6000, categoryId: "housing" },
        { amount: 8000, categoryId: INTERNAL_TRANSFER_ID },
      ],
    };
    const summary = getMonthlySummary(txs, { txSplits: splits });
    const merchants = getTopMerchants(txs, { txSplits: splits });
    const merchantsTotal = merchants.reduce((s, m) => s + m.total, 0);
    expect(merchantsTotal).toBe(summary.spent);
  });

  it("поважає excludedTxIds", () => {
    const txs = [
      tx("a", "2025-03-01T10:00:00Z", -10000, { description: "АТБ" }),
      tx("b", "2025-03-02T10:00:00Z", -20000, { description: "Ранчо" }),
    ];
    const merchants = getTopMerchants(txs, {
      excludedTxIds: new Set(["b"]),
    });
    expect(merchants).toHaveLength(1);
    expect(merchants[0]?.name).toBe("АТБ");
  });
});
