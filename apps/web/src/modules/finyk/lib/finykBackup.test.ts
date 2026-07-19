// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { SqliteFinykCache } from "./sqliteReader";

const fakeCache: { value: SqliteFinykCache } = {
  value: coldCache(),
};

vi.mock("./sqliteReader", async () => {
  const actual =
    await vi.importActual<typeof import("./sqliteReader")>("./sqliteReader");
  return {
    ...actual,
    getCachedFinykSqliteState: () => fakeCache.value,
  };
});

import {
  normalizeFinykBackup,
  normalizeFinykSyncPayload,
  FINYK_BACKUP_VERSION,
  readFinykBackupFromStorage,
  persistFinykNormalizedToStorage,
} from "./finykBackup";
import { HUB_FINYK_ROUTINE_SYNC_EVENT } from "../hubRoutineSync";

function coldCache(): SqliteFinykCache {
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

function warmCache(
  overrides: Partial<SqliteFinykCache> = {},
): SqliteFinykCache {
  return {
    ...coldCache(),
    refreshedAt: "2026-07-01T00:00:00.000Z",
    budgets: [{ id: "b1" } as never],
    subscriptions: [{ id: "s1" } as never],
    manualAssets: [{ id: "a1" } as never],
    manualDebts: [{ id: "d1" } as never],
    receivables: [{ id: "r1" } as never],
    hiddenAccounts: ["acc-1"],
    hiddenTransactions: ["tx-1"],
    monthlyPlan: { income: "1000", expense: "500", savings: "500" },
    txCategories: { "tx-1": "food" as never },
    txSplits: { "tx-1": [] as never },
    monoDebtLinkedTxIds: { "tx-1": ["d1"] },
    networthHistory: [{ date: "2026-07-01", value: 100 } as never],
    customCategories: [{ id: "c1" } as never],
    dismissedRecurring: ["rec-1"],
    ...overrides,
  };
}

describe("normalizeFinykBackup", () => {
  it("приймає мінімальний v1 без додаткових полів", () => {
    expect(normalizeFinykBackup({ version: 1, budgets: [] })).toEqual({
      budgets: [],
    });
  });

  it("приймає повний v2", () => {
    const full: Record<string, unknown> = {
      version: FINYK_BACKUP_VERSION,
      budgets: [] as unknown[],
      subscriptions: [] as unknown[],
      manualAssets: [] as unknown[],
      manualDebts: [] as unknown[],
      receivables: [] as unknown[],
      hiddenAccounts: [] as unknown[],
      hiddenTxIds: [] as unknown[],
      monthlyPlan: { income: "", expense: "", savings: "" },
      txCategories: { a: "b" },
      txSplits: {},
      monoDebtLinkedTxIds: {},
      networthHistory: [{ month: "2026-01", networth: 100 }],
      customCategories: [{ id: "cus_x", label: "Моя" }],
    };
    expect(normalizeFinykBackup(full)).toMatchObject({
      txCategories: { a: "b" },
      networthHistory: [{ month: "2026-01", networth: 100 }],
      customCategories: [{ id: "cus_x", label: "Моя" }],
    });
  });

  it("відхиляє txCategories-масив", () => {
    expect(() =>
      normalizeFinykBackup({ version: 2, txCategories: [] }),
    ).toThrow(/об'єктом/);
  });
});

describe("normalizeFinykSyncPayload", () => {
  it("розгортає компактний v3 і валідує поля", () => {
    const compact: Record<string, unknown> = {
      v: 3,
      b: [] as unknown[],
      s: [] as unknown[],
      a: [] as unknown[],
      d: [] as unknown[],
      r: [] as unknown[],
      mp: { income: "", expense: "", savings: "" },
      tc: { x: "y" },
      ts: {},
      md: {},
      nh: [{ month: "2026-01", networth: 1 }],
      cc: [{ id: "cus_a", label: "Тест" }],
    };
    expect(normalizeFinykSyncPayload(compact)).toMatchObject({
      txCategories: { x: "y" },
      networthHistory: [{ month: "2026-01", networth: 1 }],
      customCategories: [{ id: "cus_a", label: "Тест" }],
    });
  });

  it("приймає повний бекап як у файлі", () => {
    expect(normalizeFinykSyncPayload({ version: 1, budgets: [] })).toEqual({
      budgets: [],
    });
  });

  it("відхиляє зіпсований компактний tc", () => {
    expect(() => normalizeFinykSyncPayload({ v: 3, b: [], tc: [] })).toThrow(
      /об'єктом/,
    );
  });
});

describe("readFinykBackupFromStorage", () => {
  beforeEach(() => {
    fakeCache.value = coldCache();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("falls back to LS defaults for every field when the cache is cold (refreshedAt === null)", () => {
    const snapshot = readFinykBackupFromStorage();

    expect(snapshot.budgets).toEqual([]);
    expect(snapshot.subscriptions).toEqual([]);
    expect(snapshot.manualAssets).toEqual([]);
    expect(snapshot.manualDebts).toEqual([]);
    expect(snapshot.receivables).toEqual([]);
    expect(snapshot.hiddenAccounts).toEqual([]);
    expect(snapshot.hiddenTxIds).toEqual([]);
    expect(snapshot.txCategories).toEqual({});
    expect(snapshot.txSplits).toEqual({});
    expect(snapshot.monoDebtLinkedTxIds).toEqual({});
    expect(snapshot.networthHistory).toEqual([]);
    expect(snapshot.customCategories).toEqual([]);
    // monthlyPlan and dismissedRecurring have their own null-guarded
    // defaults distinct from the generic readJSON([]) fallback.
    expect(snapshot.monthlyPlan).toEqual({
      income: "",
      expense: "",
      savings: "",
    });
    expect(snapshot.dismissedRecurring).toEqual([]);
  });

  it("reads persisted LS values instead of defaults when cold and LS has data", () => {
    localStorage.setItem("finyk_budgets", JSON.stringify([{ id: "ls-b1" }]));
    localStorage.setItem(
      "finyk_monthly_plan",
      JSON.stringify({ income: "2000", expense: "800", savings: "1200" }),
    );
    localStorage.setItem("finyk_rec_dismissed", JSON.stringify(["ls-rec-1"]));

    const snapshot = readFinykBackupFromStorage();

    expect(snapshot.budgets).toEqual([{ id: "ls-b1" }]);
    expect(snapshot.monthlyPlan).toEqual({
      income: "2000",
      expense: "800",
      savings: "1200",
    });
    expect(snapshot.dismissedRecurring).toEqual(["ls-rec-1"]);
  });

  it("prefers the warm SQLite cache over LS for every field", () => {
    fakeCache.value = warmCache();
    // Seed LS with different values to prove the cache wins, not LS.
    localStorage.setItem("finyk_budgets", JSON.stringify([{ id: "ls-only" }]));

    const snapshot = readFinykBackupFromStorage();

    expect(snapshot.version).toBe(FINYK_BACKUP_VERSION);
    expect(snapshot.budgets).toEqual([{ id: "b1" }]);
    expect(snapshot.subscriptions).toEqual([{ id: "s1" }]);
    expect(snapshot.manualAssets).toEqual([{ id: "a1" }]);
    expect(snapshot.manualDebts).toEqual([{ id: "d1" }]);
    expect(snapshot.receivables).toEqual([{ id: "r1" }]);
    expect(snapshot.hiddenAccounts).toEqual(["acc-1"]);
    expect(snapshot.hiddenTxIds).toEqual(["tx-1"]);
    expect(snapshot.monthlyPlan).toEqual({
      income: "1000",
      expense: "500",
      savings: "500",
    });
    expect(snapshot.txCategories).toEqual({ "tx-1": "food" });
    expect(snapshot.txSplits).toEqual({ "tx-1": [] });
    expect(snapshot.monoDebtLinkedTxIds).toEqual({ "tx-1": ["d1"] });
    expect(snapshot.networthHistory).toEqual([
      { date: "2026-07-01", value: 100 },
    ]);
    expect(snapshot.customCategories).toEqual([{ id: "c1" }]);
    expect(snapshot.dismissedRecurring).toEqual(["rec-1"]);
  });

  it("falls back to the LS default for monthlyPlan when warm but cache.monthlyPlan is null", () => {
    fakeCache.value = warmCache({ monthlyPlan: null });

    const snapshot = readFinykBackupFromStorage();

    expect(snapshot.monthlyPlan).toEqual({
      income: "",
      expense: "",
      savings: "",
    });
  });

  it("falls back to the LS default for dismissedRecurring when warm but cache.dismissedRecurring is null", () => {
    fakeCache.value = warmCache({ dismissedRecurring: null });

    const snapshot = readFinykBackupFromStorage();

    expect(snapshot.dismissedRecurring).toEqual([]);
  });
});

describe("persistFinykNormalizedToStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("writes each defined field to its mapped LS key", () => {
    persistFinykNormalizedToStorage({
      version: 3,
      budgets: [{ id: "b2" }],
      monthlyPlan: { income: "500", expense: "100", savings: "400" },
    });

    expect(JSON.parse(localStorage.getItem("finyk_budgets") ?? "null")).toEqual(
      [{ id: "b2" }],
    );
    expect(
      JSON.parse(localStorage.getItem("finyk_monthly_plan") ?? "null"),
    ).toEqual({ income: "500", expense: "100", savings: "400" });
  });

  it("skips fields that are undefined instead of writing them", () => {
    persistFinykNormalizedToStorage({ budgets: [{ id: "only-this" }] });

    expect(localStorage.getItem("finyk_subs")).toBeNull();
    expect(localStorage.getItem("finyk_assets")).toBeNull();
  });

  it("dispatches the hub-routine-calendar-sync event after writing", () => {
    const handler = vi.fn();
    window.addEventListener(HUB_FINYK_ROUTINE_SYNC_EVENT, handler);

    persistFinykNormalizedToStorage({ budgets: [] });

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(HUB_FINYK_ROUTINE_SYNC_EVENT, handler);
  });
});
