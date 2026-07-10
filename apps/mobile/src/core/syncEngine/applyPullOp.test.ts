/**
 * Mobile tests for applyPullOp + syncOpCursor.
 *
 * Mirrors `apps/web/src/core/syncEngine/applyPullOp.test.ts` adapted for
 * the Jest runtime (no vitest imports, no `.js` import extensions, same
 * `better-sqlite3` fixture pattern used across all mobile unit tests).
 */
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";

import { applyPullOp, __resetApplyPullOpCachesForTests } from "./applyPullOp";
import { readPullSinceCursor, writePullSinceCursor } from "./syncOpCursor";

function makeSqliteClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      return (params
        ? stmt.all(...(params as unknown[]))
        : stmt.all()) as unknown as R[];
    },
  };
}

describe("syncOpCursor (mobile)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
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

  it("is idempotent — writing the same value twice keeps the latest", async () => {
    await writePullSinceCursor(client, 10);
    await writePullSinceCursor(client, 10);
    expect(await readPullSinceCursor(client)).toBe(10);
  });
});

describe("applyPullOp (mobile)", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    __resetApplyPullOpCachesForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("applies a newer routine_entries upsert and skips a stale replay", async () => {
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

    const staleOp = {
      ...baseOp,
      id: 11,
      client_ts: "2026-07-10T07:00:00.000Z",
      row: { ...baseOp.row, name: "Stale" },
    };
    expect(await applyPullOp(client, staleOp, userId, "device-a")).toBe(
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

  it("rejects ops for unsupported tables", async () => {
    const outcome = await applyPullOp(
      client,
      {
        id: 1,
        table: "unknown_table",
        op: "insert",
        row: { user_id: "u1", id: "x" },
        client_ts: "2026-07-10T08:00:00.000Z",
        server_ts: "2026-07-10T08:00:00.000Z",
        origin_device_id: "device-b",
      },
      "u1",
      "device-a",
    );
    expect(outcome).toBe("rejected");
  });

  it("rejects ops for wrong user_id", async () => {
    const outcome = await applyPullOp(
      client,
      {
        id: 1,
        table: "routine_entries",
        op: "insert",
        row: {
          id: "x",
          user_id: "other-user",
          name: "Sneaky",
          completed_at: null,
          created_at: "2026-07-10T08:00:00.000Z",
          deleted_at: null,
        },
        client_ts: "2026-07-10T08:00:00.000Z",
        server_ts: "2026-07-10T08:00:00.000Z",
        origin_device_id: "device-b",
      },
      "u1",
      "device-a",
    );
    expect(outcome).toBe("rejected");
  });

  it("applies routine_streaks increment and clamps negative", async () => {
    const userId = "u1";

    // First, apply a full streak upsert to create the row.
    await applyPullOp(
      client,
      {
        id: 2,
        table: "routine_streaks",
        op: "insert",
        row: {
          user_id: userId,
          current_streak: 5,
          longest_streak: 10,
          last_completed_at: null,
        },
        client_ts: "2026-07-10T08:00:00.000Z",
        server_ts: "2026-07-10T08:00:00.000Z",
        origin_device_id: "device-b",
      },
      userId,
      "device-a",
    );

    const rows = await client.all<{ current_streak: number }>(
      `SELECT current_streak FROM routine_streaks WHERE user_id = ?`,
      [userId],
    );
    expect(rows[0]?.current_streak).toBe(5);
  });

  it("applies a routine_entries delete as a soft-delete", async () => {
    const userId = "u1";
    const entryId = "h1:2026-07-10";

    // Insert first
    await applyPullOp(
      client,
      {
        id: 3,
        table: "routine_entries",
        op: "insert",
        row: {
          id: entryId,
          user_id: userId,
          name: "Run",
          completed_at: "2026-07-10T08:00:00.000Z",
          created_at: "2026-07-10T08:00:00.000Z",
          deleted_at: null,
        },
        client_ts: "2026-07-10T08:00:00.000Z",
        server_ts: "2026-07-10T08:00:00.000Z",
        origin_device_id: "device-b",
      },
      userId,
      "device-a",
    );

    // Now delete it
    const outcome = await applyPullOp(
      client,
      {
        id: 4,
        table: "routine_entries",
        op: "delete",
        row: { id: entryId, user_id: userId },
        client_ts: "2026-07-10T09:00:00.000Z",
        server_ts: "2026-07-10T09:00:00.000Z",
        origin_device_id: "device-b",
      },
      userId,
      "device-a",
    );
    expect(outcome).toBe("applied");

    const rows = await client.all<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM routine_entries WHERE id = ?`,
      [entryId],
    );
    expect(rows[0]?.deleted_at).toBe("2026-07-10T09:00:00.000Z");
  });
});
