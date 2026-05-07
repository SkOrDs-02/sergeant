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
import { repairPartialOutboxMigration } from "../sqlite/syncOpOutboxRepair.js";

/**
 * Recovery contract for `repairPartialOutboxMigration` against the
 * three on-disk shapes a real client may boot from:
 *
 *  1. Fresh DB — no `__migrations` ledger, no outbox tables. Helper
 *     is a no-op so the runner can lay down 001/002/003 unmodified.
 *  2. Healthy DB — full migration ledger, live `sync_op_outbox`.
 *     Helper is a no-op so subsequent runner calls stay idempotent.
 *  3. Corrupted post-002 DB — `sync_op_outbox_legacy` left behind by
 *     a partial 002 migration whose ROLLBACK didn't survive in
 *     sqlite-wasm OPFS (`docs/audits/2026-05-07-app-audit.md` §A1).
 *     Helper restores the legacy table back to `sync_op_outbox`,
 *     drops 002/003 from the ledger, and a follow-up `runMigrations`
 *     call lays down the retry-policy + increment-op shape on top.
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

describe("repairPartialOutboxMigration", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(() => {
    db = new Database(":memory:");
    client = syncClient(db);
  });

  afterEach(() => {
    db.close();
  });

  it("is a no-op on a fresh database with no ledger or outbox tables", async () => {
    const result = await repairPartialOutboxMigration(client);
    expect(result.recovered).toBe(false);

    // Nothing was written to the DB — `__migrations` does not exist.
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
           WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as { name: string }[];
    expect(tables).toEqual([]);
  });

  it("is a no-op on a healthy fully-migrated database", async () => {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });

    const ledgerBefore = db
      .prepare("SELECT name FROM __migrations ORDER BY id ASC")
      .all() as { name: string }[];

    const result = await repairPartialOutboxMigration(client);
    expect(result.recovered).toBe(false);

    const ledgerAfter = db
      .prepare("SELECT name FROM __migrations ORDER BY id ASC")
      .all() as { name: string }[];
    expect(ledgerAfter).toEqual(ledgerBefore);

    // sync_op_outbox is still present and writable.
    db.prepare(
      `INSERT INTO sync_op_outbox
         (table_name, op, row, client_ts, idempotency_key)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "routine_entries",
      "insert",
      "{}",
      "2026-05-04T12:00:00.000+00:00",
      "idem-healthy",
    );
    const rows = db
      .prepare(
        "SELECT idempotency_key FROM sync_op_outbox WHERE idempotency_key = ?",
      )
      .all("idem-healthy") as { idempotency_key: string }[];
    expect(rows).toEqual([{ idempotency_key: "idem-healthy" }]);
  });

  it("recovers a corrupted post-002 shape and a follow-up migration run lands cleanly", async () => {
    // Stage 1: simulate the partial 002 failure by applying only 001
    // and then renaming sync_op_outbox to its legacy name without
    // creating the new shape. This mirrors what the on-disk DB looks
    // like after sqlite-wasm OPFS rolls back the create+insert+drop
    // half of 002 but leaves the rename committed.
    const adapter = createSqliteAdapter(client);
    await runMigrations({
      adapter,
      files: [ROUTINE_SPIKE_CLIENT_MIGRATIONS[0]!],
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });

    db.prepare(
      `INSERT INTO sync_op_outbox
         (table_name, op, row, client_ts, idempotency_key)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      "routine_entries",
      "insert",
      JSON.stringify({ id: "stranded" }),
      "2026-05-04T12:00:00.000+00:00",
      "idem-stranded",
    );

    db.exec("ALTER TABLE sync_op_outbox RENAME TO sync_op_outbox_legacy");

    // Add bogus 002/003 ledger rows so we can prove the helper drops
    // them — a real DB hitting this shape may or may not have these
    // depending on which side of the runner's BEGIN/COMMIT flushed,
    // but the helper has to handle both.
    db.prepare("INSERT INTO __migrations (name) VALUES (?)").run(
      "002_sync_op_outbox_retry.sql",
    );
    db.prepare("INSERT INTO __migrations (name) VALUES (?)").run(
      "003_sync_op_outbox_increment_op.sql",
    );

    // Sanity-check the on-disk shape we just constructed.
    const before = db
      .prepare(
        `SELECT name FROM sqlite_master
           WHERE type='table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(before.map((r) => r.name)).toContain("sync_op_outbox_legacy");
    expect(before.map((r) => r.name)).not.toContain("sync_op_outbox");

    // Stage 2: run the helper. It should restore the legacy table
    // back to its production name and clear 002/003 from the ledger.
    const result = await repairPartialOutboxMigration(client, {
      ledgerTable: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
    expect(result.recovered).toBe(true);

    const afterRepair = db
      .prepare(
        `SELECT name FROM sqlite_master
           WHERE type='table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(afterRepair.map((r) => r.name)).toContain("sync_op_outbox");
    expect(afterRepair.map((r) => r.name)).not.toContain(
      "sync_op_outbox_legacy",
    );

    const ledgerAfterRepair = db
      .prepare("SELECT name FROM __migrations ORDER BY id ASC")
      .all() as { name: string }[];
    expect(ledgerAfterRepair.map((r) => r.name)).toEqual([
      "001_routine_spike.sql",
    ]);

    // Pre-corruption row survived the rename round-trip.
    const stranded = db
      .prepare(
        "SELECT idempotency_key FROM sync_op_outbox WHERE idempotency_key = ?",
      )
      .all("idem-stranded") as { idempotency_key: string }[];
    expect(stranded).toEqual([{ idempotency_key: "idem-stranded" }]);

    // Stage 3: re-run the runner end-to-end. 002 + 003 should apply
    // cleanly on the recovered shape and the post-state is
    // indistinguishable from a freshly-migrated DB.
    const rerun = await runMigrations({
      adapter,
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
    expect(rerun.applied).toEqual([
      "002_sync_op_outbox_retry.sql",
      "003_sync_op_outbox_increment_op.sql",
    ]);
    expect(rerun.skipped).toEqual(["001_routine_spike.sql"]);

    const cols = db
      .prepare("SELECT name FROM pragma_table_info('sync_op_outbox')")
      .all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual([
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

    // Stranded row is still there after 002's INSERT SELECT carries
    // it forward into the rebuilt table with the new columns
    // defaulted.
    const recovered = db
      .prepare(
        `SELECT idempotency_key, status, attempts, next_retry_at, last_error
           FROM sync_op_outbox WHERE idempotency_key = ?`,
      )
      .all("idem-stranded") as {
      idempotency_key: string;
      status: string;
      attempts: number;
      next_retry_at: string | null;
      last_error: string | null;
    }[];
    expect(recovered).toEqual([
      {
        idempotency_key: "idem-stranded",
        status: "pending",
        attempts: 0,
        next_retry_at: null,
        last_error: null,
      },
    ]);
  });

  it("running the helper twice on the same DB is safe (second call is a no-op)", async () => {
    // Reproduce the corrupted shape (same setup as the previous test)
    // and verify a second helper invocation returns recovered:false
    // without further mutating the DB.
    const adapter = createSqliteAdapter(client);
    await runMigrations({
      adapter,
      files: [ROUTINE_SPIKE_CLIENT_MIGRATIONS[0]!],
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
    db.exec("ALTER TABLE sync_op_outbox RENAME TO sync_op_outbox_legacy");

    const first = await repairPartialOutboxMigration(client, {
      ledgerTable: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
    expect(first.recovered).toBe(true);

    const second = await repairPartialOutboxMigration(client, {
      ledgerTable: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
    expect(second.recovered).toBe(false);
  });

  it("rejects ledger table names that do not match the runner's allowed shape", async () => {
    await expect(
      repairPartialOutboxMigration(client, {
        ledgerTable: "drop table users; --",
      }),
    ).rejects.toThrow(/Invalid ledger table name/);
  });
});
