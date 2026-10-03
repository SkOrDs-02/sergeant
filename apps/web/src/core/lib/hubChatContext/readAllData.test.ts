// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../../modules/finyk/lib/monoMirrorReader";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../modules/finyk/lib/sqliteReader";
import { readAllData } from "./readAllData";

beforeEach(() => {
  localStorage.clear();
  clearFinykMonoMirrorCache();
  clearFinykSqliteCache();
});

describe("readAllData", () => {
  it("returns empty defaults when caches are empty", () => {
    const d = readAllData();
    expect(d.transactions).toEqual([]);
    expect(d.accounts).toEqual([]);
    expect(d.clientName).toBe("");
    expect(d.cacheTime).toBeNull();
    expect(d.statTx).toEqual([]);
    expect(d.excludedIds.size).toBe(0);
  });

  it("reads tx and account slices from the Mono mirror cache", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [{ id: "t1", amount: -100 } as never],
      accounts: [{ id: "a1", balance: 5 }],
      refreshedAt: "2026-06-01T00:00:00.000Z",
    });
    const d = readAllData();
    expect(d.transactions).toHaveLength(1);
    expect(d.accounts).toHaveLength(1);
    expect(d.clientName).toBe("");
    expect(d.cacheTime).toBe(new Date("2026-06-01T00:00:00.000Z").getTime());
  });

  it("computes excludedIds from hidden txs, transfers and receivable links", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "t1", amount: -100 },
        { id: "t2", amount: -200 },
        { id: "t3", amount: -300 },
        { id: "t4", amount: -400 },
      ] as never[],
    });
    // data-08: ці слайси живуть у кеші SQLite (kv UI не пише).
    __setFinykSqliteStateCacheForTests({
      hiddenTransactions: ["t1"],
      txCategories: { t2: "internal_transfer" },
      receivables: [{ id: "r1", name: "X", amount: 10, linkedTxIds: ["t3"] }],
    });
    const d = readAllData();
    expect(d.excludedIds.has("t1")).toBe(true);
    expect(d.excludedIds.has("t2")).toBe(true);
    expect(d.excludedIds.has("t3")).toBe(true);
    expect(d.statTx.map((t) => t.id)).toEqual(["t4"]);
  });

  it("віддає чат-контексту ефективну мапу категорій: правило мерчанта + явні override-и", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "t1", amount: -100, description: "Сільпо №5" },
        { id: "t2", amount: -200, description: "СІЛЬПО 12" },
        { id: "t3", amount: -300, description: "АТБ" },
      ] as never[],
    });
    __setFinykSqliteStateCacheForTests({
      txCategories: { t2: "food" },
      merchantRules: [
        {
          id: "mr_1",
          kind: "expense",
          merchantKey: "сільпо",
          categoryId: "transport",
          label: "Сільпо",
          createdAt: "2026-10-01T10:00:00.000Z",
          updatedAt: "2026-10-01T10:00:00.000Z",
        },
      ],
    } as never);

    const d = readAllData();
    expect(d.txCategories).toEqual({ t1: "transport", t2: "food" });
  });

  it("[План]/[Борги]/бюджети/спліти беруться з кешу SQLite, а не з порожнього kv (data-08)", () => {
    // kv порожній: саме так виглядає пристрій, де дані створив UI.
    localStorage.clear();
    __setFinykSqliteStateCacheForTests({
      monthlyPlan: { income: "50000", expense: "25000", savings: "10000" },
      manualDebts: [
        {
          id: "d1",
          name: "Позика",
          totalAmount: 900,
          dueDate: "",
          emoji: "",
          linkedTxIds: [],
        },
      ],
      budgets: [{ id: "b1", type: "limit", categoryId: "food", limit: 4000 }],
      txSplits: { t1: [{ categoryId: "food", amount: 1 }] },
      subscriptions: [{ id: "s1", name: "Netflix" }],
    } as never);
    const d = readAllData();
    expect(d.monthlyPlan).toEqual({
      income: "50000",
      expense: "25000",
      savings: "10000",
    });
    expect(d.manualDebts.map((x) => x.id)).toEqual(["d1"]);
    expect(d.budgets.map((x) => x.id)).toEqual(["b1"]);
    expect(Object.keys(d.txSplits)).toEqual(["t1"]);
    expect(d.subscriptions.map((x) => x.id)).toEqual(["s1"]);
  });

  it("порожній план: monthlyPlan = {}", () => {
    __setFinykSqliteStateCacheForTests({});
    expect(readAllData().monthlyPlan).toEqual({});
  });
});
