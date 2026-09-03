import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import { runMigrations } from "../migrate/runner.js";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";
import { enqueueOutboxIncrement } from "../sqlite/syncOpOutboxEnqueue.js";
import { markOutboxRejected } from "../sqlite/syncOpOutboxLifecycle.js";
import { listRejectedOutbox } from "../sqlite/syncOpOutboxRejected.js";

function syncClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
      return result as R[];
    },
  };
}

async function enqueue(
  client: SqliteMigrationClient,
  idempotencyKey: string,
  table = "routine_streaks",
): Promise<number> {
  const r = await enqueueOutboxIncrement(client, {
    userId: "u-test",
    table,
    row: { delta: 1 },
    clientTs: "2026-05-05T10:00:00.000+00:00",
    idempotencyKey,
  });
  return r.id;
}

describe("listRejectedOutbox", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("returns an empty list when nothing was rejected", async () => {
    await enqueue(client, "k-pending");
    expect(await listRejectedOutbox(client)).toEqual([]);
  });

  it("returns rejected rows newest-first with the reason, ignoring pending ones", async () => {
    const a = await enqueue(client, "k-a", "fizruk_measurements");
    const b = await enqueue(client, "k-b", "nutrition_meals");
    await enqueue(client, "k-c");
    await markOutboxRejected(client, a, "user_id_mismatch");
    await markOutboxRejected(client, b, "invalid_weight_kg");

    const rows = await listRejectedOutbox(client);
    expect(rows.map((r) => r.id)).toEqual([b, a]);
    expect(rows[0]).toMatchObject({
      tableName: "nutrition_meals",
      op: "increment",
      rejectReason: "invalid_weight_kg",
    });
    expect(typeof rows[0]!.id).toBe("number");
    expect(typeof rows[0]!.createdAt).toBe("string");
  });

  it("filters excluded reasons in SQL so the limit counts visible rows only", async () => {
    for (let i = 0; i < 3; i++) {
      const id = await enqueue(client, `k-lww-${i}`);
      await markOutboxRejected(client, id, "lww_conflict");
    }
    const real = await enqueue(client, "k-real");
    await markOutboxRejected(client, real, "user_id_mismatch");

    const rows = await listRejectedOutbox(client, {
      limit: 1,
      excludeReasons: ["lww_conflict"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(real);
  });

  it("keeps rows whose reason is NULL even when exclusions are set", async () => {
    const id = await enqueue(client, "k-null");
    db.prepare(
      `UPDATE sync_op_outbox SET status = 'rejected', reject_reason = NULL WHERE id = ?`,
    ).run(id);
    const rows = await listRejectedOutbox(client, {
      excludeReasons: ["lww_conflict"],
    });
    expect(rows.map((r) => r.id)).toEqual([id]);
    expect(rows[0]!.rejectReason).toBeNull();
  });

  it("rejects a non-positive limit loudly", async () => {
    await expect(listRejectedOutbox(client, { limit: 0 })).rejects.toThrow(
      /limit must be a positive integer/,
    );
  });
});
