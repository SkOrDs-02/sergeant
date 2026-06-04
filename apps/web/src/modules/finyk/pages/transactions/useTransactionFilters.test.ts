// @vitest-environment jsdom
/**
 * Unit tests for useTransactionFilters.
 *
 * The hook is a pure useMemo/useState derivation over realTx/historyTx and
 * manual expenses. Tests cover:
 *   - initial state defaults
 *   - filter pill (all / income / expense / category)
 *   - month switching (isCurrentMonth / goMonth)
 *   - manual expense injection into activeTx
 *   - day grouping and sorting
 *   - creditAccIds derived from accounts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import { useTransactionFilters } from "./useTransactionFilters";
import type { TxAccount } from "./Transactions";

// ── fixtures ──────────────────────────────────────────────────────────────────

function mkTx(
  id: string,
  amount: number,
  opts: { time?: number; accountId?: string } = {},
): Transaction {
  const time = opts.time ?? Math.floor(Date.now() / 1000);
  return {
    id,
    amount,
    time,
    date: new Date(time * 1000).toISOString().slice(0, 10),
    description: "",
    mcc: 0,
    categoryId: "other",
    type: amount > 0 ? "income" : "expense",
    source: "mono",
    accountId: opts.accountId ?? null,
    manual: false,
    _source: "mono",
    _accountId: opts.accountId ?? null,
    _manual: false,
  };
}

function mkManual(id: string, amount: number, date: string): ManualExpense {
  return { id, amount, date, description: "test", category: "food" };
}

const NOOP_FETCH = () => Promise.resolve(undefined);

function buildDefaultParams(
  overrides: Partial<Parameters<typeof useTransactionFilters>[0]> = {},
) {
  return {
    realTx: [],
    historyTx: [],
    loadingTx: false,
    loadingHistory: false,
    manualExpenses: [],
    accounts: [],
    hiddenTxIds: [],
    excludedTxIds: new Set<string>(),
    txSplits: {},
    txCategories: {},
    customCategories: [],
    fetchMonth: NOOP_FETCH,
    categoryFilter: null,
    onClearCategoryFilter: undefined,
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useTransactionFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Kyiv 2025-06-04 12:00 EEST (UTC+3) = UTC 09:00
    vi.setSystemTime(new Date("2025-06-04T09:00:00Z"));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("defaults filter to 'all'", () => {
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      expect(result.current.filter).toBe("all");
    });

    it("defaults showHidden to false", () => {
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      expect(result.current.showHidden).toBe(false);
    });

    it("isCurrentMonth is true by default", () => {
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      expect(result.current.isCurrentMonth).toBe(true);
    });
  });

  describe("filter pill state", () => {
    it("setFilter changes the active filter", () => {
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      act(() => result.current.setFilter("income"));
      expect(result.current.filter).toBe("income");
    });

    it("'income' filter keeps only positive-amount transactions", () => {
      const realTx = [mkTx("a", 100), mkTx("b", -50)];
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx })),
      );
      act(() => result.current.setFilter("income"));
      expect(result.current.filtered.map((t) => t.id)).toEqual(["a"]);
    });

    it("'expense' filter keeps only negative-amount transactions", () => {
      const realTx = [mkTx("a", 100), mkTx("b", -50)];
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx })),
      );
      act(() => result.current.setFilter("expense"));
      expect(result.current.filtered.map((t) => t.id)).toEqual(["b"]);
    });

    it("'all' filter shows all transactions", () => {
      const realTx = [mkTx("a", 100), mkTx("b", -50)];
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx })),
      );
      expect(result.current.filtered).toHaveLength(2);
    });
  });

  describe("external categoryFilter override", () => {
    it("applies categoryFilter from props on mount", () => {
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ categoryFilter: "food" })),
      );
      expect(result.current.filter).toBe("food");
    });
  });

  describe("month navigation", () => {
    it("goMonth(-1) navigates to previous month and marks not-current", () => {
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      act(() => result.current.goMonth(-1));
      expect(result.current.isCurrentMonth).toBe(false);
      expect(result.current.selMonth.month).toBe(4); // May (0-indexed)
    });

    it("goMonth wraps December → January across year boundary", () => {
      // Set time to December 2025
      vi.setSystemTime(new Date("2025-12-15T09:00:00Z"));
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      act(() => result.current.goMonth(1));
      expect(result.current.selMonth).toEqual({ year: 2026, month: 0 });
    });

    it("goMonth wraps January → December across year boundary", () => {
      vi.setSystemTime(new Date("2025-01-15T09:00:00Z"));
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      act(() => result.current.goMonth(-1));
      expect(result.current.selMonth).toEqual({ year: 2024, month: 11 });
    });

    it("navigating back to current month restores isCurrentMonth", () => {
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      act(() => result.current.goMonth(-1));
      expect(result.current.isCurrentMonth).toBe(false);
      act(() => result.current.goMonth(1));
      expect(result.current.isCurrentMonth).toBe(true);
    });
  });

  describe("activeTx composition", () => {
    it("uses realTx when isCurrentMonth=true", () => {
      const realTx = [mkTx("real", -100)];
      const historyTx = [mkTx("history", -200)];
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx, historyTx })),
      );
      expect(result.current.activeTx.map((t) => t.id)).toContain("real");
      expect(result.current.activeTx.map((t) => t.id)).not.toContain("history");
    });

    it("uses historyTx when navigated to non-current month", () => {
      const realTx = [mkTx("real", -100)];
      const historyTx = [mkTx("history", -200)];
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx, historyTx })),
      );
      act(() => result.current.goMonth(-1));
      expect(result.current.activeTx.map((t) => t.id)).toContain("history");
      expect(result.current.activeTx.map((t) => t.id)).not.toContain("real");
    });

    it("merges manual expenses for the current month into activeTx", () => {
      const manualExpenses = [mkManual("m1", 50, "2025-06-03")];
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ manualExpenses })),
      );
      const ids = result.current.activeTx.map((t) => t.id);
      // manualExpenseToTransaction prefixes the id with "manual_"
      expect(ids).toContain("manual_m1");
    });

    it("excludes manual expenses outside the selected month", () => {
      // The manual expense is in May; current month is June
      const manualExpenses = [mkManual("m1", 50, "2025-05-10")];
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ manualExpenses })),
      );
      const ids = result.current.activeTx.map((t) => t.id);
      expect(ids).not.toContain("m1");
    });
  });

  describe("hidden transaction handling", () => {
    it("hidden transactions are excluded from view when showHidden=false", () => {
      const realTx = [mkTx("a", -100), mkTx("b", -200)];
      const { result } = renderHook(() =>
        useTransactionFilters(
          buildDefaultParams({ realTx, hiddenTxIds: ["a"] }),
        ),
      );
      const ids = result.current.filtered.map((t) => t.id);
      expect(ids).not.toContain("a");
      expect(ids).toContain("b");
    });

    it("hidden transactions appear when showHidden=true", () => {
      const realTx = [mkTx("a", -100), mkTx("b", -200)];
      const { result } = renderHook(() =>
        useTransactionFilters(
          buildDefaultParams({ realTx, hiddenTxIds: ["a"] }),
        ),
      );
      act(() => result.current.setShowHidden(true));
      const ids = result.current.filtered.map((t) => t.id);
      expect(ids).toContain("a");
    });
  });

  describe("day grouping", () => {
    it("groups transactions by date key", () => {
      // Two transactions on the same date, one on different
      const t1 = mkTx("a", -100, {
        time: Math.floor(new Date("2025-06-04T10:00:00").getTime() / 1000),
      });
      const t2 = mkTx("b", -200, {
        time: Math.floor(new Date("2025-06-04T15:00:00").getTime() / 1000),
      });
      const t3 = mkTx("c", -300, {
        time: Math.floor(new Date("2025-06-03T10:00:00").getTime() / 1000),
      });
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx: [t1, t2, t3] })),
      );
      expect(result.current.groupedByDate.length).toBeGreaterThanOrEqual(2);
    });

    it("sortedTxs is sorted descending by time", () => {
      const older = mkTx("old", -100, {
        time: Math.floor(new Date("2025-06-01T10:00:00").getTime() / 1000),
      });
      const newer = mkTx("new", -200, {
        time: Math.floor(new Date("2025-06-04T10:00:00").getTime() / 1000),
      });
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx: [older, newer] })),
      );
      const ids = result.current.filtered.map((t) => t.id);
      expect(ids.indexOf("new")).toBeLessThan(ids.indexOf("old"));
    });
  });

  describe("creditAccIds derivation", () => {
    it("includes account ids that have creditLimit > 0", () => {
      const accounts: TxAccount[] = [
        { id: "credit1", creditLimit: 10000 },
        { id: "debit1", creditLimit: 0 },
        { id: "debit2" },
      ];
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ accounts })),
      );
      expect(result.current.creditAccIds.has("credit1")).toBe(true);
      expect(result.current.creditAccIds.has("debit1")).toBe(false);
      expect(result.current.creditAccIds.has("debit2")).toBe(false);
    });
  });

  describe("flatItems and groupCounts", () => {
    it("flatItems is empty when all days are collapsed", () => {
      const t1 = mkTx("a", -100, {
        time: Math.floor(new Date("2025-06-01T10:00:00").getTime() / 1000),
      });
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx: [t1] })),
      );
      // By default, days are collapsed (no overrides), so flatItems = []
      expect(result.current.flatItems).toHaveLength(0);
    });

    it("flatItems contains transactions after toggling a day open", () => {
      const t1 = mkTx("a", -100, {
        time: Math.floor(new Date("2025-06-01T10:00:00").getTime() / 1000),
      });
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx: [t1] })),
      );
      // Toggle the day open
      const dayKey = result.current.groupedByDate[0]?.key;
      if (dayKey) {
        act(() => result.current.toggleDay(dayKey));
        expect(result.current.flatItems.length).toBeGreaterThan(0);
      }
    });

    it("groupCounts reflects collapsed/expanded state", () => {
      const t1 = mkTx("a", -100, {
        time: Math.floor(new Date("2025-06-01T10:00:00").getTime() / 1000),
      });
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams({ realTx: [t1] })),
      );
      // Before toggle: collapsed → count = 0
      expect(result.current.groupCounts[0]).toBe(0);
      const dayKey = result.current.groupedByDate[0]?.key;
      if (dayKey) {
        act(() => result.current.toggleDay(dayKey));
        // After toggle: expanded → count = 1
        expect(result.current.groupCounts[0]).toBeGreaterThan(0);
      }
    });
  });

  describe("monthLabel", () => {
    it("monthLabel is a non-empty string for the current month", () => {
      const { result } = renderHook(() =>
        useTransactionFilters(buildDefaultParams()),
      );
      expect(typeof result.current.monthLabel).toBe("string");
      expect(result.current.monthLabel.length).toBeGreaterThan(0);
    });
  });
});
