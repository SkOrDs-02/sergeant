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
import {
  markOutboxRejected,
  markOutboxRetry,
  markOutboxSuccess,
} from "../sqlite/syncOpOutboxLifecycle.js";
import { planRetry } from "../sqlite/syncOpRetry.js";

/**
 * Integration tests for the write-side lifecycle helpers
 * (`markOutboxSuccess` / `markOutboxRetry` / `markOutboxRejected`,
 * PR #042e-lifecycle of `docs/planning/storage-roadmap.md`). Runs the
 * full SPIKE + PR #040 + PR #042d-prep migration stack against a
 * fresh `:memory:` engine and exercises every contract:
 *
 *  1. markOutboxSuccess — DELETEs by id; idempotent on a missing
 *     row; does not touch sibling rows.
 *  2. markOutboxRetry — UPDATEs `attempts/status/next_retry_at/last_error`
 *     atomically from a `planRetry` plan; flips to `'dead_letter'`
 *     after `SYNC_OP_MAX_ATTEMPTS`; guarded against terminal-status
 *     rows; idempotent on a missing row.
 *  3. markOutboxRejected — UPDATEs `status='rejected'` + `reject_reason`;
 *     guarded against terminal-status rows; idempotent on a missing
 *     row.
 *  4. Cross-helper invariant — a row that has been advanced through
 *     any helper is no longer drained on subsequent ticks (status
 *     filter in `drainSyncOpOutbox` keeps lifecycle one-way).
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
  table_name: string;
  op: string;
  row: string;
  client_ts: string;
  idempotency_key: string;
  status: string;
  reject_reason: string | null;
  attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
}

function readRow(db: BetterSqliteDatabase, id: number): OutboxRow | undefined {
  return db.prepare(`SELECT * FROM sync_op_outbox WHERE id = ?`).get(id) as
    | OutboxRow
    | undefined;
}

function readAll(db: BetterSqliteDatabase): OutboxRow[] {
  return db
    .prepare(`SELECT * FROM sync_op_outbox ORDER BY id ASC`)
    .all() as OutboxRow[];
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

describe("syncOpOutboxLifecycle", () => {
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

  describe("markOutboxSuccess", () => {
    it("deletes the row by id and leaves siblings untouched", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const b = await enqueueFresh(client, "idem-B");
      const c = await enqueueFresh(client, "idem-C");

      await markOutboxSuccess(client, b);

      const remaining = readAll(db);
      expect(remaining.map((r) => r.id)).toEqual([a, c]);
      expect(remaining.map((r) => r.idempotency_key)).toEqual([
        "idem-A",
        "idem-C",
      ]);
    });

    it("is idempotent on a missing id (silent no-op)", async () => {
      const a = await enqueueFresh(client, "idem-A");

      await expect(markOutboxSuccess(client, 99_999)).resolves.toBeUndefined();

      // Sibling row is untouched.
      const row = readRow(db, a);
      expect(row?.status).toBe("pending");
    });

    it("is idempotent on a re-call of an already-deleted id", async () => {
      const a = await enqueueFresh(client, "idem-A");

      await markOutboxSuccess(client, a);
      // Second call must not throw and must leave state at "row gone".
      await expect(markOutboxSuccess(client, a)).resolves.toBeUndefined();
      expect(readRow(db, a)).toBeUndefined();
    });

    it("does not delete a non-pending row only by id (it deletes by id, period)", async () => {
      // markOutboxSuccess intentionally has NO status guard — once the
      // server says applied, the row is gone regardless of how it
      // wound up in a non-pending state. This test pins that
      // contract: callers should only ever invoke this on rows that
      // a successful push acknowledged.
      const a = await enqueueFresh(client, "idem-A");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'rejected', reject_reason = ? WHERE id = ?`,
      ).run("engine_invalid_delta", a);

      await markOutboxSuccess(client, a);
      expect(readRow(db, a)).toBeUndefined();
    });
  });

  describe("markOutboxRetry", () => {
    const transientError = "http_503";

    it("updates attempts/status/next_retry_at/last_error from planRetry on first failure", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const now = new Date("2026-05-05T12:00:00.000Z");
      const plan = planRetry(0, now, transientError);

      await markOutboxRetry(client, a, plan);

      const row = readRow(db, a);
      expect(row).toBeDefined();
      expect(row?.status).toBe("pending");
      expect(row?.attempts).toBe(1);
      expect(row?.last_error).toBe(transientError);
      // Default base backoff = 1s after the first failed attempt.
      expect(row?.next_retry_at).toBe("2026-05-05T12:00:01.000Z");
    });

    it("flips to dead_letter after SYNC_OP_MAX_ATTEMPTS failures and clears next_retry_at", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const now = new Date("2026-05-05T12:00:00.000Z");
      // After 9 prior failures, the 10th call reaches the cap.
      const plan = planRetry(9, now, transientError);

      await markOutboxRetry(client, a, plan);

      const row = readRow(db, a);
      expect(row?.status).toBe("dead_letter");
      expect(row?.attempts).toBe(10);
      expect(row?.next_retry_at).toBeNull();
      expect(row?.last_error).toBe(transientError);
    });

    it("is a no-op on an already-rejected row (status='pending' guard)", async () => {
      const a = await enqueueFresh(client, "idem-A");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'rejected', reject_reason = ? WHERE id = ?`,
      ).run("engine_invalid_delta", a);

      const plan = planRetry(
        0,
        new Date("2026-05-05T12:00:00.000Z"),
        "http_503",
      );
      await markOutboxRetry(client, a, plan);

      const row = readRow(db, a);
      expect(row?.status).toBe("rejected");
      expect(row?.reject_reason).toBe("engine_invalid_delta");
      expect(row?.attempts).toBe(0);
      expect(row?.next_retry_at).toBeNull();
      expect(row?.last_error).toBeNull();
    });

    it("is a no-op on an already-dead-letter row (status='pending' guard)", async () => {
      const a = await enqueueFresh(client, "idem-A");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'dead_letter', attempts = 10 WHERE id = ?`,
      ).run(a);

      const plan = planRetry(
        0,
        new Date("2026-05-05T12:00:00.000Z"),
        "http_503",
      );
      await markOutboxRetry(client, a, plan);

      const row = readRow(db, a);
      expect(row?.status).toBe("dead_letter");
      expect(row?.attempts).toBe(10);
      expect(row?.last_error).toBeNull();
    });

    it("is idempotent on a missing id (silent no-op)", async () => {
      const a = await enqueueFresh(client, "idem-A");

      const plan = planRetry(
        0,
        new Date("2026-05-05T12:00:00.000Z"),
        "http_503",
      );
      await expect(
        markOutboxRetry(client, 99_999, plan),
      ).resolves.toBeUndefined();

      const row = readRow(db, a);
      expect(row?.status).toBe("pending");
      expect(row?.attempts).toBe(0);
    });

    it("does not touch siblings when one row is retried", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const b = await enqueueFresh(client, "idem-B");

      const plan = planRetry(
        2,
        new Date("2026-05-05T12:00:00.000Z"),
        "http_503",
      );
      await markOutboxRetry(client, b, plan);

      const rowA = readRow(db, a);
      const rowB = readRow(db, b);
      expect(rowA?.attempts).toBe(0);
      expect(rowA?.last_error).toBeNull();
      expect(rowA?.next_retry_at).toBeNull();
      expect(rowB?.attempts).toBe(3);
      expect(rowB?.last_error).toBe("http_503");
      expect(rowB?.next_retry_at).toBe("2026-05-05T12:00:04.000Z");
    });
  });

  describe("markOutboxRejected", () => {
    it("sets status='rejected' and writes reject_reason", async () => {
      const a = await enqueueFresh(client, "idem-A");

      await markOutboxRejected(client, a, "op_not_supported");

      const row = readRow(db, a);
      expect(row?.status).toBe("rejected");
      expect(row?.reject_reason).toBe("op_not_supported");
      // attempts/next_retry_at/last_error untouched — they belong to
      // the transient-retry path, not the terminal-reject path.
      expect(row?.attempts).toBe(0);
      expect(row?.next_retry_at).toBeNull();
      expect(row?.last_error).toBeNull();
    });

    it("is a no-op on an already-rejected row (status='pending' guard)", async () => {
      const a = await enqueueFresh(client, "idem-A");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'rejected', reject_reason = ? WHERE id = ?`,
      ).run("first_reason", a);

      await markOutboxRejected(client, a, "second_reason");

      const row = readRow(db, a);
      expect(row?.status).toBe("rejected");
      // First reason wins — second call is suppressed.
      expect(row?.reject_reason).toBe("first_reason");
    });

    it("is a no-op on a dead-letter row (status='pending' guard)", async () => {
      const a = await enqueueFresh(client, "idem-A");
      db.prepare(
        `UPDATE sync_op_outbox SET status = 'dead_letter', attempts = 10 WHERE id = ?`,
      ).run(a);

      await markOutboxRejected(client, a, "op_not_supported");

      const row = readRow(db, a);
      expect(row?.status).toBe("dead_letter");
      expect(row?.reject_reason).toBeNull();
    });

    it("is idempotent on a missing id (silent no-op)", async () => {
      const a = await enqueueFresh(client, "idem-A");

      await expect(
        markOutboxRejected(client, 99_999, "op_not_supported"),
      ).resolves.toBeUndefined();

      const row = readRow(db, a);
      expect(row?.status).toBe("pending");
      expect(row?.reject_reason).toBeNull();
    });

    it("writes reject_reason verbatim (no canonicalisation)", async () => {
      // Server emits stable enum strings — the helper must not
      // re-encode them. A reason with internal whitespace / colons
      // round-trips byte-for-byte so dashboard string-match alerts
      // see what the server sent.
      const a = await enqueueFresh(client, "idem-A");

      await markOutboxRejected(client, a, "invalid_delta:non_finite");

      const row = readRow(db, a);
      expect(row?.reject_reason).toBe("invalid_delta:non_finite");
    });

    it("does not touch siblings when one row is rejected", async () => {
      const a = await enqueueFresh(client, "idem-A");
      const b = await enqueueFresh(client, "idem-B");

      await markOutboxRejected(client, b, "op_not_supported");

      const rowA = readRow(db, a);
      const rowB = readRow(db, b);
      expect(rowA?.status).toBe("pending");
      expect(rowA?.reject_reason).toBeNull();
      expect(rowB?.status).toBe("rejected");
      expect(rowB?.reject_reason).toBe("op_not_supported");
    });
  });

  describe("cross-helper invariants", () => {
    it("a deleted row cannot be re-rejected or re-retried", async () => {
      const a = await enqueueFresh(client, "idem-A");

      await markOutboxSuccess(client, a);

      // Both lifecycle calls on a now-missing row are silent no-ops;
      // post-condition: row is still gone, no side-effect resurrected
      // it.
      await markOutboxRejected(client, a, "op_not_supported");
      const plan = planRetry(
        0,
        new Date("2026-05-05T12:00:00.000Z"),
        "http_503",
      );
      await markOutboxRetry(client, a, plan);

      expect(readRow(db, a)).toBeUndefined();
    });

    it("a rejected row cannot be re-retried", async () => {
      // Captures the contract that lifecycle is one-way: rejected is
      // terminal, the engine never re-enters retry on it.
      const a = await enqueueFresh(client, "idem-A");

      await markOutboxRejected(client, a, "op_not_supported");
      const plan = planRetry(
        0,
        new Date("2026-05-05T12:00:00.000Z"),
        "http_503",
      );
      await markOutboxRetry(client, a, plan);

      const row = readRow(db, a);
      expect(row?.status).toBe("rejected");
      expect(row?.reject_reason).toBe("op_not_supported");
      expect(row?.attempts).toBe(0);
      expect(row?.last_error).toBeNull();
      expect(row?.next_retry_at).toBeNull();
    });

    it("a dead-letter row cannot be re-rejected without explicit reset", async () => {
      // Dead-letter rows wait for human triage; the lifecycle helpers
      // never auto-flip them to rejected. A triage path that
      // resets to 'pending' out of band can re-engage them, but
      // these helpers won't.
      const a = await enqueueFresh(client, "idem-A");
      const now = new Date("2026-05-05T12:00:00.000Z");
      const plan = planRetry(9, now, "http_503");

      await markOutboxRetry(client, a, plan);
      const afterRetry = readRow(db, a);
      expect(afterRetry?.status).toBe("dead_letter");

      await markOutboxRejected(client, a, "op_not_supported");
      const afterReject = readRow(db, a);
      expect(afterReject?.status).toBe("dead_letter");
      expect(afterReject?.reject_reason).toBeNull();
    });

    it("retry can succeed on the first attempt, then a follow-up success deletes the row", async () => {
      // End-to-end: enqueue → first push fails (retry) → second push
      // succeeds (delete). Captures the steady-state engine flow that
      // PR #042e-pushloop consumes.
      const a = await enqueueFresh(client, "idem-A");

      const plan = planRetry(
        0,
        new Date("2026-05-05T12:00:00.000Z"),
        "http_503",
      );
      await markOutboxRetry(client, a, plan);

      const afterRetry = readRow(db, a);
      expect(afterRetry?.status).toBe("pending");
      expect(afterRetry?.attempts).toBe(1);

      await markOutboxSuccess(client, a);
      expect(readRow(db, a)).toBeUndefined();
    });
  });
});
