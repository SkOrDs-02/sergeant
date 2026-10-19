import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import type { SyncV2PullOp } from "@sergeant/api-client";

import {
  applyPullOp,
  __resetApplyPullOpCachesForTests,
} from "./applyPullOp.js";
import { refreshFinykSqliteState } from "../../modules/finyk/lib/sqliteReader.js";

/**
 * data-15, частина Б: finyk_tx_categories / finyk_tx_splits /
 * finyk_mono_debt_links / finyk_networth_history мають `deleted_at`
 * (клієнтська міграція 005), тож pull-`delete` ставить tombstone, а не
 * видаляє рядок. Запізнілий upsert за tombstone-ом скіпається (LWW), новіший
 * воскрешає, а reader не віддає видалене.
 */

const USER = "user-1";
const T0 = "2026-07-10T08:00:00.000Z";
const T1 = "2026-07-10T09:00:00.000Z";
const T2 = "2026-07-10T10:00:00.000Z";
const T3 = "2026-07-10T11:00:00.000Z";

function makeSqliteClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      return (
        params ? stmt.all(...(params as unknown[])) : stmt.all()
      ) as never;
    },
  };
}

function op(
  table: string,
  kind: SyncV2PullOp["op"],
  row: Record<string, unknown>,
  clientTs: string,
  id = 1,
): SyncV2PullOp {
  return {
    id,
    table,
    op: kind,
    row,
    client_ts: clientTs,
    server_ts: clientTs,
    origin_device_id: "device-b",
  };
}

const CASES = [
  {
    table: "finyk_tx_categories",
    row: (v: string) => ({
      user_id: USER,
      transaction_id: "tx-1",
      category_id: v,
    }),
    column: "category_id",
  },
  {
    table: "finyk_tx_splits",
    row: (v: string) => ({
      user_id: USER,
      transaction_id: "tx-1",
      splits_json: v,
    }),
    column: "splits_json",
  },
  {
    table: "finyk_mono_debt_links",
    row: (v: string) => ({
      user_id: USER,
      transaction_id: "tx-1",
      debt_ids_json: v,
    }),
    column: "debt_ids_json",
  },
  {
    table: "finyk_networth_history",
    row: (v: string) => ({
      user_id: USER,
      month: "2026-07",
      networth: Number(v),
      snapshot_json: "{}",
    }),
    column: "networth",
  },
] as const;

describe("applyPullOp — soft-delete tombstone finyk-таблиць (data-15, частина Б)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  const rowOf = async (
    table: string,
    column: string,
  ): Promise<{ value: unknown; deleted_at: string | null } | undefined> =>
    (
      await client.all<{ value: unknown; deleted_at: string | null }>(
        `SELECT ${column} AS value, deleted_at FROM ${table}`,
      )
    )[0];

  beforeEach(async () => {
    __resetApplyPullOpCachesForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: FINYK_CLIENT_MIGRATIONS,
      tableName: FINYK_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  it.each(CASES)(
    "$table: pull delete@T2 ставить tombstone, рядок лишається",
    async ({ table, row, column }) => {
      const v0 = table === "finyk_tx_categories" ? "food" : "1";
      await applyPullOp(
        client,
        op(table, "insert", row(v0), T0),
        USER,
        "device-a",
      );
      expect(
        await applyPullOp(
          client,
          op(table, "delete", row(v0), T2, 2),
          USER,
          "device-a",
        ),
      ).toBe("applied");

      const left = await rowOf(table, column);
      expect(left).toBeDefined();
      expect(left!.deleted_at).toBe(T2);
    },
  );

  it.each(CASES)(
    "$table: запізнілий pull update@T1 після tombstone@T2 скіпається, рядок лишається видаленим",
    async ({ table, row, column }) => {
      const v0 = table === "finyk_tx_categories" ? "food" : "1";
      const v1 = table === "finyk_tx_categories" ? "fun" : "2";
      await applyPullOp(
        client,
        op(table, "insert", row(v0), T0),
        USER,
        "device-a",
      );
      await applyPullOp(
        client,
        op(table, "delete", row(v0), T2, 2),
        USER,
        "device-a",
      );

      expect(
        await applyPullOp(
          client,
          op(table, "update", row(v1), T1, 3),
          USER,
          "device-a",
        ),
      ).toBe("skipped");

      const left = await rowOf(table, column);
      expect(left!.deleted_at).toBe(T2);
      expect(String(left!.value)).toBe(v0);
    },
  );

  it.each(CASES)(
    "$table: новіший за tombstone update@T3 воскрешає рядок (deleted_at = NULL)",
    async ({ table, row, column }) => {
      const v0 = table === "finyk_tx_categories" ? "food" : "1";
      const v3 = table === "finyk_tx_categories" ? "fun" : "3";
      await applyPullOp(
        client,
        op(table, "insert", row(v0), T0),
        USER,
        "device-a",
      );
      await applyPullOp(
        client,
        op(table, "delete", row(v0), T2, 2),
        USER,
        "device-a",
      );
      expect(
        await applyPullOp(
          client,
          op(table, "update", row(v3), T3, 3),
          USER,
          "device-a",
        ),
      ).toBe("applied");

      const left = await rowOf(table, column);
      expect(left!.deleted_at).toBeNull();
      expect(String(left!.value)).toBe(v3);
    },
  );

  it("reader (sqliteReader) не віддає tombstone-и жодної з чотирьох таблиць", async () => {
    const live = { user_id: USER, transaction_id: "tx-live" };
    const dead = { user_id: USER, transaction_id: "tx-dead" };
    await applyPullOp(
      client,
      op("finyk_tx_categories", "insert", { ...live, category_id: "a" }, T0),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op("finyk_tx_categories", "insert", { ...dead, category_id: "b" }, T0),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op("finyk_tx_categories", "delete", dead, T2, 2),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op("finyk_tx_splits", "insert", { ...dead, splits_json: "[]" }, T0),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op("finyk_tx_splits", "delete", dead, T2, 2),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op(
        "finyk_mono_debt_links",
        "insert",
        { ...dead, debt_ids_json: '["d1"]' },
        T0,
      ),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op("finyk_mono_debt_links", "delete", dead, T2, 2),
      USER,
      "device-a",
    );
    const nw = { user_id: USER, month: "2026-06" };
    await applyPullOp(
      client,
      op(
        "finyk_networth_history",
        "insert",
        { ...nw, networth: 5, snapshot_json: "{}" },
        T0,
      ),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op("finyk_networth_history", "delete", nw, T2, 2),
      USER,
      "device-a",
    );

    const snapshot = await refreshFinykSqliteState(client, USER);
    expect(snapshot.txCategories).toEqual({ "tx-live": "a" });
    expect(snapshot.txSplits).toEqual({});
    expect(snapshot.monoDebtLinkedTxIds).toEqual({});
    expect(snapshot.networthHistory).toEqual([]);
  });
});
