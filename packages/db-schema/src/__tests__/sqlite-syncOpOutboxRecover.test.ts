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
import { recoverDeadLetter } from "../sqlite/syncOpOutboxRecover.js";

/**
 * Integration tests for the dead-letter recovery helper
 * (`recoverDeadLetter`, PR #042e-recover of
 * `docs/planning/storage-roadmap.md`). Runs the full SPIKE + PR #040
 * + PR #042d-prep migration stack against a fresh `:memory:` engine
 * and pins the contract:
 *
 *  1. selector mutual-exclusion (exactly one of `ids` / `all`);
 *  2. id validation (finite integer, non-negative);
 *  3. id-based recovery: dead-letter rows transition to pending,
 *     state is fully reset (`attempts=0`, `next_retry_at=NULL`,
 *     `last_error=NULL`), non-dead-letter ids land in `skipped`,
 *     duplicate ids are de-duplicated;
 *  4. all-mode recovery: every dead-letter row transitions, others
 *     are untouched, empty bucket short-circuits to `[]`;
 *  5. concurrency / idempotency: `WHERE status='dead_letter'` guard
 *     leaves rows that another worker already moved alone.
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

interface OutboxRow {
  id: number;
  status: string;
  attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
}

function readRow(db: BetterSqliteDatabase, id: number): OutboxRow | undefined {
  return db
    .prepare(
      `SELECT id, status, attempts, next_retry_at, last_error
         FROM sync_op_outbox WHERE id = ?`,
    )
    .get(id) as OutboxRow | undefined;
}

async function enqueueFresh(
  client: SqliteMigrationClient,
  idempotencyKey: string,
): Promise<number> {
  const r = await enqueueOutboxIncrement(client, {
    userId: "u-test",
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
  status: "pending" | "rejected" | "dead_letter" | "quarantined",
): void {
  db.prepare(`UPDATE sync_op_outbox SET status = ? WHERE id = ?`).run(
    status,
    id,
  );
}

function setDeadLetterState(
  db: BetterSqliteDatabase,
  id: number,
  attempts: number,
  nextRetryAt: string,
  lastError: string,
): void {
  db.prepare(
    `UPDATE sync_op_outbox
        SET status = 'dead_letter',
            attempts = ?,
            next_retry_at = ?,
            last_error = ?
      WHERE id = ?`,
  ).run(attempts, nextRetryAt, lastError, id);
}

describe("recoverDeadLetter", () => {
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

  // ───────────────────────────────────────────────────────────────
  // selector validation
  // ───────────────────────────────────────────────────────────────

  describe("selector validation", () => {
    it("throws when neither ids nor all is set", async () => {
      await expect(recoverDeadLetter(client, {} as never)).rejects.toThrow(
        /exactly one of \{ ids \} or \{ all: true \}/,
      );
    });

    it("throws when both ids and all are set", async () => {
      await expect(
        recoverDeadLetter(client, { ids: [1], all: true } as never),
      ).rejects.toThrow(/exactly one of \{ ids \} or \{ all: true \}/);
    });

    it("throws when ids contains a non-integer (NaN)", async () => {
      await expect(
        recoverDeadLetter(client, { ids: [1, Number.NaN, 3] }),
      ).rejects.toThrow(/finite integers/);
    });

    it("throws when ids contains a fractional number", async () => {
      await expect(recoverDeadLetter(client, { ids: [1.5] })).rejects.toThrow(
        /finite integers/,
      );
    });

    it("throws when ids contains a negative number", async () => {
      await expect(recoverDeadLetter(client, { ids: [-1] })).rejects.toThrow(
        /non-negative/,
      );
    });

    it("does not throw when ids is empty", async () => {
      const result = await recoverDeadLetter(client, { ids: [] });
      expect(result).toEqual({ recovered: [], skipped: [] });
    });
  });

  // ───────────────────────────────────────────────────────────────
  // id-based recovery
  // ───────────────────────────────────────────────────────────────

  describe("id-based recovery", () => {
    it("transitions a single dead-letter row to pending and reports it as recovered", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(db, a, 7, "2026-05-05T13:00:00.000Z", "http_503");

      const result = await recoverDeadLetter(client, { ids: [a] });

      expect(result).toEqual({ recovered: [a], skipped: [] });
      const row = readRow(db, a);
      expect(row?.status).toBe("pending");
      expect(row?.attempts).toBe(0);
      expect(row?.next_retry_at).toBeNull();
      expect(row?.last_error).toBeNull();
    });

    it("recovers multiple dead-letter rows in a single UPDATE", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const b = await enqueueFresh(client, "idem-B");
      const c = await enqueueFresh(client, "idem-C");
      setDeadLetterState(db, a, 7, "2026-05-05T13:00:00.000Z", "http_503");
      setDeadLetterState(db, b, 7, "2026-05-05T13:00:00.000Z", "network");
      setDeadLetterState(db, c, 7, "2026-05-05T13:00:00.000Z", "aborted");

      const result = await recoverDeadLetter(client, { ids: [a, b, c] });

      expect([...result.recovered].sort()).toEqual([a, b, c].sort());
      expect(result.skipped).toEqual([]);
      for (const id of [a, b, c]) {
        const row = readRow(db, id);
        expect(row?.status).toBe("pending");
        expect(row?.attempts).toBe(0);
        expect(row?.next_retry_at).toBeNull();
        expect(row?.last_error).toBeNull();
      }
    });

    it("reports non-dead-letter ids in skipped, recovers the dead-letter ones", async () => {
      const a = await enqueueFresh(client, "idem-A"); // stays pending
      const b = await enqueueFresh(client, "idem-B"); // dead_letter
      const c = await enqueueFresh(client, "idem-C"); // rejected
      setDeadLetterState(db, b, 7, "2026-05-05T13:00:00.000Z", "http_503");
      setStatus(db, c, "rejected");

      const result = await recoverDeadLetter(client, { ids: [a, b, c] });

      expect(result.recovered).toEqual([b]);
      expect([...result.skipped].sort()).toEqual([a, c].sort());
      expect(readRow(db, a)?.status).toBe("pending");
      expect(readRow(db, b)?.status).toBe("pending");
      expect(readRow(db, c)?.status).toBe("rejected");
    });

    it("reports missing ids in skipped without throwing", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(db, a, 7, "2026-05-05T13:00:00.000Z", "http_503");

      const result = await recoverDeadLetter(client, {
        ids: [a, 99_999, 100_000],
      });

      expect(result.recovered).toEqual([a]);
      // Natural input order is preserved (no implicit sort).
      expect(result.skipped).toEqual([99_999, 100_000]);
    });

    it("de-duplicates ids in the input (a row is recovered exactly once)", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(db, a, 7, "2026-05-05T13:00:00.000Z", "http_503");

      const result = await recoverDeadLetter(client, {
        ids: [a, a, a, a],
      });

      // Recovered list contains the id exactly once (de-duped).
      expect(result.recovered).toEqual([a]);
      expect(result.skipped).toEqual([]);
      expect(readRow(db, a)?.status).toBe("pending");
    });

    it("is idempotent on a second call (already-recovered row lands in skipped)", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(db, a, 7, "2026-05-05T13:00:00.000Z", "http_503");

      const first = await recoverDeadLetter(client, { ids: [a] });
      const second = await recoverDeadLetter(client, { ids: [a] });

      expect(first).toEqual({ recovered: [a], skipped: [] });
      expect(second).toEqual({ recovered: [], skipped: [a] });
      expect(readRow(db, a)?.status).toBe("pending");
    });

    it("does not touch sibling rows (non-dead-letter rows survive verbatim)", async () => {
      const pending = await enqueueFresh(client, "idem-pending");
      const rejected = await enqueueFresh(client, "idem-rejected");
      const dead = await enqueueFresh(client, "idem-dead");
      setStatus(db, rejected, "rejected");
      setDeadLetterState(db, dead, 7, "2026-05-05T13:00:00.000Z", "http_503");

      // Recover by id list that includes the dead row.
      await recoverDeadLetter(client, { ids: [dead] });

      const pendingRow = readRow(db, pending);
      const rejectedRow = readRow(db, rejected);
      expect(pendingRow?.status).toBe("pending");
      expect(pendingRow?.attempts).toBe(0); // fresh enqueue stays at 0
      expect(rejectedRow?.status).toBe("rejected");
    });

    it("returns empty result when all ids are missing", async () => {
      const result = await recoverDeadLetter(client, {
        ids: [99_999, 100_000],
      });
      expect(result).toEqual({
        recovered: [],
        skipped: [99_999, 100_000],
      });
    });
  });

  // ───────────────────────────────────────────────────────────────
  // all-mode recovery
  // ───────────────────────────────────────────────────────────────

  describe("all-mode recovery", () => {
    it("returns empty result when no dead-letter rows exist", async () => {
      const result = await recoverDeadLetter(client, { all: true });
      expect(result).toEqual({ recovered: [], skipped: [] });
    });

    it("recovers every dead-letter row in one call", async () => {
      const ids: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const id = await enqueueFresh(client, `idem-${i}`);
        ids.push(id);
        setDeadLetterState(
          db,
          id,
          7,
          "2026-05-05T13:00:00.000Z",
          `http_50${i}`,
        );
      }

      const result = await recoverDeadLetter(client, { all: true });

      expect([...result.recovered].sort()).toEqual(ids.sort());
      expect(result.skipped).toEqual([]);
      for (const id of ids) {
        const row = readRow(db, id);
        expect(row?.status).toBe("pending");
        expect(row?.attempts).toBe(0);
        expect(row?.next_retry_at).toBeNull();
        expect(row?.last_error).toBeNull();
      }
    });

    it("recovers only dead-letter rows; pending and rejected rows are untouched", async () => {
      const pending = await enqueueFresh(client, "idem-pending");
      const rejected = await enqueueFresh(client, "idem-rejected");
      const dead1 = await enqueueFresh(client, "idem-dead-1");
      const dead2 = await enqueueFresh(client, "idem-dead-2");
      setStatus(db, rejected, "rejected");
      setDeadLetterState(db, dead1, 7, "2026-05-05T13:00:00.000Z", "http_503");
      setDeadLetterState(db, dead2, 7, "2026-05-05T13:00:00.000Z", "network");

      const result = await recoverDeadLetter(client, { all: true });

      expect([...result.recovered].sort()).toEqual([dead1, dead2].sort());
      expect(result.skipped).toEqual([]);
      expect(readRow(db, pending)?.status).toBe("pending");
      expect(readRow(db, rejected)?.status).toBe("rejected");
      expect(readRow(db, dead1)?.status).toBe("pending");
      expect(readRow(db, dead2)?.status).toBe("pending");
    });

    it("is idempotent (second all-mode call recovers nothing)", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const b = await enqueueFresh(client, "idem-B");
      setDeadLetterState(db, a, 7, "2026-05-05T13:00:00.000Z", "http_503");
      setDeadLetterState(db, b, 7, "2026-05-05T13:00:00.000Z", "network");

      const first = await recoverDeadLetter(client, { all: true });
      const second = await recoverDeadLetter(client, { all: true });

      expect([...first.recovered].sort()).toEqual([a, b].sort());
      expect(second).toEqual({ recovered: [], skipped: [] });
    });
  });

  // ───────────────────────────────────────────────────────────────
  // state-reset invariant
  // ───────────────────────────────────────────────────────────────

  describe("state-reset invariant", () => {
    it("resets attempts to 0 even when the dead-letter row had attempts > SYNC_OP_MAX_ATTEMPTS", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(
        db,
        a,
        99, // synthetic over-the-cap value
        "2099-01-01T00:00:00.000Z",
        "http_503",
      );

      await recoverDeadLetter(client, { ids: [a] });

      const row = readRow(db, a);
      expect(row?.attempts).toBe(0);
    });

    it("clears next_retry_at even when it was far in the future", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(db, a, 7, "2099-01-01T00:00:00.000Z", "http_503");

      await recoverDeadLetter(client, { ids: [a] });

      expect(readRow(db, a)?.next_retry_at).toBeNull();
    });

    it("clears last_error so the next push tick has a fresh slate", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(
        db,
        a,
        7,
        "2026-05-05T13:00:00.000Z",
        "some_long_error_label",
      );

      await recoverDeadLetter(client, { ids: [a] });

      expect(readRow(db, a)?.last_error).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────
  // race / concurrency invariant — WHERE status='dead_letter' guard
  // ───────────────────────────────────────────────────────────────

  describe("race-safety invariant", () => {
    it("does not clobber a row that another worker has just moved out of dead-letter", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(db, a, 7, "2026-05-05T13:00:00.000Z", "http_503");
      // Simulate the race: first recovery moves it to pending, then
      // an out-of-band tool sets attempts to 5 (e.g., a manual SQL
      // patch). A second recovery call must not reset attempts on
      // a row that is no longer dead-letter.
      await recoverDeadLetter(client, { ids: [a] });
      db.prepare(
        `UPDATE sync_op_outbox SET attempts = 5, last_error = 'manual_patch'
          WHERE id = ?`,
      ).run(a);

      const result = await recoverDeadLetter(client, { ids: [a] });

      expect(result).toEqual({ recovered: [], skipped: [a] });
      const row = readRow(db, a);
      expect(row?.status).toBe("pending");
      expect(row?.attempts).toBe(5);
      expect(row?.last_error).toBe("manual_patch");
    });

    it("leaves a row that became 'rejected' between calls alone", async () => {
      const a = await enqueueFresh(client, "idem-A");
      setDeadLetterState(db, a, 7, "2026-05-05T13:00:00.000Z", "http_503");
      // Out-of-band: the row is moved to rejected (e.g., operator
      // diagnosed the underlying schema drift and set it terminal).
      setStatus(db, a, "rejected");

      const result = await recoverDeadLetter(client, { ids: [a] });

      expect(result).toEqual({ recovered: [], skipped: [a] });
      expect(readRow(db, a)?.status).toBe("rejected");
    });
  });
});
