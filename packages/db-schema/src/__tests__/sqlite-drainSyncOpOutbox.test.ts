import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import { runMigrations } from "../migrate/runner.js";
import { enqueueOutboxIncrement } from "../sqlite/syncOpOutboxEnqueue.js";
import { drainSyncOpOutbox } from "../sqlite/syncOpOutboxDrain.js";
import {
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";
import { SYNC_OP_OUTBOX_OPS } from "../sqlite/routine.js";

/**
 * Integration tests for `drainSyncOpOutbox` (PR #042e-drain of
 * `docs/planning/storage-roadmap.md`). Runs the full SPIKE +
 * PR #040 + PR #042d-prep migration stack against a fresh
 * `:memory:` engine and exercises every public branch:
 *
 *  1. ordering — pending rows return in `id ASC` (insertion order).
 *  2. status filter — `'rejected'` and `'dead_letter'` rows skipped.
 *  3. retry-due filter — `next_retry_at > now` skipped, `<= now`
 *     and `NULL` returned together.
 *  4. limit — bounded batch; non-positive / non-finite limits short
 *     circuit to `[]` without reading.
 *  5. shape — flat camelCase output with `row` JSON-parsed; round-
 *     trips an `enqueueOutboxIncrement`-written increment envelope.
 *  6. invariant violations — fatal throws on unparseable JSON,
 *     non-object JSON, and an `op` literal outside SYNC_OP_OUTBOX_OPS.
 *  7. cardinality lock on the SYNC_OP_OUTBOX_OPS tuple — drift here
 *     means a CHECK relaxation landed without updating the reader.
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

describe("drainSyncOpOutbox", () => {
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

  describe("ordering and selection", () => {
    it("returns pending rows in insertion order (id ASC)", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      const c = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-C",
      });
      const a = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T10:00:00.000+00:00",
        idempotencyKey: "idem-A",
      });
      const b = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:30:00.000+00:00",
        idempotencyKey: "idem-B",
      });

      const drained = await drainSyncOpOutbox(client, { limit: 100, now });
      expect(drained.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
      expect(drained.map((r) => r.idempotencyKey)).toEqual([
        "idem-C",
        "idem-A",
        "idem-B",
      ]);
    });

    it("skips rows with status='rejected' or status='dead_letter'", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      const ok = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-ok",
      });
      const rej = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-rej",
      });
      const dead = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-dead",
      });
      db.prepare(
        `UPDATE sync_op_outbox SET status = ?, reject_reason = ? WHERE id = ?`,
      ).run("rejected", "engine_invalid_delta", rej.id);
      db.prepare(`UPDATE sync_op_outbox SET status = ? WHERE id = ?`).run(
        "dead_letter",
        dead.id,
      );

      const drained = await drainSyncOpOutbox(client, { limit: 100, now });
      expect(drained.map((r) => r.id)).toEqual([ok.id]);
    });

    it("returns next_retry_at IS NULL and next_retry_at <= now together; skips next_retry_at > now", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      const fresh = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-fresh",
      });
      const due = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-due",
      });
      const future = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-future",
      });
      db.prepare(
        `UPDATE sync_op_outbox SET attempts = ?, next_retry_at = ?, last_error = ? WHERE id = ?`,
      ).run(1, "2026-05-05T11:59:59.000Z", "http_503", due.id);
      db.prepare(
        `UPDATE sync_op_outbox SET attempts = ?, next_retry_at = ?, last_error = ? WHERE id = ?`,
      ).run(1, "2026-05-05T12:30:00.000Z", "http_503", future.id);

      const drained = await drainSyncOpOutbox(client, { limit: 100, now });
      expect(drained.map((r) => r.idempotencyKey)).toEqual([
        "idem-fresh",
        "idem-due",
      ]);
      expect(drained.map((r) => r.id)).toEqual([fresh.id, due.id]);
    });

    it("returns a row whose next_retry_at equals exactly now (boundary inclusive)", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      const exact = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-exact",
      });
      db.prepare(
        `UPDATE sync_op_outbox SET attempts = ?, next_retry_at = ?, last_error = ? WHERE id = ?`,
      ).run(1, "2026-05-05T12:00:00.000Z", "http_503", exact.id);

      const drained = await drainSyncOpOutbox(client, { limit: 100, now });
      expect(drained.map((r) => r.id)).toEqual([exact.id]);
    });
  });

  describe("limit", () => {
    it("caps the batch to `limit`, preserving id ASC order", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      const ids: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const r = await enqueueOutboxIncrement(client, {
          table: "routine_streaks",
          row: { delta: 1 },
          clientTs: "2026-05-05T11:00:00.000+00:00",
          idempotencyKey: `idem-${i}`,
        });
        ids.push(r.id);
      }
      const drained = await drainSyncOpOutbox(client, { limit: 3, now });
      expect(drained.map((r) => r.id)).toEqual(ids.slice(0, 3));
    });

    it("returns [] for non-positive or non-finite limits without touching the table", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-05T11:00:00.000+00:00",
        idempotencyKey: "idem-only",
      });
      // Drop the table after enqueueing — proves the helper short-
      // circuits before issuing a SELECT for non-positive limits.
      db.exec("DROP TABLE sync_op_outbox");
      await expect(
        drainSyncOpOutbox(client, { limit: 0, now }),
      ).resolves.toEqual([]);
      await expect(
        drainSyncOpOutbox(client, { limit: -1, now }),
      ).resolves.toEqual([]);
      await expect(
        drainSyncOpOutbox(client, { limit: Number.NaN, now }),
      ).resolves.toEqual([]);
      await expect(
        drainSyncOpOutbox(client, { limit: Number.POSITIVE_INFINITY, now }),
      ).resolves.toEqual([]);
    });

    it("floors a fractional limit to its integer part", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      const ids: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const r = await enqueueOutboxIncrement(client, {
          table: "routine_streaks",
          row: { delta: 1 },
          clientTs: "2026-05-05T11:00:00.000+00:00",
          idempotencyKey: `idem-frac-${i}`,
        });
        ids.push(r.id);
      }
      const drained = await drainSyncOpOutbox(client, { limit: 2.9, now });
      expect(drained.map((r) => r.id)).toEqual(ids.slice(0, 2));
    });
  });

  describe("shape", () => {
    it("returns flat camelCase fields with row JSON-parsed and op narrowed", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      const payload = {
        user_id: "user-7",
        delta: -3,
        meta: { source: "habit-undo", attempts: [1, 2, 3] },
      };
      const enq = await enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: payload,
        clientTs: "2026-05-05T11:30:00.000+00:00",
        idempotencyKey: "idem-shape",
      });

      const drained = await drainSyncOpOutbox(client, { limit: 10, now });
      expect(drained).toHaveLength(1);
      const only = drained[0]!;
      expect(only.id).toBe(enq.id);
      expect(only.table).toBe("routine_streaks");
      expect(only.op).toBe("increment");
      expect(only.row).toEqual(payload);
      expect(only.clientTs).toBe("2026-05-05T11:30:00.000+00:00");
      expect(only.idempotencyKey).toBe("idem-shape");
      expect(only.attempts).toBe(0);
      expect(only.nextRetryAt).toBeNull();
      expect(only.lastError).toBeNull();
      expect(typeof only.createdAt).toBe("string");
      expect(only.createdAt.length).toBeGreaterThan(0);
    });

    it("returns the legacy LWW ops verbatim (round-trips delete/update/insert payloads)", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      // Insert a legacy LWW row directly — the existing public
      // helpers only cover op='increment'. Keeping this in the test
      // catches drift if a future PR narrows drainSyncOpOutbox.
      db.prepare(
        `INSERT INTO sync_op_outbox
           (table_name, op, row, client_ts, idempotency_key)
         VALUES (?, 'delete', ?, ?, ?)`,
      ).run(
        "routine_entries",
        JSON.stringify({ id: "habit-1:2026-05-05" }),
        "2026-05-05T11:00:00.000+00:00",
        "idem-legacy",
      );

      const drained = await drainSyncOpOutbox(client, { limit: 10, now });
      expect(drained).toHaveLength(1);
      expect(drained[0]).toMatchObject({
        table: "routine_entries",
        op: "delete",
        row: { id: "habit-1:2026-05-05" },
        idempotencyKey: "idem-legacy",
      });
    });
  });

  describe("poison-row quarantine (T3 audit HIGH#3)", () => {
    it("quarantines a row with unparseable JSON and continues draining", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      // Bypass enqueueOutboxIncrement which enforces JSON.stringify;
      // raw INSERT with a malformed payload mimics a corrupted
      // database file rather than a misuse of the public helper.
      db.prepare(
        `INSERT INTO sync_op_outbox
           (id, table_name, op, row, client_ts, idempotency_key)
         VALUES (?, ?, 'increment', ?, ?, ?)`,
      ).run(
        1,
        "routine_streaks",
        "{not-json",
        "2026-05-05T11:00:00.000+00:00",
        "idem-broken",
      );
      db.prepare(
        `INSERT INTO sync_op_outbox
           (id, table_name, op, row, client_ts, idempotency_key)
         VALUES (?, ?, 'increment', ?, ?, ?)`,
      ).run(
        2,
        "routine_streaks",
        JSON.stringify({ delta: 1 }),
        "2026-05-05T11:00:01.000+00:00",
        "idem-good",
      );

      const events: Array<{ id: number; reason: string }> = [];
      const drained = await drainSyncOpOutbox(client, {
        limit: 10,
        now,
        onQuarantine: (e) => events.push({ id: e.id, reason: e.reason }),
      });

      // Poison row is quarantined; the healthy row still drains.
      expect(drained.map((r) => r.id)).toEqual([2]);
      expect(events).toHaveLength(1);
      expect(events[0]?.id).toBe(1);
      expect(events[0]?.reason).toMatch(/^parse_failed:/);

      const poisonRow = db
        .prepare(
          `SELECT status, reject_reason FROM sync_op_outbox WHERE id = ?`,
        )
        .get(1) as { status: string; reject_reason: string };
      expect(poisonRow.status).toBe("quarantined");
      expect(poisonRow.reject_reason).toMatch(/^parse_failed:/);
    });

    it("quarantines a row whose payload parses to an array", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      db.prepare(
        `INSERT INTO sync_op_outbox
           (table_name, op, row, client_ts, idempotency_key)
         VALUES (?, 'increment', ?, ?, ?)`,
      ).run(
        "routine_streaks",
        JSON.stringify([1, 2, 3]),
        "2026-05-05T11:00:00.000+00:00",
        "idem-array",
      );
      const events: Array<{ reason: string }> = [];
      const drained = await drainSyncOpOutbox(client, {
        limit: 10,
        now,
        onQuarantine: (e) => events.push({ reason: e.reason }),
      });
      expect(drained).toHaveLength(0);
      expect(events).toHaveLength(1);
      expect(events[0]?.reason).toBe("non_object_payload:array");
    });

    it("quarantines a row whose payload parses to null", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      db.prepare(
        `INSERT INTO sync_op_outbox
           (table_name, op, row, client_ts, idempotency_key)
         VALUES (?, 'increment', ?, ?, ?)`,
      ).run(
        "routine_streaks",
        "null",
        "2026-05-05T11:00:00.000+00:00",
        "idem-null",
      );
      const events: Array<{ reason: string }> = [];
      const drained = await drainSyncOpOutbox(client, {
        limit: 10,
        now,
        onQuarantine: (e) => events.push({ reason: e.reason }),
      });
      expect(drained).toHaveLength(0);
      expect(events).toHaveLength(1);
      expect(events[0]?.reason).toBe("non_object_payload:null");
    });

    it("quarantines a row whose op sits outside SYNC_OP_OUTBOX_OPS", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      // The CHECK constraint blocks an out-of-tuple INSERT, so drop
      // the constraint by recreating the table — this mimics a
      // future migration that relaxes CHECK without updating this
      // reader.
      db.exec("DROP TABLE sync_op_outbox");
      db.exec(`
        CREATE TABLE sync_op_outbox (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name      TEXT NOT NULL,
          op              TEXT NOT NULL,
          row             TEXT NOT NULL,
          client_ts       TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'pending',
          reject_reason   TEXT,
          attempts        INTEGER NOT NULL DEFAULT 0,
          next_retry_at   TEXT,
          last_error      TEXT,
          created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      db.prepare(
        `INSERT INTO sync_op_outbox
           (table_name, op, row, client_ts, idempotency_key)
         VALUES (?, 'merge', ?, ?, ?)`,
      ).run(
        "routine_streaks",
        JSON.stringify({ delta: 1 }),
        "2026-05-05T11:00:00.000+00:00",
        "idem-bad-op",
      );
      const events: Array<{ reason: string }> = [];
      const drained = await drainSyncOpOutbox(client, {
        limit: 10,
        now,
        onQuarantine: (e) => events.push({ reason: e.reason }),
      });
      expect(drained).toHaveLength(0);
      expect(events).toHaveLength(1);
      expect(events[0]?.reason).toBe("unsupported_op:merge");
    });

    it("does not invoke onQuarantine when no rows are poisoned", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      db.prepare(
        `INSERT INTO sync_op_outbox
           (table_name, op, row, client_ts, idempotency_key)
         VALUES (?, 'increment', ?, ?, ?)`,
      ).run(
        "routine_streaks",
        JSON.stringify({ delta: 1 }),
        "2026-05-05T11:00:00.000+00:00",
        "idem-good",
      );
      const events: Array<unknown> = [];
      const drained = await drainSyncOpOutbox(client, {
        limit: 10,
        now,
        onQuarantine: (e) => events.push(e),
      });
      expect(drained).toHaveLength(1);
      expect(events).toHaveLength(0);
    });

    it("propagates SQL errors when the table is missing", async () => {
      const now = new Date("2026-05-05T12:00:00.000Z");
      db.exec("DROP TABLE sync_op_outbox");
      await expect(
        drainSyncOpOutbox(client, { limit: 10, now }),
      ).rejects.toThrow(/sync_op_outbox/);
    });
  });

  describe("cardinality lock", () => {
    it("pins SYNC_OP_OUTBOX_OPS tuple — drift here means a new op landed without updating drainSyncOpOutbox", () => {
      // If a future PR adds an op (e.g. 'upsert') the migration that
      // relaxes the CHECK must also extend SYNC_OP_OUTBOX_OPS, the
      // server-side OP_LOG_TABLE_REGISTRY, the api-client builder,
      // AND drainSyncOpOutbox's narrowing path. Failing this lock
      // forces the author to revisit each.
      expect(SYNC_OP_OUTBOX_OPS).toEqual([
        "insert",
        "update",
        "delete",
        "increment",
      ]);
    });
  });
});
