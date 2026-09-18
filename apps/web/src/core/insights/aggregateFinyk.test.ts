import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock SQLite reader and storage helpers so we can drive the
// `monthlyBudget` chain (SQLite first, LS fallback) deterministically.
vi.mock("@finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: vi.fn(),
}));
vi.mock("@finyk/lib/lsStats", () => ({
  readFinykStatsContext: () => ({
    txs: [],
    excludedTxIds: new Set<string>(),
    txSplits: {},
    txCategories: {},
    customCategories: [],
  }),
}));
vi.mock("@shared/lib/storage/storage", () => ({
  safeListLSKeys: () => [],
  safeReadLS: vi.fn(),
  safeWriteLS: vi.fn(),
}));

import { getCachedFinykSqliteState } from "@finyk/lib/sqliteReader";
import { safeReadLS } from "@shared/lib/storage/storage";

import { aggregateFinyk } from "./useWeeklyDigest";

const mockedGetCache = vi.mocked(getCachedFinykSqliteState);
const mockedSafeReadLS = vi.mocked(safeReadLS);

const EMPTY_CACHE = {
  hiddenAccounts: [],
  hiddenTransactions: [],
  budgets: [],
  subscriptions: [],
  manualAssets: [],
  manualDebts: [],
  receivables: [],
  customCategories: [],
  manualExpenses: [],
  txCategories: {},
  txSplits: {},
  monoDebtLinkedTxIds: {},
  networthHistory: [],
  monthlyPlan: null,
  showBalance: null,
  excludedStatTxIds: null,
  dismissedRecurring: null,
  refreshedAt: null,
};

describe("aggregateFinyk — monthlyBudget reader chain (PR #072)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("reads monthlyBudget from SQLite cache when finyk_prefs.monthly_plan_json is set", () => {
    mockedGetCache.mockReturnValue({
      ...EMPTY_CACHE,
      monthlyPlan: { income: 10_000, expense: 7_500, savings: 2_500 },
      refreshedAt: "2026-05-10T00:00:00.000Z",
    });
    mockedSafeReadLS.mockReturnValue(null);

    const out = aggregateFinyk("2026-05-04");
    expect(out.monthlyBudget).toBe(7_500);
  });

  it("falls back to LS finyk_monthly_plan when SQLite cache is cold", () => {
    mockedGetCache.mockReturnValue({ ...EMPTY_CACHE });
    mockedSafeReadLS.mockImplementation((key: string) =>
      key === "finyk_monthly_plan"
        ? { income: 12_000, expense: 9_000, savings: 3_000 }
        : null,
    );

    const out = aggregateFinyk("2026-05-04");
    expect(out.monthlyBudget).toBe(9_000);
  });

  it("returns null when neither SQLite nor LS have a monthlyPlan", () => {
    mockedGetCache.mockReturnValue({ ...EMPTY_CACHE });
    mockedSafeReadLS.mockReturnValue(null);

    const out = aggregateFinyk("2026-05-04");
    expect(out.monthlyBudget).toBeNull();
  });

  it("does NOT read the dead `finyk_storage_v2` blob (PR #072 — sunset)", () => {
    mockedGetCache.mockReturnValue({ ...EMPTY_CACHE });
    mockedSafeReadLS.mockReturnValue(null);

    aggregateFinyk("2026-05-04");

    const calls = mockedSafeReadLS.mock.calls;
    expect(calls.some(([key]) => key === "finyk_storage_v2")).toBe(false);
  });

  it("prefers SQLite over LS when both are present", () => {
    mockedGetCache.mockReturnValue({
      ...EMPTY_CACHE,
      monthlyPlan: { income: 10_000, expense: 8_000, savings: 2_000 },
      refreshedAt: "2026-05-10T00:00:00.000Z",
    });
    mockedSafeReadLS.mockImplementation((key: string) =>
      key === "finyk_monthly_plan"
        ? { income: 1, expense: 1, savings: 1 }
        : null,
    );

    const out = aggregateFinyk("2026-05-04");
    expect(out.monthlyBudget).toBe(8_000);
  });
});
