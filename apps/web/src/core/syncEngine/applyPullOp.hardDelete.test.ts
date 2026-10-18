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

/**
 * data-15: finyk-таблиці з hard-delete (є `updated_at`, нема `deleted_at`).
 * Сервер віддає їм справжній `delete`-оп; клієнт раніше повертав `rejected`
 * і рядок лишався на інших пристроях.
 */

const USER = "user-1";
const T0 = "2026-07-10T08:00:00.000Z";
const T1 = "2026-07-10T09:00:00.000Z";
const T2 = "2026-07-10T10:00:00.000Z";

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

describe("applyPullOp — hard-delete finyk-таблиці (data-15)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  const catRow = {
    user_id: USER,
    transaction_id: "tx-1",
    category_id: "food",
  };

  const count = async (table: string): Promise<number> =>
    (await client.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]!
      .n;

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

  it("finyk_tx_categories: insert@T0, pull delete@T1 -> рядок зник", async () => {
    expect(
      await applyPullOp(
        client,
        op("finyk_tx_categories", "insert", catRow, T0),
        USER,
        "device-a",
      ),
    ).toBe("applied");
    expect(await count("finyk_tx_categories")).toBe(1);

    expect(
      await applyPullOp(
        client,
        op("finyk_tx_categories", "delete", catRow, T1, 2),
        USER,
        "device-a",
      ),
    ).toBe("applied");
    expect(await count("finyk_tx_categories")).toBe(0);
  });

  it("finyk_tx_categories: delete@T0 при локальному updated_at=T1 -> рядок лишається", async () => {
    await applyPullOp(
      client,
      op("finyk_tx_categories", "insert", catRow, T1),
      USER,
      "device-a",
    );

    const outcome = await applyPullOp(
      client,
      op("finyk_tx_categories", "delete", catRow, T0, 2),
      USER,
      "device-a",
    );
    expect(outcome).not.toBe("rejected");
    expect(await count("finyk_tx_categories")).toBe(1);
  });

  it("delete з тим самим часом, що й локальний updated_at -> рядок лишається (строге <)", async () => {
    await applyPullOp(
      client,
      op("finyk_tx_categories", "insert", catRow, T1),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op("finyk_tx_categories", "delete", catRow, T1, 2),
      USER,
      "device-a",
    );
    expect(await count("finyk_tx_categories")).toBe(1);
  });

  it("delete відсутнього рядка -> skipped (нічого не змінилось, кеш не будимо)", async () => {
    expect(
      await applyPullOp(
        client,
        op("finyk_tx_categories", "delete", catRow, T1),
        USER,
        "device-a",
      ),
    ).toBe("skipped");
    expect(await count("finyk_tx_categories")).toBe(0);
  });

  it("локальний writer коммітить між SELECT і DELETE -> рядок лишається, outcome skipped", async () => {
    await applyPullOp(
      client,
      op("finyk_tx_categories", "insert", catRow, T0),
      USER,
      "device-a",
    );
    let interleaved = false;
    const racing: SqliteMigrationClient = {
      ...client,
      async all<R extends Record<string, unknown>>(
        sql: string,
        params?: readonly unknown[],
      ) {
        const rows = await client.all<R>(sql, params);
        if (!interleaved && sql.startsWith("SELECT updated_at")) {
          interleaved = true;
          db.prepare(
            `UPDATE finyk_tx_categories SET category_id = ?, updated_at = ?`,
          ).run("local-edit", T2);
        }
        return rows;
      },
    };
    const outcome = await applyPullOp(
      racing,
      op("finyk_tx_categories", "delete", catRow, T1, 2),
      USER,
      "device-a",
    );
    expect(interleaved).toBe(true);
    expect(outcome).toBe("skipped");
    const left = await client.all<{ category_id: string; updated_at: string }>(
      `SELECT category_id, updated_at FROM finyk_tx_categories`,
    );
    expect(left).toEqual([{ category_id: "local-edit", updated_at: T2 }]);
  });

  it("delete чужого user_id не чіпає рядок і відхиляється", async () => {
    await applyPullOp(
      client,
      op("finyk_tx_categories", "insert", catRow, T0),
      USER,
      "device-a",
    );
    const outcome = await applyPullOp(
      client,
      op("finyk_tx_categories", "delete", { ...catRow, user_id: "other" }, T2),
      USER,
      "device-a",
    );
    expect(outcome).toBe("rejected");
    expect(await count("finyk_tx_categories")).toBe(1);
  });

  it("delete не зачіпає сусідній рядок з іншим transaction_id", async () => {
    for (const tx of ["tx-1", "tx-2"]) {
      await applyPullOp(
        client,
        op(
          "finyk_tx_categories",
          "insert",
          { ...catRow, transaction_id: tx },
          T0,
        ),
        USER,
        "device-a",
      );
    }
    await applyPullOp(
      client,
      op("finyk_tx_categories", "delete", catRow, T1, 2),
      USER,
      "device-a",
    );
    const left = await client.all<{ transaction_id: string }>(
      `SELECT transaction_id FROM finyk_tx_categories`,
    );
    expect(left.map((r) => r.transaction_id)).toEqual(["tx-2"]);
  });

  it.each([
    [
      "finyk_tx_splits",
      { user_id: USER, transaction_id: "tx-1", splits_json: "[]" },
    ],
    [
      "finyk_mono_debt_links",
      { user_id: USER, transaction_id: "tx-1", debt_ids_json: "[]" },
    ],
    [
      "finyk_networth_history",
      { user_id: USER, month: "2026-07", networth: 100, snapshot_json: "{}" },
    ],
  ])("%s: delete@T1 після insert@T0 прибирає рядок", async (table, row) => {
    await applyPullOp(client, op(table, "insert", row, T0), USER, "device-a");
    expect(await count(table)).toBe(1);

    expect(
      await applyPullOp(
        client,
        op(table, "delete", row, T1, 2),
        USER,
        "device-a",
      ),
    ).toBe("applied");
    expect(await count(table)).toBe(0);
  });

  it("soft-delete таблиця (finyk_budgets) досі позначає deleted_at, а не видаляє", async () => {
    const row = { id: "b1", user_id: USER, data_json: "{}" };
    await applyPullOp(
      client,
      op("finyk_budgets", "insert", row, T0),
      USER,
      "device-a",
    );
    await applyPullOp(
      client,
      op("finyk_budgets", "delete", row, T1, 2),
      USER,
      "device-a",
    );
    const rows = await client.all<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM finyk_budgets WHERE id = 'b1'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).toBe(T1);
  });
});
