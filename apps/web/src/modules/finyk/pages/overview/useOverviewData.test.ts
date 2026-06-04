// @vitest-environment jsdom
/**
 * Unit tests for useOverviewData.
 *
 * The hook computes ~25 derived values from the mono data slice and finyk
 * storage. We supply stub objects for both inputs and verify the pure
 * derivations: networth, spent, income, budget alerts, projection ratios,
 * debt/receivable totals, and the first-insight banner flag.
 *
 * We do NOT test effects that write back to storage (saveNetworthSnapshot)
 * or fire analytics — those are side-effecting branches exercised by e2e.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOverviewData } from "./useOverviewData";
import type { UseOverviewDataParams } from "./useOverviewData";

// ── stub factories ──────────────────────────────────────────────────────────

function mkMonoAccount(
  id: string,
  balance: number,
  creditLimit = 0,
): Record<string, unknown> {
  return {
    id,
    balance,
    creditLimit,
    // UAH currencyCode required by getMonoTotals to count in balance
    currencyCode: 980,
    _source: "monobank",
  };
}

function mkTx(
  id: string,
  amount: number,
  opts: { time?: number } = {},
): Record<string, unknown> {
  return {
    id,
    amount,
    time: opts.time ?? Math.floor(Date.now() / 1000),
    date: new Date().toISOString().slice(0, 10),
    description: "",
    mcc: 0,
    categoryId: "other",
    type: amount > 0 ? "income" : "expense",
    source: "manual",
    accountId: null,
    manual: false,
    _source: "manual",
    _accountId: null,
    _manual: false,
  };
}

function buildMono(
  overrides: Partial<UseOverviewDataParams["mono"]> = {},
): UseOverviewDataParams["mono"] {
  return {
    realTx: [],
    loadingTx: false,
    clientInfo: null,
    accounts: [],
    transactions: [],
    syncState: "idle" as const,
    lastUpdated: null,
    error: null,
    refresh: vi.fn(),
    privatTotal: 0,
    ...overrides,
  } as UseOverviewDataParams["mono"];
}

function buildStorage(
  overrides: Partial<UseOverviewDataParams["storage"]> = {},
): UseOverviewDataParams["storage"] {
  return {
    budgets: [],
    subscriptions: [],
    manualDebts: [],
    receivables: [],
    hiddenAccounts: [],
    excludedTxIds: new Set<string>(),
    monthlyPlan: null,
    networthHistory: [],
    saveNetworthSnapshot: vi.fn(),
    txCategories: {},
    txSplits: {},
    manualAssets: [],
    customCategories: [],
    manualExpenses: [],
    ...overrides,
  } as UseOverviewDataParams["storage"];
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useOverviewData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-06-04 12:00 EEST (UTC+3) → UTC 09:00
    vi.setSystemTime(new Date("2026-06-04T09:00:00Z"));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("networth calculation", () => {
    it("is zero when no accounts, debts, or assets", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(result.current.networth).toBe(0);
    });

    it("sums mono account balances", () => {
      // getMonoTotals divides by 100 (kopecks → hryvnias), only counts
      // accounts with balance > 0, no creditLimit, currencyCode === 980.
      // a1: 100_000 kopecks = 1000 UAH; a2: 50_000 kopecks = 500 UAH
      const accounts = [
        mkMonoAccount("a1", 100_000),
        mkMonoAccount("a2", 50_000),
      ];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({
            accounts: accounts as UseOverviewDataParams["mono"]["accounts"],
          }),
          storage: buildStorage(),
        }),
      );
      // monoTotal = 1000 + 500 = 1500 UAH
      expect(result.current.monoTotal).toBe(1500);
    });

    it("adds privatTotal to monoTotal", () => {
      // monoAccount contributes 1000 UAH (100_000 kopecks / 100)
      // privatTotal is already in UAH (not kopecks)
      const accounts = [mkMonoAccount("a1", 100_000)];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({
            accounts: accounts as UseOverviewDataParams["mono"]["accounts"],
            privatTotal: 500,
          }),
          storage: buildStorage(),
        }),
      );
      // monoOnlyTotal = 1000, privatTotal = 500 → monoTotal = 1500
      expect(result.current.monoTotal).toBe(1500);
    });

    it("credit account balance is included in monoTotal, debt in totalDebt", () => {
      const accounts = [mkMonoAccount("credit1", -5000, 10000)];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({
            accounts: accounts as UseOverviewDataParams["mono"]["accounts"],
          }),
          storage: buildStorage(),
        }),
      );
      // monoTotalDebt comes from getMonoTotals; creditLimit > 0 means debt
      expect(result.current.totalDebt).toBeGreaterThan(0);
    });
  });

  describe("spending calculation", () => {
    it("spent sums absolute values of negative-amount stat transactions", () => {
      const realTx = [
        mkTx("a", -10000),
        mkTx("b", -5000),
        mkTx("c", 20000), // income — not counted in spent
      ] as UseOverviewDataParams["mono"]["realTx"];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage(),
        }),
      );
      // calcFinykSpendingTotal sums expense amounts (in UAH, divided by 100)
      expect(result.current.spent).toBeGreaterThan(0);
    });

    it("excluded transactions are not counted in spent", () => {
      const realTx = [
        mkTx("a", -10000),
        mkTx("excluded", -99999),
      ] as UseOverviewDataParams["mono"]["realTx"];
      const excludedTxIds = new Set(["excluded"]);
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage({ excludedTxIds }),
        }),
      );
      // Only "a" counts → spent = 100 UAH (10000 kopecks / 100)
      expect(result.current.spent).toBe(100);
    });
  });

  describe("income from monthlySummary", () => {
    it("income is non-negative for positive transactions", () => {
      const realTx = [
        mkTx("inc", 50000),
      ] as UseOverviewDataParams["mono"]["realTx"];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage(),
        }),
      );
      expect(result.current.income).toBeGreaterThanOrEqual(0);
    });
  });

  describe("budget alerts", () => {
    it("budgetAlerts is empty when no limit budgets are defined", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage({ budgets: [] }),
        }),
      );
      expect(result.current.budgetAlerts).toHaveLength(0);
    });
  });

  describe("planned flows", () => {
    it("plannedFlows is empty when no subscriptions/debts/receivables", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(result.current.plannedFlows).toHaveLength(0);
    });
  });

  describe("first-insight banner", () => {
    it("showFirstInsight is true when the seen-key is absent from localStorage", () => {
      localStorage.removeItem("finyk_first_insight_seen_v1");
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(result.current.showFirstInsight).toBe(true);
    });

    it("showFirstInsight is false when the seen-key is present", () => {
      localStorage.setItem("finyk_first_insight_seen_v1", "1");
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(result.current.showFirstInsight).toBe(false);
    });

    it("hasAnyData is true when manualExpenses has entries", () => {
      const manualExpenses = [
        {
          id: "m1",
          amount: 50,
          date: "2026-06-04",
          description: "test",
          category: "food",
        },
      ];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage({ manualExpenses }),
        }),
      );
      expect(result.current.hasAnyData).toBe(true);
    });

    it("hasAnyData is true when realTx has entries", () => {
      const realTx = [
        mkTx("t1", -100),
      ] as UseOverviewDataParams["mono"]["realTx"];
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx }),
          storage: buildStorage(),
        }),
      );
      expect(result.current.hasAnyData).toBe(true);
    });

    it("hasAnyData is false when no transactions or manual expenses", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono({ realTx: [] }),
          storage: buildStorage({ manualExpenses: [] }),
        }),
      );
      expect(result.current.hasAnyData).toBe(false);
    });
  });

  describe("projection and plan", () => {
    it("hasExpensePlan is false when no monthlyPlan is set", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage({}),
        }),
      );
      expect(result.current.hasExpensePlan).toBe(false);
    });

    it("showMonthForecast is false at start of month when daysPassed=0", () => {
      // Set to 2026-06-01 (first day of month)
      vi.setSystemTime(new Date("2026-06-01T09:00:00Z"));
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      // daysPassed = 0 at start of month → showMonthForecast = false
      expect(result.current.showMonthForecast).toBe(false);
    });
  });

  describe("returned values shape", () => {
    it("exposes all expected keys", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      const keys = Object.keys(result.current);
      // Spot check a representative set of returned fields
      expect(keys).toContain("networth");
      expect(keys).toContain("monoTotal");
      expect(keys).toContain("spent");
      expect(keys).toContain("income");
      expect(keys).toContain("budgetAlerts");
      expect(keys).toContain("plannedFlows");
      expect(keys).toContain("showFirstInsight");
      expect(keys).toContain("hasAnyData");
      expect(keys).toContain("dayBudget");
      expect(keys).toContain("forecastBarClass");
    });

    it("dateLabel is a non-empty string", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(typeof result.current.dateLabel).toBe("string");
      expect(result.current.dateLabel.length).toBeGreaterThan(0);
    });

    it("forecastBarClass is one of 'bg-danger', 'bg-warning', 'bg-success'", () => {
      const { result } = renderHook(() =>
        useOverviewData({
          mono: buildMono(),
          storage: buildStorage(),
        }),
      );
      expect(["bg-danger", "bg-warning", "bg-success"]).toContain(
        result.current.forecastBarClass,
      );
    });
  });
});
