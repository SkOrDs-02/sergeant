import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import { ROUTINE_CLIENT_MIGRATIONS } from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import type { SyncV2PullOp } from "@sergeant/api-client";

import { adoptStoredClientTs } from "./adoptStoredClientTs.js";
import {
  applyPullOp,
  __resetApplyPullOpCachesForTests,
} from "./applyPullOp.js";

/**
 * data-51 / rv-sync-clock. Пристрій A поспішає на 90 с і правив звичку в t0:
 * локально `updated_at = t0 + 90 с`, а сервер прийняв і записав обрізане
 * `t0`. Пристрій B з правильним годинником правив ту саму звичку в t0 + 30 с,
 * сервер прийняв (t0 + 30 > t0). A тягне оп B; власний оп A приходить
 * відфільтрованим за origin. Доти `isStaleLocal(t0 + 90, t0 + 30)` скіпав
 * оп B, і A лишався зі своєю назвою, поки рядок хтось не змінить знову.
 */

const USER = "user-a";
const T0 = "2026-11-21T12:00:00.000Z";
const A_LOCAL = "2026-11-21T12:01:30.000Z";
const B_TS = "2026-11-21T12:00:30.000Z";

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

function habitRow(name: string): Record<string, unknown> {
  return { id: "h-1", user_id: USER, name };
}

function pullFromB(): SyncV2PullOp {
  return {
    id: 2,
    table: "routine_habits",
    op: "update",
    row: habitRow("з пристрою B"),
    client_ts: B_TS,
    server_ts: B_TS,
    origin_device_id: "device-b",
  };
}

describe("adoptStoredClientTs (data-51)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    __resetApplyPullOpCachesForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: "__migrations",
    });
    db.prepare(
      `INSERT INTO routine_habits (id, user_id, name, created_at, updated_at)
       VALUES ('h-1', ?, 'з пристрою A', ?, ?)`,
    ).run(USER, A_LOCAL, A_LOCAL);
  });

  afterEach(() => {
    db.close();
  });

  function local(): { name: string; updated_at: string } {
    return db
      .prepare(`SELECT name, updated_at FROM routine_habits WHERE id = 'h-1'`)
      .get() as { name: string; updated_at: string };
  }

  it("без обрізаної мітки пристрій, що поспішав, відкидає пізнішу правку B", async () => {
    expect(await applyPullOp(client, pullFromB(), USER, "device-a")).toBe(
      "skipped",
    );
    expect(local().name).toBe("з пристрою A");
  });

  it("після обрізаної мітки правка B застосовується, як на сервері", async () => {
    expect(
      await adoptStoredClientTs(client, {
        table: "routine_habits",
        op: "update",
        row: habitRow("з пристрою A"),
        sentClientTs: A_LOCAL,
        storedClientTs: T0,
      }),
    ).toBe(true);
    expect(local().updated_at).toBe(T0);

    expect(await applyPullOp(client, pullFromB(), USER, "device-a")).toBe(
      "applied",
    );
    expect(local()).toEqual({ name: "з пристрою B", updated_at: B_TS });
  });

  it("новіша локальна правка (мітка вже інша) не переписується", async () => {
    const newer = "2026-11-21T12:02:00.000Z";
    db.prepare(`UPDATE routine_habits SET updated_at = ? WHERE id = 'h-1'`).run(
      newer,
    );
    expect(
      await adoptStoredClientTs(client, {
        table: "routine_habits",
        op: "update",
        row: habitRow("з пристрою A"),
        sentClientTs: A_LOCAL,
        storedClientTs: T0,
      }),
    ).toBe(false);
    expect(local().updated_at).toBe(newer);
  });

  it("локальне видалення: tombstone рухається разом з updated_at", async () => {
    db.prepare(
      `UPDATE routine_habits SET deleted_at = updated_at WHERE id = 'h-1'`,
    ).run();
    await adoptStoredClientTs(client, {
      table: "routine_habits",
      op: "delete",
      row: habitRow("з пристрою A"),
      sentClientTs: A_LOCAL,
      storedClientTs: T0,
    });
    expect(
      db
        .prepare(
          `SELECT updated_at, deleted_at FROM routine_habits WHERE id = 'h-1'`,
        )
        .get(),
    ).toEqual({ updated_at: T0, deleted_at: T0 });
  });

  it("increment і таблиці без updated_at не чіпаються", async () => {
    expect(
      await adoptStoredClientTs(client, {
        table: "routine_streaks",
        op: "increment",
        row: { user_id: USER, delta: 1 },
        sentClientTs: A_LOCAL,
        storedClientTs: T0,
      }),
    ).toBe(false);
    expect(
      await adoptStoredClientTs(client, {
        table: "routine_completion_events",
        op: "insert",
        row: { id: "e-1", user_id: USER },
        sentClientTs: A_LOCAL,
        storedClientTs: T0,
      }),
    ).toBe(false);
  });
});
