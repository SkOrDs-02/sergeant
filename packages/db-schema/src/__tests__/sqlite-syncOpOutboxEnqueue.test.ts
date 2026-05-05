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

/**
 * Integration tests for the durable outbox enqueue helper for
 * PN-counter `op='increment'` envelopes (PR #042d-builder of
 * `docs/planning/storage-roadmap.md`). Runs the full SPIKE +
 * PR #040 + PR #042d-prep migration stack against a fresh
 * `:memory:` engine, then drives the helper through every public
 * branch of its contract:
 *
 *   1. happy path: fresh idempotency_key → row inserted, defaults
 *      applied verbatim, all five contract columns round-trip.
 *   2. dedup path: same idempotency_key second time → no-op,
 *      `inserted=false`, the existing row's id flows through, the
 *      stored payload is untouched (proves the helper does not
 *      stomp on a previously-enqueued row even if the caller's
 *      `row` / `clientTs` differ on the replay).
 *   3. distinct keys: two different idempotency_keys → two rows,
 *      monotonic ids, both selectable as pending via the partial
 *      index installed by PR #040 (`sync_op_outbox_pending_due_idx_lite`).
 *   4. row payload round-trips through JSON.stringify verbatim
 *      (key order preserved; nested objects/arrays survive).
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
}

describe("enqueueOutboxIncrement", () => {
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

  it("inserts a fresh row with op='increment' and schema defaults", async () => {
    const result = await enqueueOutboxIncrement(client, {
      table: "routine_streaks",
      row: { user_id: "user-1", delta: 1 },
      clientTs: "2026-05-04T12:00:00.000+00:00",
      idempotencyKey: "idem-fresh-1",
    });

    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(true);
    expect(result.id).toBeGreaterThan(0);

    const stored = db
      .prepare(
        `SELECT id, table_name, op, row, client_ts, idempotency_key,
                status, reject_reason, attempts, next_retry_at, last_error
           FROM sync_op_outbox
          WHERE idempotency_key = ?`,
      )
      .get("idem-fresh-1") as OutboxRow;
    expect(stored).toEqual({
      id: result.id,
      table_name: "routine_streaks",
      op: "increment",
      row: JSON.stringify({ user_id: "user-1", delta: 1 }),
      client_ts: "2026-05-04T12:00:00.000+00:00",
      idempotency_key: "idem-fresh-1",
      // PR #040 retry defaults: pending, 0 attempts, no retry/error.
      status: "pending",
      reject_reason: null,
      attempts: 0,
      next_retry_at: null,
      last_error: null,
    });
  });

  it("returns inserted=false on a replay and does not stomp the prior row", async () => {
    const first = await enqueueOutboxIncrement(client, {
      table: "routine_streaks",
      row: { user_id: "user-1", delta: 1 },
      clientTs: "2026-05-04T12:00:00.000+00:00",
      idempotencyKey: "idem-replay",
    });
    expect(first.ok).toBe(true);
    expect(first.inserted).toBe(true);

    // Second call with same key but a different payload — caller
    // bug or genuine replay after partial-state confusion. Helper
    // must not overwrite the stored envelope; the original wins.
    const second = await enqueueOutboxIncrement(client, {
      table: "routine_streaks",
      row: { user_id: "user-1", delta: 99 },
      clientTs: "2026-05-04T12:00:01.000+00:00",
      idempotencyKey: "idem-replay",
    });
    expect(second.ok).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.id).toBe(first.id);

    // sync_op_outbox_idem_uniq_lite UNIQUE INDEX guarantees one row.
    const rows = db
      .prepare(
        `SELECT row, client_ts FROM sync_op_outbox
           WHERE idempotency_key = ?`,
      )
      .all("idem-replay") as { row: string; client_ts: string }[];
    expect(rows).toHaveLength(1);
    // Original payload preserved — second call's delta=99 / +1s
    // clientTs were ignored.
    expect(JSON.parse(rows[0]!.row)).toEqual({ user_id: "user-1", delta: 1 });
    expect(rows[0]!.client_ts).toBe("2026-05-04T12:00:00.000+00:00");
  });

  it("treats distinct idempotency_keys as separate rows with monotonic ids", async () => {
    const a = await enqueueOutboxIncrement(client, {
      table: "routine_streaks",
      row: { user_id: "user-1", delta: 1 },
      clientTs: "2026-05-04T12:00:00.000+00:00",
      idempotencyKey: "idem-A",
    });
    const b = await enqueueOutboxIncrement(client, {
      table: "routine_streaks",
      row: { user_id: "user-1", delta: -1 },
      clientTs: "2026-05-04T12:00:01.000+00:00",
      idempotencyKey: "idem-B",
    });
    expect(a.inserted).toBe(true);
    expect(b.inserted).toBe(true);
    expect(b.id).toBeGreaterThan(a.id);

    // Both rows must be visible to the partial-pending index that
    // PR #040 added (`sync_op_outbox_pending_due_idx_lite`). The
    // sync engine's pull-loop reads through this index, so any
    // helper-inserted row that bypasses it would be invisible to
    // the engine — equivalent to "lost" data.
    const pending = db
      .prepare(
        `SELECT id, idempotency_key
           FROM sync_op_outbox INDEXED BY sync_op_outbox_pending_due_idx_lite
          WHERE status = 'pending'
          ORDER BY id ASC`,
      )
      .all() as { id: number; idempotency_key: string }[];
    expect(pending).toEqual([
      { id: a.id, idempotency_key: "idem-A" },
      { id: b.id, idempotency_key: "idem-B" },
    ]);
  });

  it("round-trips a structured row payload through JSON verbatim", async () => {
    // Helper must NOT canonicalise / sort keys — callers that need
    // byte-stable hashing pre-canonicalise. Pin both an unusual
    // key order and a nested array+object so a future
    // "helpfully-sorted" refactor breaks the test loudly.
    const payload = {
      user_id: "user-7",
      delta: -3,
      meta: { source: "habit-undo", attempts: [1, 2, 3] },
    };
    const result = await enqueueOutboxIncrement(client, {
      table: "routine_streaks",
      row: payload,
      clientTs: "2026-05-04T12:34:56.789+00:00",
      idempotencyKey: "idem-payload",
    });
    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(true);

    const stored = db
      .prepare(`SELECT row FROM sync_op_outbox WHERE idempotency_key = ?`)
      .get("idem-payload") as { row: string };
    // Byte-stable JSON: same key order, nested objects, nested arrays.
    expect(stored.row).toBe(JSON.stringify(payload));
    expect(JSON.parse(stored.row)).toEqual(payload);
  });

  it("does not bump retry-state columns when re-enqueueing under the same key", async () => {
    // Setup: enqueue once, then mutate retry-state out-of-band to
    // mimic an engine that bumped attempts after a failed push.
    const first = await enqueueOutboxIncrement(client, {
      table: "routine_streaks",
      row: { user_id: "user-1", delta: 1 },
      clientTs: "2026-05-04T12:00:00.000+00:00",
      idempotencyKey: "idem-retry",
    });
    expect(first.inserted).toBe(true);

    db.prepare(
      `UPDATE sync_op_outbox
          SET attempts = ?, next_retry_at = ?, last_error = ?
        WHERE idempotency_key = ?`,
    ).run(3, "2026-05-04T12:00:08.000Z", "http_503", "idem-retry");

    // Re-enqueue: helper must NOT reset retry-state — that is
    // `planRetry`'s job, not enqueue's. Replays of an already-
    // pending envelope are no-ops.
    const replay = await enqueueOutboxIncrement(client, {
      table: "routine_streaks",
      row: { user_id: "user-1", delta: 1 },
      clientTs: "2026-05-04T12:00:00.000+00:00",
      idempotencyKey: "idem-retry",
    });
    expect(replay.inserted).toBe(false);
    expect(replay.id).toBe(first.id);

    const stored = db
      .prepare(
        `SELECT attempts, next_retry_at, last_error
           FROM sync_op_outbox
          WHERE idempotency_key = ?`,
      )
      .get("idem-retry") as {
      attempts: number;
      next_retry_at: string | null;
      last_error: string | null;
    };
    expect(stored).toEqual({
      attempts: 3,
      next_retry_at: "2026-05-04T12:00:08.000Z",
      last_error: "http_503",
    });
  });

  it("propagates SQL errors verbatim when the schema rejects the row", async () => {
    // Drop the outbox table to simulate a corrupt/uninitialised
    // client. The helper must NOT swallow the resulting "no such
    // table" error — higher-level callers need to surface it.
    db.exec("DROP TABLE sync_op_outbox");

    await expect(
      enqueueOutboxIncrement(client, {
        table: "routine_streaks",
        row: { delta: 1 },
        clientTs: "2026-05-04T12:00:00.000+00:00",
        idempotencyKey: "idem-corrupt",
      }),
    ).rejects.toThrow(/sync_op_outbox/);
  });
});
