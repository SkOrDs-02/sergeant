import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import { runMigrations } from "../migrate/runner.js";
import {
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";
import { enqueueOutboxIncrement } from "../sqlite/syncOpOutboxEnqueue.js";
import { countOutboxByStatus } from "../sqlite/syncOpOutboxStatus.js";

/**
 * Integration tests for the read-only status reporter
 * `countOutboxByStatus` (PR #042e-status of
 * `docs/planning/storage-roadmap.md`). Runs the full SPIKE + PR #040
 * + PR #042d-prep migration stack against a fresh `:memory:` engine
 * and pins the contract:
 *
 *  1. Empty table — returns `{ pending: 0, rejected: 0, dead_letter: 0 }`.
 *  2. Mixed-status table — returns the actual counts per bucket; all
 *     three statuses are present in the result regardless of which
 *     ones the database has rows for.
 *  3. Schema invariants — unknown status literal in the database is
 *     a loud throw, not a silent under-count; bigint count surfaces
 *     are coerced through `Number()` and an integer guard.
 *  4. Concurrency / idempotency — repeated calls return the same
 *     shape; concurrent reads do not corrupt each other.
 *  5. `next_retry_at` does NOT filter — backed-off rows still count
 *     in `pending` (this is the explicit difference from
 *     drainSyncOpOutbox).
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

async function enqueueFresh(
  client: SqliteMigrationClient,
  idempotencyKey: string,
): Promise<number> {
  const r = await enqueueOutboxIncrement(client, {
    table: "routine_streaks",
    row: { delta: 1 },
    clientTs: "2026-05-05T10:00:00.000+00:00",
    idempotencyKey,
  });
  return r.id;
}

function setStatus(
  db: BetterSqliteDatabase,
  id: number,
  status: "pending" | "rejected" | "dead_letter",
): void {
  db.prepare(`UPDATE sync_op_outbox SET status = ? WHERE id = ?`).run(
    status,
    id,
  );
}

function setNextRetryAt(
  db: BetterSqliteDatabase,
  id: number,
  iso: string,
): void {
  db.prepare(`UPDATE sync_op_outbox SET next_retry_at = ? WHERE id = ?`).run(
    iso,
    id,
  );
}

describe("countOutboxByStatus", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("empty table", () => {
    it("returns zeroed counts for every status when the outbox is empty", async () => {
      const counts = await countOutboxByStatus(client);

      expect(counts).toEqual({
        pending: 0,
        rejected: 0,
        dead_letter: 0,
      });
    });

    it("returns the same shape on a fresh table (every key present)", async () => {
      const counts = await countOutboxByStatus(client);

      expect(Object.keys(counts).sort()).toEqual([
        "dead_letter",
        "pending",
        "rejected",
      ]);
    });

    it("returns an independent object on repeated calls (no aliasing)", async () => {
      const a = await countOutboxByStatus(client);
      const b = await countOutboxByStatus(client);

      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe("populated table — one row per status", () => {
    it("counts a single pending row in the pending bucket only", async () => {
      await enqueueFresh(client, "idem-A");

      const counts = await countOutboxByStatus(client);

      expect(counts).toEqual({
        pending: 1,
        rejected: 0,
        dead_letter: 0,
      });
    });

    it("counts rejected and dead_letter rows in their own buckets, not pending", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const b = await enqueueFresh(client, "idem-B");
      const c = await enqueueFresh(client, "idem-C");
      setStatus(db, b, "rejected");
      setStatus(db, c, "dead_letter");

      const counts = await countOutboxByStatus(client);

      expect(counts).toEqual({
        pending: 1,
        rejected: 1,
        dead_letter: 1,
      });
      // Pinning: the surviving pending row is `a`.
      expect(a).toBeGreaterThan(0);
    });
  });

  describe("populated table — many rows per bucket", () => {
    it("counts five pending rows correctly", async () => {
      for (let i = 0; i < 5; i += 1) {
        await enqueueFresh(client, `idem-${i}`);
      }

      const counts = await countOutboxByStatus(client);

      expect(counts).toEqual({
        pending: 5,
        rejected: 0,
        dead_letter: 0,
      });
    });

    it("counts mixed buckets (3 pending, 2 rejected, 1 dead_letter)", async () => {
      const ids: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        ids.push(await enqueueFresh(client, `idem-${i}`));
      }
      // Indices 3, 4 → rejected; index 5 → dead_letter; 0..2 stay pending.
      setStatus(db, ids[3]!, "rejected");
      setStatus(db, ids[4]!, "rejected");
      setStatus(db, ids[5]!, "dead_letter");

      const counts = await countOutboxByStatus(client);

      expect(counts).toEqual({
        pending: 3,
        rejected: 2,
        dead_letter: 1,
      });
    });

    it("scales without aggregation drift (50 pending rows)", async () => {
      for (let i = 0; i < 50; i += 1) {
        await enqueueFresh(client, `idem-${i}`);
      }

      const counts = await countOutboxByStatus(client);

      expect(counts.pending).toBe(50);
      expect(counts.rejected).toBe(0);
      expect(counts.dead_letter).toBe(0);
    });
  });

  describe("next_retry_at does NOT filter", () => {
    it("counts a backed-off pending row in pending (unlike drainSyncOpOutbox)", async () => {
      const a = await enqueueFresh(client, "idem-A");
      // Push next_retry_at far into the future — drain would skip
      // this row, but the status reporter must still count it as
      // pending (UI badge / Sentry breadcrumb want full queue size).
      setNextRetryAt(db, a, "2099-01-01T00:00:00.000Z");

      const counts = await countOutboxByStatus(client);

      expect(counts).toEqual({
        pending: 1,
        rejected: 0,
        dead_letter: 0,
      });
    });

    it("counts both due and not-yet-due pending rows together", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const b = await enqueueFresh(client, "idem-B");
      // a is due (no retry scheduled), b is in the future.
      setNextRetryAt(db, b, "2099-01-01T00:00:00.000Z");

      const counts = await countOutboxByStatus(client);

      expect(counts).toEqual({
        pending: 2,
        rejected: 0,
        dead_letter: 0,
      });
      expect(a).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(0);
    });
  });

  describe("schema-invariant violations", () => {
    it("throws when an unknown status literal is present in the table", async () => {
      // Disable the CHECK constraint by writing the row with a
      // legal status, then mutating it directly via PRAGMA-bypass
      // SQL. The reader must not silently under-count when a future
      // schema migration relaxes the CHECK without updating it.
      const a = await enqueueFresh(client, "idem-A");
      // SQLite respects CHECK on UPDATE; bypass with a temporary
      // rewrite of the column type. Simplest fix is to disable
      // foreign keys / use raw VALUES to inject. Here we just
      // re-create the table without the CHECK to simulate drift.
      db.exec(`
        CREATE TABLE sync_op_outbox_drift AS SELECT * FROM sync_op_outbox;
        DROP TABLE sync_op_outbox;
        CREATE TABLE sync_op_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          op TEXT NOT NULL,
          row TEXT NOT NULL,
          client_ts TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          reject_reason TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_retry_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO sync_op_outbox SELECT * FROM sync_op_outbox_drift;
        DROP TABLE sync_op_outbox_drift;
      `);
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'archived' WHERE id = ?`,
      ).run(a);

      await expect(countOutboxByStatus(client)).rejects.toThrow(
        /unknown status="archived"/,
      );
    });
  });

  describe("idempotency / repeated reads", () => {
    it("returns the same counts on back-to-back calls without state drift", async () => {
      await enqueueFresh(client, "idem-A");
      await enqueueFresh(client, "idem-B");

      const a = await countOutboxByStatus(client);
      const b = await countOutboxByStatus(client);
      const c = await countOutboxByStatus(client);

      expect(a).toEqual(b);
      expect(b).toEqual(c);
      expect(a).toEqual({ pending: 2, rejected: 0, dead_letter: 0 });
    });

    it("reflects counts changes after lifecycle mutations between reads", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const b = await enqueueFresh(client, "idem-B");

      const before = await countOutboxByStatus(client);
      expect(before).toEqual({ pending: 2, rejected: 0, dead_letter: 0 });

      setStatus(db, a, "rejected");
      const mid = await countOutboxByStatus(client);
      expect(mid).toEqual({ pending: 1, rejected: 1, dead_letter: 0 });

      setStatus(db, b, "dead_letter");
      const after = await countOutboxByStatus(client);
      expect(after).toEqual({ pending: 0, rejected: 1, dead_letter: 1 });
    });

    it("returns to the empty shape after the table is fully drained", async () => {
      const a = await enqueueFresh(client, "idem-A");
      db.prepare(`DELETE FROM sync_op_outbox WHERE id = ?`).run(a);

      const counts = await countOutboxByStatus(client);

      expect(counts).toEqual({ pending: 0, rejected: 0, dead_letter: 0 });
    });
  });

  describe("read-only invariant", () => {
    it("does not write to the database (row count stable across calls)", async () => {
      await enqueueFresh(client, "idem-A");
      await enqueueFresh(client, "idem-B");
      await enqueueFresh(client, "idem-C");

      const before = db
        .prepare(`SELECT COUNT(*) AS c FROM sync_op_outbox`)
        .get() as { c: number };

      await countOutboxByStatus(client);
      await countOutboxByStatus(client);
      await countOutboxByStatus(client);

      const after = db
        .prepare(`SELECT COUNT(*) AS c FROM sync_op_outbox`)
        .get() as { c: number };
      expect(after.c).toBe(before.c);
    });
  });

  describe("driver-shim coercion", () => {
    it("accepts a count returned as bigint (driver variant) without dropping the value", async () => {
      // Wrap the shared client so `all` returns COUNT as bigint
      // (matches the way some sqlite-wasm builds surface INTEGER).
      const wrappedClient: SqliteMigrationClient = {
        ...client,
        all<R extends Record<string, unknown>>(
          sql: string,
          params?: readonly unknown[],
        ): R[] | Promise<R[]> {
          const inner = client.all(sql, params);
          const coerce = (rows: Record<string, unknown>[]): R[] =>
            rows.map((row) => {
              if (Object.prototype.hasOwnProperty.call(row, "count")) {
                return {
                  ...row,
                  count: BigInt(Number(row["count"])),
                } as unknown as R;
              }
              return row as R;
            });
          return inner instanceof Promise
            ? inner.then((rows) => coerce(rows as Record<string, unknown>[]))
            : coerce(inner as Record<string, unknown>[]);
        },
      };
      await enqueueFresh(client, "idem-A");
      await enqueueFresh(client, "idem-B");

      const counts = await countOutboxByStatus(wrappedClient);

      expect(counts).toEqual({ pending: 2, rejected: 0, dead_letter: 0 });
    });

    it("throws when the driver hands back a non-finite count", async () => {
      const brokenClient: SqliteMigrationClient = {
        ...client,
        all<R extends Record<string, unknown>>(
          _sql: string,
          _params?: readonly unknown[],
        ): R[] {
          return [{ status: "pending", count: Number.NaN }] as unknown as R[];
        },
      };

      await expect(countOutboxByStatus(brokenClient)).rejects.toThrow(
        /coerced to non-integer/,
      );
    });

    it("throws when the driver hands back a fractional count", async () => {
      const brokenClient: SqliteMigrationClient = {
        ...client,
        all<R extends Record<string, unknown>>(
          _sql: string,
          _params?: readonly unknown[],
        ): R[] {
          return [{ status: "pending", count: 1.5 }] as unknown as R[];
        },
      };

      await expect(countOutboxByStatus(brokenClient)).rejects.toThrow(
        /coerced to non-integer/,
      );
    });

    it("throws when the driver hands back a negative count", async () => {
      const brokenClient: SqliteMigrationClient = {
        ...client,
        all<R extends Record<string, unknown>>(
          _sql: string,
          _params?: readonly unknown[],
        ): R[] {
          return [{ status: "pending", count: -1 }] as unknown as R[];
        },
      };

      await expect(countOutboxByStatus(brokenClient)).rejects.toThrow(
        /is negative/,
      );
    });
  });
});
