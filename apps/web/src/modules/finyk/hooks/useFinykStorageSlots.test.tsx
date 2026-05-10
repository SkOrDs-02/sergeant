// @vitest-environment jsdom
/**
 * Unit test for the SQLite overlay in `useFinykStorageSlots`.
 *
 * Stage 13 PR #074 — verifies that `showBalance` is overlaid from the
 * warm SQLite cache (the gap closed in this PR — previous behaviour
 * had the slot stuck at the LS first-paint value forever).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useFinykStorageSlots } from "./useFinykStorageSlots";
import type { SqliteFinykCache } from "../lib/sqliteReader";

const fakeCache: { value: SqliteFinykCache } = {
  value: emptyCache(),
};

vi.mock("../lib/sqliteReader", async () => {
  const actual = await vi.importActual<typeof import("../lib/sqliteReader")>(
    "../lib/sqliteReader",
  );
  return {
    ...actual,
    getCachedFinykSqliteState: () => fakeCache.value,
  };
});

import {
  notifyFinykSqliteCacheRefresh,
  __resetFinykSqliteReadGateForTests,
} from "../lib/sqliteReadGate";

function emptyCache(): SqliteFinykCache {
  return {
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
}

beforeEach(() => {
  fakeCache.value = emptyCache();
  __resetFinykSqliteReadGateForTests();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("useFinykStorageSlots — Stage 13 PR #074 showBalance overlay", () => {
  it("reads showBalance LS first-paint fallback (default true)", () => {
    const { result } = renderHook(() => useFinykStorageSlots());
    expect(result.current.showBalance).toBe(true);
  });

  it("respects existing LS value '0' on first paint", () => {
    localStorage.setItem("finyk_show_balance_v1", "0");
    const { result } = renderHook(() => useFinykStorageSlots());
    expect(result.current.showBalance).toBe(false);
  });

  it("overlays showBalance from warm SQLite cache", () => {
    const { result } = renderHook(() => useFinykStorageSlots());
    expect(result.current.showBalance).toBe(true);

    fakeCache.value = {
      ...emptyCache(),
      showBalance: false,
      refreshedAt: new Date().toISOString(),
    };
    act(() => {
      notifyFinykSqliteCacheRefresh();
    });

    expect(result.current.showBalance).toBe(false);
  });

  it("does NOT overlay when cache.showBalance is null (no prefs row yet)", () => {
    const { result } = renderHook(() => useFinykStorageSlots());
    expect(result.current.showBalance).toBe(true);

    // Cache warmed with a prefs row but `show_balance` column NULL.
    fakeCache.value = {
      ...emptyCache(),
      showBalance: null,
      refreshedAt: new Date().toISOString(),
    };
    act(() => {
      notifyFinykSqliteCacheRefresh();
    });

    // LS first-paint value preserved.
    expect(result.current.showBalance).toBe(true);
  });

  it("setShowBalance updates state without writing LS", () => {
    const { result } = renderHook(() => useFinykStorageSlots());
    expect(localStorage.getItem("finyk_show_balance_v1")).toBeNull();

    act(() => {
      result.current.setShowBalance(false);
    });

    expect(result.current.showBalance).toBe(false);
    expect(localStorage.getItem("finyk_show_balance_v1")).toBeNull();
  });
});
