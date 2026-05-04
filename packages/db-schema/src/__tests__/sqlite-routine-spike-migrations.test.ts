import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { runMigrations } from "../migrate/runner.js";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import {
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";

/**
 * Schema-roundtrip smoke for the Stage 3 SPIKE bundled migrations
 * (PR #022 of `docs/planning/storage-roadmap.md`).
 *
 * Locks down four invariants that the web/mobile clients depend on:
 *
 *  1. Migrations apply cleanly on a fresh `:memory:` SQLite engine.
 *  2. The four target tables exist with the expected primary-key
 *     columns (sanity-check against future drift between the inlined
 *     SQL constant and the Drizzle schema definitions).
 *  3. Re-running is a no-op (`__migrations` ledger entries match).
 *  4. Insert/select round-trips work for `routine_entries` and
 *     `sync_op_outbox` so the SPIKE repo can be tested in isolation
 *     without re-creating tables manually in every test file.
 */

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

describe("ROUTINE_SPIKE_CLIENT_MIGRATIONS", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(() => {
    db = new Database(":memory:");
    client = syncClient(db);
  });

  afterEach(() => {
    db.close();
  });

  it("applies the bundled migrations end-to-end and creates all four tables", async () => {
    const result = await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
    expect(result.applied).toEqual([
      "001_routine_spike.sql",
      "002_sync_op_outbox_retry.sql",
    ]);
    expect(result.skipped).toEqual([]);

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(tables.map((r) => r.name)).toEqual([
      "__migrations",
      "routine_entries",
      "routine_streaks",
      "sync_op_cursor",
      "sync_op_outbox",
    ]);

    // PR #040 retry columns are present on the rebuilt sync_op_outbox.
    const outboxCols = db
      .prepare("SELECT name FROM pragma_table_info('sync_op_outbox')")
      .all() as { name: string }[];
    expect(outboxCols.map((c) => c.name)).toEqual([
      "id",
      "table_name",
      "op",
      "row",
      "client_ts",
      "idempotency_key",
      "status",
      "reject_reason",
      "attempts",
      "next_retry_at",
      "last_error",
      "created_at",
    ]);

    // Confirm primary-key columns line up with the Drizzle schemas in
    // `packages/db-schema/src/sqlite/routine.ts`. `pk != 0` flags PK cols.
    const rePk = db
      .prepare(
        "SELECT name FROM pragma_table_info('routine_entries') WHERE pk != 0",
      )
      .all() as { name: string }[];
    expect(rePk.map((r) => r.name)).toEqual(["id"]);

    const rsPk = db
      .prepare(
        "SELECT name FROM pragma_table_info('routine_streaks') WHERE pk != 0",
      )
      .all() as { name: string }[];
    expect(rsPk.map((r) => r.name)).toEqual(["user_id"]);

    const obPk = db
      .prepare(
        "SELECT name FROM pragma_table_info('sync_op_outbox') WHERE pk != 0",
      )
      .all() as { name: string }[];
    expect(obPk.map((r) => r.name)).toEqual(["id"]);

    const cuPk = db
      .prepare(
        "SELECT name FROM pragma_table_info('sync_op_cursor') WHERE pk != 0",
      )
      .all() as { name: string }[];
    expect(cuPk.map((r) => r.name)).toEqual(["key"]);
  });

  it("re-running is a no-op (idempotent migrations ledger)", async () => {
    const adapter = createSqliteAdapter(client);
    await runMigrations({
      adapter,
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
    const second = await runMigrations({
      adapter,
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual([
      "001_routine_spike.sql",
      "002_sync_op_outbox_retry.sql",
    ]);
  });

  it("supports insert + select on routine_entries and sync_op_outbox", async () => {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });

    db.prepare(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "11111111-1111-4111-8111-111111111111",
      "user-1",
      "drink water",
      "2026-05-02T10:00:00.000+00:00",
      "2026-05-02T10:00:00.000+00:00",
      "2026-05-02T10:00:00.000+00:00",
    );
    const rows = db
      .prepare("SELECT id, user_id, name FROM routine_entries")
      .all() as { id: string; user_id: string; name: string }[];
    expect(rows).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "user-1",
        name: "drink water",
      },
    ]);

    db.prepare(
      `INSERT INTO sync_op_outbox
         (table_name, op, row, client_ts, idempotency_key)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "routine_entries",
      "insert",
      JSON.stringify({ id: "x", name: "y" }),
      "2026-05-02T10:00:00.000+00:00",
      "idem-1",
    );
    const out = db
      .prepare("SELECT idempotency_key, status FROM sync_op_outbox")
      .all() as { idempotency_key: string; status: string }[];
    expect(out).toEqual([{ idempotency_key: "idem-1", status: "pending" }]);

    // UNIQUE on idempotency_key prevents duplicate enqueue.
    expect(() =>
      db
        .prepare(
          `INSERT INTO sync_op_outbox
             (table_name, op, row, client_ts, idempotency_key)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          "routine_entries",
          "insert",
          "{}",
          "2026-05-02T10:00:00.000+00:00",
          "idem-1",
        ),
    ).toThrow();
  });

  it("PR #040 sync_op_outbox accepts dead_letter status and rejects unknown statuses", async () => {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });

    // dead_letter is now a legal terminal status (was rejected pre-PR-040).
    db.prepare(
      `INSERT INTO sync_op_outbox
         (table_name, op, row, client_ts, idempotency_key, status,
          attempts, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "routine_entries",
      "insert",
      "{}",
      "2026-05-02T10:00:00.000+00:00",
      "idem-dl",
      "dead_letter",
      10,
      "http_503",
    );
    const dl = db
      .prepare(
        "SELECT status, attempts, last_error FROM sync_op_outbox WHERE idempotency_key = 'idem-dl'",
      )
      .get() as { status: string; attempts: number; last_error: string };
    expect(dl).toEqual({
      status: "dead_letter",
      attempts: 10,
      last_error: "http_503",
    });

    // Unknown status values are still rejected by the CHECK constraint.
    expect(() =>
      db
        .prepare(
          `INSERT INTO sync_op_outbox
             (table_name, op, row, client_ts, idempotency_key, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "routine_entries",
          "insert",
          "{}",
          "2026-05-02T10:00:00.000+00:00",
          "idem-bad",
          "in_flight",
        ),
    ).toThrow();
  });

  it("PR #040 retry-policy migration preserves rows from the SPIKE shape", async () => {
    // Apply ONLY the original SPIKE migration first, populate it with a
    // row in the SPIKE shape, then layer the retry-policy migration on
    // top to verify the rebuild copies surviving fields and defaults the
    // new ones — the contract a real Stage-3 device hits when it
    // upgrades to a Stage-5 build.
    const adapter = createSqliteAdapter(client);
    await runMigrations({
      adapter,
      files: [ROUTINE_SPIKE_CLIENT_MIGRATIONS[0]!],
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });

    db.prepare(
      `INSERT INTO sync_op_outbox
         (table_name, op, row, client_ts, idempotency_key, status, reject_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "routine_entries",
      "update",
      JSON.stringify({ id: "x" }),
      "2026-05-02T10:00:00.000+00:00",
      "idem-legacy",
      "rejected",
      "lww_conflict",
    );

    await runMigrations({
      adapter,
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });

    const row = db
      .prepare(
        `SELECT idempotency_key, status, reject_reason, attempts,
                next_retry_at, last_error
         FROM sync_op_outbox
         WHERE idempotency_key = 'idem-legacy'`,
      )
      .get() as {
      idempotency_key: string;
      status: string;
      reject_reason: string | null;
      attempts: number;
      next_retry_at: string | null;
      last_error: string | null;
    };

    expect(row).toEqual({
      idempotency_key: "idem-legacy",
      status: "rejected",
      reject_reason: "lww_conflict",
      attempts: 0,
      next_retry_at: null,
      last_error: null,
    });
  });
});
