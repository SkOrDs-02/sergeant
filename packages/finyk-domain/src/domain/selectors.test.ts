import { describe, expect, it } from "vitest";
import { INTERNAL_TRANSFER_ID } from "../constants";
import {
  computeCategorySpendIndex,
  formatComparisonSummary,
  getCategoryDistribution,
  getCurrentVsPreviousComparison,
  getMonthlySpendSeries,
  getMonthlySummary,
  getTopCategories,
  getTopMerchants,
  getTrendComparison,
  selectCategoryDistributionFromIndex,
  selectTopCategoriesFromIndex,
} from "./selectors";
import type { Category, Transaction } from "./types";

function tx(
  id: string,
  amount: number,
  date: Date,
  description = "АТБ",
  mcc = 5411,
): Transaction {
  return {
    id,
    amount,
    date: date.toISOString().slice(0, 10),
    categoryId: "",
    type: amount < 0 ? "expense" : "income",
    source: "manual",
    time: Math.floor(date.getTime() / 1000),
    description,
    mcc,
    accountId: null,
    manual: true,
    _source: "manual",
    _accountId: null,
    _manual: true,
  };
}

const jan = new Date(2026, 0, 15, 12);
const feb = new Date(2026, 1, 15, 12);
const customCategories: Category[] = [
  { id: "rent", label: "Rent", color: "#123456", keywords: ["rent"] },
  { id: "fun", label: "Fun", color: "#abcdef" },
];

