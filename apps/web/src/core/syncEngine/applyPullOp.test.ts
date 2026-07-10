import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import { ROUTINE_CLIENT_MIGRATIONS } from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";

import {
  applyPullOp,
  __resetApplyPullOpCachesForTests,
} from "./applyPullOp.js";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor.js";

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

describe("syncOpCursor", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: "__migrations",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("defaults pull_since to 0 and persists updates", async () => {
    expect(await readPullSinceCursor(client)).toBe(0);
    await writePullSinceCursor(client, 42);
    expect(await readPullSinceCursor(client)).toBe(42);
  });
});

describe("applyPullOp", () => {
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
  });

  afterEach(() => {
    db.close();
  });

  it("applies a newer routine_entries upsert and skips stale replay", async () => {
    const userId = "user-1";
    const deviceB = "device-b";

    const baseOp = {
      id: 10,
      table: "routine_entries",
      op: "insert" as const,
      row: {
        id: "habit1:2026-07-10",
        user_id: userId,
        name: "Run",
        completed_at: "2026-07-10T08:00:00.000Z",
        created_at: "2026-07-10T08:00:00.000Z",
        deleted_at: null,
      },
      client_ts: "2026-07-10T08:00:00.000Z",
      server_ts: "2026-07-10T08:00:01.000Z",
      origin_device_id: deviceB,
    };

    expect(await applyPullOp(client, baseOp, userId, "device-a")).toBe(
      "applied",
    );

    const stale = {
      ...baseOp,
      id: 11,
      client_ts: "2026-07-10T07:00:00.000Z",
      row: { ...baseOp.row, name: "Stale" },
    };
    expect(await applyPullOp(client, stale, userId, "device-a")).toBe(
      "skipped",
    );

    const rows = await client.all<{ name: string }>(
      `SELECT name FROM routine_entries WHERE id = ?`,
      ["habit1:2026-07-10"],
    );
    expect(rows[0]?.name).toBe("Run");
  });

  it("skips echo ops from the same origin device", async () => {
    const deviceA = "device-a";
    const outcome = await applyPullOp(
      client,
      {
        id: 1,
        table: "routine_entries",
        op: "insert",
        row: {
          id: "x",
          user_id: "u1",
          name: "Echo",
          completed_at: null,
          created_at: "2026-07-10T08:00:00.000Z",
          deleted_at: null,
        },
        client_ts: "2026-07-10T08:00:00.000Z",
        server_ts: "2026-07-10T08:00:00.000Z",
        origin_device_id: deviceA,
      },
      "u1",
      deviceA,
    );
    expect(outcome).toBe("skipped");
  });
});
