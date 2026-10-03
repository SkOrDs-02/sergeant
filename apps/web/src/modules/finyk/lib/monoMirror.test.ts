/**
 * Unit tests for the Mono cache mirror (PR #038).
 *
 * Mirrors `sqliteReader.test.ts` (PR #037) — uses `createTestSqlite`
 * for an in-memory `better-sqlite3` engine with the finyk client
 * migrations applied (001 + 002), then exercises the writer + reader
 * helpers end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  writeMonoTransactions,
  writeMonoAccounts,
  writeMonoAccountSnapshots,
} from "./monoMirror";
import {
  clearFinykMonoMirrorCache,
  getCachedFinykMonoMirrorState,
  getCachedFinykMonoMirrorStateWithLastGood,
  refreshFinykMonoMirrorState,
} from "./monoMirrorReader";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "./sqliteWriter/__tests__/testSqlite";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

const UID = "user-1";

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  clearFinykMonoMirrorCache();
});
afterEach(() => handle.close());

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "tx-1",
    amount: 100,
    date: "2026-05-01",
    categoryId: "default",
    type: "expense",
    source: "mono",
    time: 1735689600,
    description: "Test",
    mcc: 0,
    accountId: "acc-1",
    manual: false,
    _source: "mono",
    _accountId: "acc-1",
    _manual: false,
    ...overrides,
  };
}

describe("writeMonoTransactions", () => {
  it("inserts new rows and returns the count attempted", async () => {
    const written = await writeMonoTransactions(handle.client, UID, [
      tx({ id: "a", time: 1 }),
      tx({ id: "b", time: 2 }),
    ]);
    expect(written).toBe(2);

    const rows = await handle.client.all(
      `SELECT tx_id, mono_time FROM finyk_mono_transactions
       WHERE user_id = ? ORDER BY tx_id ASC`,
      [UID],
    );
    expect(rows).toEqual([
      { tx_id: "a", mono_time: 1 },
      { tx_id: "b", mono_time: 2 },
    ]);
  });

  it("is a no-op for empty inputs", async () => {
    expect(await writeMonoTransactions(handle.client, UID, [])).toBe(0);
    expect(await writeMonoTransactions(handle.client, "", [tx({})])).toBe(0);
  });

  it("upserts existing rows when mono_time advances (LWW)", async () => {
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "a", time: 1, description: "old" }),
    ]);
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "a", time: 5, description: "new" }),
    ]);

    const cache = await refreshFinykMonoMirrorState(handle.client, UID);
    expect(cache.transactions).toHaveLength(1);
    expect(cache.transactions[0]!.description).toBe("new");
  });

  it("ignores stale writes when mono_time regresses (LWW)", async () => {
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "a", time: 5, description: "new" }),
    ]);
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "a", time: 1, description: "stale" }),
    ]);

    const cache = await refreshFinykMonoMirrorState(handle.client, UID);
    expect(cache.transactions).toHaveLength(1);
    expect(cache.transactions[0]!.description).toBe("new");
  });

  it("skips rows missing an id", async () => {
    const written = await writeMonoTransactions(handle.client, UID, [
      tx({ id: "" }),
      tx({ id: "ok" }),
    ]);
    expect(written).toBe(1);
  });
});

describe("writeMonoAccounts", () => {
  it("upserts accounts and re-runs are idempotent", async () => {
    const accounts = [
      { id: "acc-1", balance: 1000, creditLimit: 0 },
      { id: "acc-2", balance: 500 },
    ];
    expect(await writeMonoAccounts(handle.client, UID, accounts)).toBe(2);
    expect(await writeMonoAccounts(handle.client, UID, accounts)).toBe(2);

    const rows = await handle.client.all(
      `SELECT account_id FROM finyk_mono_accounts
       WHERE user_id = ? ORDER BY account_id ASC`,
      [UID],
    );
    expect(rows).toHaveLength(2);
  });
});

describe("writeMonoAccountSnapshots", () => {
  it("appends rows on first insert and is no-op for the same instant", async () => {
    const at = "2026-05-01T10:00:00.000Z";
    const accounts = [{ id: "acc-1", balance: 1000, creditLimit: 0 }];

    expect(
      await writeMonoAccountSnapshots(handle.client, UID, accounts, at),
    ).toBe(1);
    // Re-run for the same instant — ON CONFLICT DO NOTHING.
    expect(
      await writeMonoAccountSnapshots(handle.client, UID, accounts, at),
    ).toBe(1);

    const rows = await handle.client.all(
      `SELECT COUNT(*) AS n FROM finyk_mono_account_snapshots
       WHERE user_id = ? AND account_id = ?`,
      [UID, "acc-1"],
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it("appends a new row when snapshot_at differs", async () => {
    const accounts = [{ id: "acc-1", balance: 1000 }];
    await writeMonoAccountSnapshots(
      handle.client,
      UID,
      accounts,
      "2026-05-01T10:00:00.000Z",
    );
    await writeMonoAccountSnapshots(
      handle.client,
      UID,
      accounts,
      "2026-05-02T10:00:00.000Z",
    );

    const rows = await handle.client.all(
      `SELECT COUNT(*) AS n FROM finyk_mono_account_snapshots
       WHERE user_id = ? AND account_id = ?`,
      [UID, "acc-1"],
    );
    expect((rows[0] as { n: number }).n).toBe(2);
  });
});

describe("refreshFinykMonoMirrorState", () => {
  it("returns empty cache for a fresh DB and stamps refreshedAt", async () => {
    const cache = await refreshFinykMonoMirrorState(handle.client, UID);
    expect(cache.transactions).toEqual([]);
    expect(cache.accounts).toEqual([]);
    expect(cache.refreshedAt).not.toBeNull();
  });

  it("returns no rows for a different user (scoping)", async () => {
    await writeMonoTransactions(handle.client, UID, [tx({ id: "a", time: 1 })]);
    const cache = await refreshFinykMonoMirrorState(handle.client, "other");
    expect(cache.transactions).toEqual([]);
  });

  it("orders transactions newest first by mono_time", async () => {
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "old", time: 1 }),
      tx({ id: "new", time: 100 }),
      tx({ id: "mid", time: 50 }),
    ]);
    const cache = await refreshFinykMonoMirrorState(handle.client, UID);
    expect(cache.transactions.map((t) => t.id)).toEqual(["new", "mid", "old"]);
  });

  it("getCachedFinykMonoMirrorState reflects the last refresh", async () => {
    await writeMonoTransactions(handle.client, UID, [tx({ id: "a", time: 1 })]);
    await refreshFinykMonoMirrorState(handle.client, UID);
    expect(getCachedFinykMonoMirrorState().transactions).toHaveLength(1);
  });

  it("clears cache when called with falsy userId", async () => {
    await writeMonoTransactions(handle.client, UID, [tx({ id: "a", time: 1 })]);
    await refreshFinykMonoMirrorState(handle.client, UID);
    expect(getCachedFinykMonoMirrorState().transactions).toHaveLength(1);
    await refreshFinykMonoMirrorState(handle.client, "");
    expect(getCachedFinykMonoMirrorState().transactions).toEqual([]);
  });
});

describe("getCachedFinykMonoMirrorStateWithLastGood (last-good fallback)", () => {
  it("returns current cache when transactions are non-empty", async () => {
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "a", time: 1 }),
      tx({ id: "b", time: 2 }),
    ]);
    await refreshFinykMonoMirrorState(handle.client, UID);

    const result = getCachedFinykMonoMirrorStateWithLastGood();
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("falls back to last-good when current cache is empty after a non-empty refresh", async () => {
    // First populate with real data
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "good-tx", time: 99 }),
    ]);
    await refreshFinykMonoMirrorState(handle.client, UID);
    expect(getCachedFinykMonoMirrorState().transactions).toHaveLength(1);

    // Now simulate a transitional empty refresh (e.g. user scoped to different userId)
    await refreshFinykMonoMirrorState(handle.client, "other-user");
    expect(getCachedFinykMonoMirrorState().transactions).toHaveLength(0);

    // getCachedFinykMonoMirrorStateWithLastGood should return the previous good snapshot
    const withFallback = getCachedFinykMonoMirrorStateWithLastGood();
    expect(withFallback.transactions).toHaveLength(1);
    expect(withFallback.transactions[0]!.id).toBe("good-tx");
  });

  it("returns empty when no good snapshot has ever been populated", async () => {
    // Fresh cache, no previous data
    const result = getCachedFinykMonoMirrorStateWithLastGood();
    expect(result.transactions).toEqual([]);
  });

  it("clearFinykMonoMirrorCache resets lastGood so fallback returns empty", async () => {
    // Populate a good snapshot
    await writeMonoTransactions(handle.client, UID, [tx({ id: "c", time: 5 })]);
    await refreshFinykMonoMirrorState(handle.client, UID);

    // Clear (test isolation) — both current cache and lastGood should reset
    clearFinykMonoMirrorCache();
    await refreshFinykMonoMirrorState(handle.client, "nobody");

    const result = getCachedFinykMonoMirrorStateWithLastGood();
    expect(result.transactions).toEqual([]);
  });

  it("updates lastGood on each non-empty refresh", async () => {
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "first", time: 1 }),
    ]);
    await refreshFinykMonoMirrorState(handle.client, UID);

    // Overwrite with a newer transaction
    await writeMonoTransactions(handle.client, UID, [
      tx({ id: "second", time: 2 }),
    ]);
    await refreshFinykMonoMirrorState(handle.client, UID);

    // Empty the live cache without clearing lastGood
    await refreshFinykMonoMirrorState(handle.client, "nobody");

    const result = getCachedFinykMonoMirrorStateWithLastGood();
    // lastGood should reflect the second (most recent) non-empty snapshot
    expect(result.transactions.map((t) => t.id).sort()).toContain("second");
  });
});