describe("finyk selectors", () => {
  it("summarizes by month, exclusions and split-adjusted spend", () => {
    const transactions = [
      tx("jan-food", -10_000, jan, "АТБ", 5411),
      tx("jan-income", 25_000, jan, "Salary", 0),
      tx("feb-food", -5_000, feb, "АТБ", 5411),
      tx("excluded", -4_000, jan, "Cafe", 5812),
    ];

    expect(getMonthlySummary(null)).toEqual({
      spent: 0,
      income: 0,
      balance: 0,
      txCount: 0,
      totalExpense: 0,
      totalIncome: 0,
    });

    expect(
      getMonthlySummary(transactions, {
        month: "2026-01",
        excludedTxIds: ["excluded"],
        txSplits: {
          "jan-food": [
            { categoryId: "food", amount: 70 },
            { categoryId: INTERNAL_TRANSFER_ID, amount: 30 },
          ],
        },
      }),
    ).toMatchObject({
      spent: 70,
      income: 250,
      balance: 180,
      txCount: 2,
    });

    expect(
      getMonthlySummary(transactions, { month: { year: 2026, month: 2 } }),
    ).toMatchObject({ spent: 50, income: 0, txCount: 1 });
    expect(getMonthlySummary(transactions, { month: "bad" })).toMatchObject({
      spent: 190,
      income: 250,
      txCount: 4,
    });
  });

  it("builds category indexes, top categories and distributions", () => {
    const transactions = [
      tx("split", -20_000, jan, "Rent payment", 0),
      tx("food", -5_000, jan, "АТБ", 5411),
      tx("income", 10_000, jan, "Salary", 0),
      tx("outside", -9_000, feb, "Cafe", 5812),
    ];
    const index = computeCategorySpendIndex(transactions, {
      customCategories,
      txCategories: { food: "fun" },
      txSplits: {
        split: [
          { categoryId: "rent", amount: 150 },
          { categoryId: INTERNAL_TRANSFER_ID, amount: 50 },
          { categoryId: "", amount: 10 },
        ],
      },
      month: "2026-01",
    });

    expect(index).toEqual({
      catSpend: { rent: 150, fun: 50 },
      totalSpent: 200,
    });
    expect(selectTopCategoriesFromIndex(index, customCategories, 1)).toEqual([
      expect.objectContaining({ categoryId: "rent", spent: 150, pct: 75 }),
    ]);
    expect(getTopCategories(transactions, 2).map((c) => c.spent)).toEqual([
      200, 90,
    ]);
    expect(
      getCategoryDistribution(transactions, { customCategories }).length,
    ).toBeGreaterThan(0);
    expect(
      selectCategoryDistributionFromIndex({
        catSpend: { rent: 0 },
        totalSpent: 0,
      }),
    ).toEqual([
      expect.objectContaining({ categoryId: "rent", spent: 0, pct: 0 }),
    ]);
  });

  it("compares trends and formats summary copy directions", () => {
    const current = [tx("current", -20_000, feb), tx("income", 30_000, feb)];
    const previous = [tx("prev", -10_000, jan), tx("prev-income", 20_000, jan)];
    const comparison = getTrendComparison(current, previous);

    expect(comparison).toMatchObject({
      currentSpent: 200,
      prevSpent: 100,
      diff: 100,
      diffPct: 100,
      currentIncome: 300,
      prevIncome: 200,
      incomeDiff: 100,
      incomeDiffPct: 50,
    });
    expect(formatComparisonSummary(comparison).direction).toBe("up");
    expect(
      formatComparisonSummary({ ...comparison, diff: -50, diffPct: -50 })
        .direction,
    ).toBe("down");
    expect(formatComparisonSummary({ ...comparison, diff: 0 }).direction).toBe(
      "equal",
    );
    expect(
      formatComparisonSummary({
        ...comparison,
        prevSpent: 0,
        currentSpent: 0,
      }).direction,
    ).toBe("no_prev");
    expect(
      formatComparisonSummary({
        ...comparison,
        prevSpent: 0,
        currentSpent: 10,
      }).direction,
    ).toBe("no_prev");
    expect(formatComparisonSummary(null).direction).toBe("no_prev");
    expect(getTrendComparison(current, [])).toMatchObject({ diffPct: null });
  });

  it("compares current and previous months from one transaction list", () => {
    const transactions = [
      tx("dec", -7_000, new Date(2025, 11, 15, 12)),
      tx("jan", -10_000, jan),
      tx("feb", -20_000, feb),
    ];

    expect(
      getCurrentVsPreviousComparison(transactions, {
        currentMonth: "2026-02",
      }),
    ).toMatchObject({
      currentMonth: "2026-02",
      previousMonth: "2026-01",
      currentSpent: 200,
      prevSpent: 100,
    });
    expect(
      getCurrentVsPreviousComparison(transactions, {
        currentMonth: { year: 2026, month: 1 },
      }),
    ).toMatchObject({
      currentMonth: "2026-01",
      previousMonth: "2025-12",
      currentSpent: 100,
      prevSpent: 70,
    });
    expect(
      getCurrentVsPreviousComparison(transactions, {
        currentMonth: "bad",
        previousMonth: { year: 2026, month: 1 },
        now: new Date(2026, 1, 20, 12),
      }),
    ).toMatchObject({ currentMonth: "2026-02", previousMonth: "2026-01" });
  });

  it("groups top merchants and builds monthly spend series", () => {
    const transactions = [
      tx("atb-1", -10_000, jan, "АТБ"),
      tx("atb-2", -15_000, jan, " атб  "),
      tx("split", -20_000, jan, "Landlord"),
      tx("blank", -5_000, jan, "   "),
      tx("income", 25_000, jan, "Salary"),
      tx("feb", -9_000, feb, "Cafe", 5812),
    ];

    expect(
      getTopMerchants(transactions, {
        month: "2026-01",
        txSplits: {
          split: [
            { categoryId: "rent", amount: 120 },
            { categoryId: INTERNAL_TRANSFER_ID, amount: 80 },
          ],
        },
      }),
    ).toEqual([
      { name: "АТБ", count: 2, total: 250 },
      { name: "Landlord", count: 1, total: 120 },
    ]);
    expect(getTopMerchants(transactions, 1)).toHaveLength(1);
    expect(
      getTopMerchants(
        transactions,
        { excludedTxIds: new Set(["atb-1"]) },
        2,
      )[0],
    ).toMatchObject({ name: "Landlord" });

    expect(
      getMonthlySpendSeries([
        {
          month: "2026-01",
          transactions,
          excludedTxIds: ["blank"],
        },
        { month: "bad", transactions: null as unknown as Transaction[] },
      ]),
    ).toEqual([
      expect.objectContaining({ month: "2026-01", spent: 540, income: 250 }),
      { month: "bad", label: "bad", spent: 0, income: 0 },
    ]);
    expect(getMonthlySpendSeries(null)).toEqual([]);
  });
});
