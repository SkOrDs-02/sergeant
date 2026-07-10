/**
 * Client-side round-trip smoke: outbox enqueue → simulated pull apply.
 *
 * Proves the Phase 1 wiring chain without a live server: mutation enqueues
 * an op, a peer device pull payload applies into SQLite, and the row is
 * readable. Server push/pull integration is covered separately in
 * `apps/server/src/modules/sync/syncV2.integration.test.ts`.
 */
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
import { enqueueOutboxUpsert } from "./enqueueOutboxUpsert.js";
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

describe("sync v2 client round-trip (enqueue → pull apply)", () => {
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

  it("device A enqueue + device B pull apply converges routine_entries", async () => {
    const userId = "user-roundtrip";
    const deviceA = "device-a-uuid";
    const deviceB = "device-b-uuid";
    const rowId = "habit-x:2026-07-10";
    const clientTs = "2026-07-10T12:00:00.000Z";
    const idempotencyKey = "00000000-0000-4000-8000-000000000001";

    await enqueueOutboxUpsert(client, {
      userId,
      table: "routine_entries",
      op: "insert",
      row: {
        id: rowId,
        user_id: userId,
        name: "Morning run",
        completed_at: clientTs,
        created_at: clientTs,
        deleted_at: null,
      },
      clientTs,
      idempotencyKey,
    });

    const pending = await client.all<{ table_name: string }>(
      `SELECT table_name FROM sync_op_outbox WHERE idempotency_key = ?`,
      [idempotencyKey],
    );
    expect(pending).toHaveLength(1);

    const pullOp = {
      id: 42,
      table: "routine_entries",
      op: "insert" as const,
      row: {
        id: rowId,
        user_id: userId,
        name: "Morning run",
        completed_at: clientTs,
        created_at: clientTs,
        deleted_at: null,
      },
      client_ts: clientTs,
      server_ts: "2026-07-10T12:00:01.000Z",
      origin_device_id: deviceA,
    };

    expect(await applyPullOp(client, pullOp, userId, deviceB)).toBe("applied");

    const rows = await client.all<{ name: string }>(
      `SELECT name FROM routine_entries WHERE id = ? AND user_id = ?`,
      [rowId, userId],
    );
    expect(rows[0]?.name).toBe("Morning run");

    await writePullSinceCursor(client, pullOp.id);
    expect(await readPullSinceCursor(client)).toBe(42);
  });
});
