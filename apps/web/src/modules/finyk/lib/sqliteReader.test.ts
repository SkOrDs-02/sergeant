/**
 * Unit tests for the finyk SQLite read path (PR #037).
 *
 * Uses the same `createTestSqlite` helper as the finyk dual-write
 * adapter tests (in-memory `better-sqlite3` with the finyk client
 * migrations applied), then exercises `refreshFinykSqliteState` /
 * `getCachedFinykSqliteState` end-to-end against realistic row shapes
 * produced by `applyFinykDualWriteOps`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { applyFinykDualWriteOps } from "./dualWrite/adapter";
import type { FinykDualWriteOp } from "./dualWrite/diff";
import {
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
  refreshFinykSqliteState,
} from "./sqliteReader";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "./dualWrite/__tests__/testSqlite";

const UID = "user-1";
const TS = "2026-05-01T10:00:00.000Z";

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  clearFinykSqliteCache();
});
afterEach(() => handle.close());

const silentLogger = () => {};

async function applyOps(ops: FinykDualWriteOp[], userId = UID, ts = TS) {
  await applyFinykDualWriteOps(handle.client, ops, {
    userId,
    clientTs: ts,
    logger: silentLogger,
  });
}

describe("refreshFinykSqliteState", () => {
  it("returns empty cache for a fresh DB and stamps refreshedAt", async () => {
    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.hiddenAccounts).toEqual([]);
    expect(cache.hiddenTransactions).toEqual([]);
    expect(cache.budgets).toEqual([]);
    expect(cache.subscriptions).toEqual([]);
    expect(cache.manualAssets).toEqual([]);
    expect(cache.manualDebts).toEqual([]);
    expect(cache.receivables).toEqual([]);
    expect(cache.customCategories).toEqual([]);
    expect(cache.manualExpenses).toEqual([]);
    expect(cache.txCategories).toEqual({});
    expect(cache.txSplits).toEqual({});
    expect(cache.monoDebtLinkedTxIds).toEqual({});
    expect(cache.networthHistory).toEqual([]);
    expect(cache.monthlyPlan).toBeNull();
    expect(cache.showBalance).toBeNull();
    expect(cache.refreshedAt).not.toBeNull();
  });

  it("hydrates id-set tables (hidden accounts / transactions)", async () => {
    await applyOps([
      {
        kind: "id-upsert",
        table: "finyk_hidden_accounts",
        entry: { id: "acc-1" },
      },
      {
        kind: "id-upsert",
        table: "finyk_hidden_accounts",
        entry: { id: "acc-2" },
      },
      {
        kind: "id-upsert",
        table: "finyk_hidden_transactions",
        entry: { id: "tx-1" },
      },
    ]);

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.hiddenAccounts).toEqual(["acc-1", "acc-2"]);
    expect(cache.hiddenTransactions).toEqual(["tx-1"]);
  });

  it("hydrates blob tables and parses data_json into the entry shape", async () => {
    await applyOps([
      {
        kind: "blob-upsert",
        table: "finyk_budgets",
        entry: {
          id: "b1",
          dataJson: JSON.stringify({
            id: "b1",
            categoryId: "groceries",
            limitUah: 5000,
          }),
        },
      },
      {
        kind: "blob-upsert",
        table: "finyk_subscriptions",
        entry: {
          id: "s1",
          dataJson: JSON.stringify({ id: "s1", name: "Netflix", amount: 250 }),
        },
      },
      {
        kind: "blob-upsert",
        table: "finyk_assets",
        entry: {
          id: "a1",
          dataJson: JSON.stringify({ id: "a1", name: "Cash", value: 100 }),
        },
      },
    ]);

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.budgets).toEqual([
      { id: "b1", categoryId: "groceries", limitUah: 5000 },
    ]);
    expect(cache.subscriptions).toEqual([
      { id: "s1", name: "Netflix", amount: 250 },
    ]);
    expect(cache.manualAssets).toEqual([
      { id: "a1", name: "Cash", value: 100 },
    ]);
  });

  it("hydrates per-tx category overrides", async () => {
    await applyOps([
      {
        kind: "tx-category-upsert",
        entry: { transactionId: "tx-a", categoryId: "groceries" },
      },
      {
        kind: "tx-category-upsert",
        entry: { transactionId: "tx-b", categoryId: "transport" },
      },
    ]);

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.txCategories).toEqual({
      "tx-a": "groceries",
      "tx-b": "transport",
    });
  });

  it("hydrates per-tx splits as a parsed array", async () => {
    await applyOps([
      {
        kind: "tx-splits-upsert",
        entry: {
          transactionId: "tx-1",
          splitsJson: JSON.stringify([
            { categoryId: "food", amount: 100 },
            { categoryId: "fun", amount: 50 },
          ]),
        },
      },
    ]);

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.txSplits).toEqual({
      "tx-1": [
        { categoryId: "food", amount: 100 },
        { categoryId: "fun", amount: 50 },
      ],
    });
  });

  it("hydrates mono-debt links as parsed string arrays", async () => {
    await applyOps([
      {
        kind: "mono-debt-link-upsert",
        entry: {
          transactionId: "tx-1",
          debtIdsJson: JSON.stringify(["debt-1", "debt-2"]),
        },
      },
    ]);

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.monoDebtLinkedTxIds).toEqual({
      "tx-1": ["debt-1", "debt-2"],
    });
  });

  it("hydrates networth history in ascending month order", async () => {
    await applyOps([
      {
        kind: "networth-upsert",
        entry: { month: "2026-02", networth: 200 },
      },
      {
        kind: "networth-upsert",
        entry: { month: "2026-01", networth: 100 },
      },
      {
        kind: "networth-upsert",
        entry: { month: "2026-03", networth: 300 },
      },
    ]);

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.networthHistory).toEqual([
      { month: "2026-01", networth: 100 },
      { month: "2026-02", networth: 200 },
      { month: "2026-03", networth: 300 },
    ]);
  });

  it("hydrates singleton prefs (monthlyPlan + showBalance + arrays)", async () => {
    await applyOps([
      {
        kind: "prefs-upsert",
        prefs: {
          monthlyPlanJson: JSON.stringify({
            income: "30000",
            expense: "20000",
          }),
          showBalance: false,
          excludedStatTxIdsJson: JSON.stringify(["tx-1", "tx-2"]),
          dismissedRecurringJson: JSON.stringify(["banner-x"]),
        },
      },
    ]);

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.monthlyPlan).toEqual({ income: "30000", expense: "20000" });
    expect(cache.showBalance).toBe(false);
    expect(cache.excludedStatTxIds).toEqual(["tx-1", "tx-2"]);
    expect(cache.dismissedRecurring).toEqual(["banner-x"]);
  });

  it("filters out other users' rows", async () => {
    await applyOps(
      [
        {
          kind: "id-upsert",
          table: "finyk_hidden_accounts",
          entry: { id: "acc-other" },
        },
        {
          kind: "blob-upsert",
          table: "finyk_budgets",
          entry: { id: "b-other", dataJson: JSON.stringify({ id: "b-other" }) },
        },
      ],
      "user-2",
    );

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.hiddenAccounts).toEqual([]);
    expect(cache.budgets).toEqual([]);
  });

  it("excludes soft-deleted blob rows", async () => {
    await applyOps([
      {
        kind: "blob-upsert",
        table: "finyk_budgets",
        entry: { id: "b1", dataJson: JSON.stringify({ id: "b1" }) },
      },
      {
        kind: "blob-upsert",
        table: "finyk_budgets",
        entry: { id: "b2", dataJson: JSON.stringify({ id: "b2" }) },
      },
    ]);
    await applyOps(
      [{ kind: "blob-delete", table: "finyk_budgets", id: "b2" }],
      UID,
      "2026-05-01T11:00:00.000Z",
    );

    const cache = await refreshFinykSqliteState(handle.client, UID);
    expect(cache.budgets.map((b: { id: string }) => b.id)).toEqual(["b1"]);
  });

  it("getCachedFinykSqliteState returns the latest refresh result", async () => {
    expect(getCachedFinykSqliteState().refreshedAt).toBeNull();
    await refreshFinykSqliteState(handle.client, UID);
    expect(getCachedFinykSqliteState().refreshedAt).not.toBeNull();
  });

  it("clearFinykSqliteCache resets to the empty cache", async () => {
    await applyOps([
      {
        kind: "id-upsert",
        table: "finyk_hidden_accounts",
        entry: { id: "acc-1" },
      },
    ]);
    await refreshFinykSqliteState(handle.client, UID);
    expect(getCachedFinykSqliteState().hiddenAccounts).toEqual(["acc-1"]);
    clearFinykSqliteCache();
    expect(getCachedFinykSqliteState().hiddenAccounts).toEqual([]);
    expect(getCachedFinykSqliteState().refreshedAt).toBeNull();
  });
});
