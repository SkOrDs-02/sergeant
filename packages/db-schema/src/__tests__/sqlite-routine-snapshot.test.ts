import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  routineEntries,
  routineStreaks,
  syncOpOutbox,
  syncOpCursor,
  SYNC_OP_OUTBOX_OPS,
  SYNC_OP_OUTBOX_STATUSES,
  SYNC_OP_CURSOR_PULL_SINCE,
} from "../sqlite/routine.js";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";

/**
 * Snapshot tests for the SQLite Drizzle schemas under `sqlite/routine.ts`,
 * mirroring the structural lock-down that `pg-routine-snapshot.test.ts`
 * applies to the Postgres source-of-truth.
 *
 * Why both PG and SQLite snapshots: Stage 4 of `docs/planning/storage-roadmap.md`
 * relies on the two schemas staying byte-aligned (mod the documented PG↔SQLite
 * differences in `migrations/index.ts`). Drift here means push/pull echo a row
 * that round-trips with subtly different data, and LWW comparisons stop being
 * symmetric across devices and the server.
 *
 * Coverage:
 *   - column ordering and names
 *   - dataType + columnType + nullability + hasDefault
 *   - PK columns
 *   - declared indexes
 *   - partial-index `WHERE` clauses on `routine_entries_user_active_idx_lite`
 *     and `sync_op_outbox_pending_idx_lite`
 *   - the production-named migration constants (`ROUTINE_CLIENT_MIGRATIONS`,
 *     `ROUTINE_MIGRATIONS_TABLE`) and the deprecated `ROUTINE_SPIKE_*` aliases
 *     so consumers can rely on the historical SPIKE names too.
 */

describe("sqlite/routineEntries schema snapshot", () => {
  const config = getTableConfig(routineEntries);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_entries");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "user_id",
      "name",
      "completed_at",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares column types matching `001_routine_spike.sql`", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    // id TEXT PRIMARY KEY
    expect(columnMap["id"]!.dataType).toBe("string");
    expect(columnMap["id"]!.columnType).toBe("SQLiteText");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.notNull).toBe(true);

    // user_id TEXT NOT NULL
    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(true);

    // name TEXT NOT NULL
    expect(columnMap["name"]!.dataType).toBe("string");
    expect(columnMap["name"]!.notNull).toBe(true);

    // completed_at TEXT (nullable, ISO-8601)
    expect(columnMap["completed_at"]!.dataType).toBe("string");
    expect(columnMap["completed_at"]!.notNull).toBe(false);

    // created_at TEXT NOT NULL DEFAULT (datetime('now'))
    expect(columnMap["created_at"]!.dataType).toBe("string");
    expect(columnMap["created_at"]!.notNull).toBe(true);
    expect(columnMap["created_at"]!.hasDefault).toBe(true);

    // updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    expect(columnMap["updated_at"]!.dataType).toBe("string");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);

    // deleted_at TEXT (nullable, soft-delete tombstone)
    expect(columnMap["deleted_at"]!.dataType).toBe("string");
    expect(columnMap["deleted_at"]!.notNull).toBe(false);
  });

  it("declares both `_lite`-suffixed indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("routine_entries_user_created_idx_lite");
    expect(indexNames).toContain("routine_entries_user_active_idx_lite");
  });

  it("partial active index has WHERE clause on deleted_at", () => {
    const activeIdx = config.indexes.find(
      (i) => i.config.name === "routine_entries_user_active_idx_lite",
    );
    expect(activeIdx).toBeDefined();
    expect(activeIdx!.config.where).toBeDefined();
  });
});

describe("sqlite/routineStreaks schema snapshot", () => {
  const config = getTableConfig(routineStreaks);

  it("has the canonical table name", () => {
    expect(config.name).toBe("routine_streaks");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "user_id",
      "current_streak",
      "longest_streak",
      "last_completed_at",
    ]);
  });

  it("declares column types matching `001_routine_spike.sql`", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    // user_id TEXT PRIMARY KEY
    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.primary).toBe(true);
    expect(columnMap["user_id"]!.notNull).toBe(true);

    // current_streak INTEGER NOT NULL DEFAULT 0
    expect(columnMap["current_streak"]!.dataType).toBe("number");
    expect(columnMap["current_streak"]!.notNull).toBe(true);
    expect(columnMap["current_streak"]!.hasDefault).toBe(true);

    // longest_streak INTEGER NOT NULL DEFAULT 0
    expect(columnMap["longest_streak"]!.dataType).toBe("number");
    expect(columnMap["longest_streak"]!.notNull).toBe(true);
    expect(columnMap["longest_streak"]!.hasDefault).toBe(true);

    // last_completed_at TEXT (nullable, ISO-8601)
    expect(columnMap["last_completed_at"]!.dataType).toBe("string");
    expect(columnMap["last_completed_at"]!.notNull).toBe(false);
  });
});

describe("sqlite/syncOpOutbox schema snapshot", () => {
  const config = getTableConfig(syncOpOutbox);

  it("has the canonical table name", () => {
    expect(config.name).toBe("sync_op_outbox");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
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
  });

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    // id INTEGER PRIMARY KEY AUTOINCREMENT
    expect(columnMap["id"]!.dataType).toBe("number");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.notNull).toBe(true);

    // table_name TEXT NOT NULL
    expect(columnMap["table_name"]!.dataType).toBe("string");
    expect(columnMap["table_name"]!.notNull).toBe(true);

    // op TEXT NOT NULL CHECK (op IN ('insert','update','delete'))
    expect(columnMap["op"]!.dataType).toBe("string");
    expect(columnMap["op"]!.notNull).toBe(true);

    // row TEXT NOT NULL (JSON-serialised payload)
    expect(columnMap["row"]!.dataType).toBe("string");
    expect(columnMap["row"]!.notNull).toBe(true);

    // client_ts TEXT NOT NULL (ISO-8601-with-offset)
    expect(columnMap["client_ts"]!.dataType).toBe("string");
    expect(columnMap["client_ts"]!.notNull).toBe(true);

    // idempotency_key TEXT NOT NULL (UNIQUE — see index)
    expect(columnMap["idempotency_key"]!.dataType).toBe("string");
    expect(columnMap["idempotency_key"]!.notNull).toBe(true);

    // status TEXT NOT NULL DEFAULT 'pending' CHECK …
    expect(columnMap["status"]!.dataType).toBe("string");
    expect(columnMap["status"]!.notNull).toBe(true);
    expect(columnMap["status"]!.hasDefault).toBe(true);

    // reject_reason TEXT (nullable)
    expect(columnMap["reject_reason"]!.dataType).toBe("string");
    expect(columnMap["reject_reason"]!.notNull).toBe(false);

    // attempts INTEGER NOT NULL DEFAULT 0 — PR #040 retry counter.
    expect(columnMap["attempts"]!.dataType).toBe("number");
    expect(columnMap["attempts"]!.notNull).toBe(true);
    expect(columnMap["attempts"]!.hasDefault).toBe(true);

    // next_retry_at TEXT (nullable, ISO-8601 — earliest retry).
    expect(columnMap["next_retry_at"]!.dataType).toBe("string");
    expect(columnMap["next_retry_at"]!.notNull).toBe(false);

    // last_error TEXT (nullable, free-form transient-error reason).
    expect(columnMap["last_error"]!.dataType).toBe("string");
    expect(columnMap["last_error"]!.notNull).toBe(false);

    // created_at TEXT NOT NULL DEFAULT (datetime('now'))
    expect(columnMap["created_at"]!.dataType).toBe("string");
    expect(columnMap["created_at"]!.notNull).toBe(true);
    expect(columnMap["created_at"]!.hasDefault).toBe(true);
  });

  it("declares all three indexes (UNIQUE idem, partial pending, partial pending+due)", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("sync_op_outbox_idem_uniq_lite");
    expect(indexNames).toContain("sync_op_outbox_pending_idx_lite");
    expect(indexNames).toContain("sync_op_outbox_pending_due_idx_lite");
  });

  it("idempotency_key index is UNIQUE", () => {
    const idemIdx = config.indexes.find(
      (i) => i.config.name === "sync_op_outbox_idem_uniq_lite",
    );
    expect(idemIdx).toBeDefined();
    expect(idemIdx!.config.unique).toBe(true);
  });

  it("pending partial index has WHERE clause on status", () => {
    const pendingIdx = config.indexes.find(
      (i) => i.config.name === "sync_op_outbox_pending_idx_lite",
    );
    expect(pendingIdx).toBeDefined();
    expect(pendingIdx!.config.where).toBeDefined();
  });

  it("pending+due partial index has WHERE clause on status (PR #040)", () => {
    const dueIdx = config.indexes.find(
      (i) => i.config.name === "sync_op_outbox_pending_due_idx_lite",
    );
    expect(dueIdx).toBeDefined();
    expect(dueIdx!.config.where).toBeDefined();
  });

  it("exposes a stable enum tuple of allowed `op` values", () => {
    // PR #042d-prep extended the legacy three LWW kinds with
    // `'increment'` for PN-counter outbox writes. Order is the
    // source-of-truth — `003_sync_op_outbox_increment_op.sql` lists
    // the literals in this same order inside the CHECK constraint.
    expect(SYNC_OP_OUTBOX_OPS).toEqual([
      "insert",
      "update",
      "delete",
      "increment",
    ]);
  });

  it("exposes a stable enum tuple of allowed `status` values", () => {
    expect(SYNC_OP_OUTBOX_STATUSES).toEqual([
      "pending",
      "rejected",
      "dead_letter",
    ]);
  });
});

describe("sqlite/syncOpCursor schema snapshot", () => {
  const config = getTableConfig(syncOpCursor);

  it("has the canonical table name", () => {
    expect(config.name).toBe("sync_op_cursor");
  });

  it("declares all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual(["key", "value_int", "updated_at"]);
  });

  it("declares column types matching the inline migration", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    // key TEXT PRIMARY KEY
    expect(columnMap["key"]!.dataType).toBe("string");
    expect(columnMap["key"]!.primary).toBe(true);
    expect(columnMap["key"]!.notNull).toBe(true);

    // value_int INTEGER NOT NULL
    expect(columnMap["value_int"]!.dataType).toBe("number");
    expect(columnMap["value_int"]!.notNull).toBe(true);

    // updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    expect(columnMap["updated_at"]!.dataType).toBe("string");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);
  });

  it("exposes the stable `pull_since` cursor key", () => {
    expect(SYNC_OP_CURSOR_PULL_SINCE).toBe("pull_since");
  });
});

describe("sqlite/migrations exports", () => {
  it("exports the SPIKE migration first, then the PR #040 retry-policy migration, then the PR #042d-prep increment-op migration", () => {
    expect(ROUTINE_CLIENT_MIGRATIONS).toHaveLength(3);
    expect(ROUTINE_CLIENT_MIGRATIONS[0]!.name).toBe("001_routine_spike.sql");
    expect(ROUTINE_CLIENT_MIGRATIONS[0]!.sql).toMatch(
      /CREATE TABLE IF NOT EXISTS routine_entries/,
    );
    expect(ROUTINE_CLIENT_MIGRATIONS[1]!.name).toBe(
      "002_sync_op_outbox_retry.sql",
    );
    // The retry-policy migration rebuilds sync_op_outbox via the
    // SQLite "12-step ALTER" recipe (rename → re-create → backfill →
    // drop). Each anchor below would change in a way the test should
    // notice, so we lock all three.
    expect(ROUTINE_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /ALTER TABLE sync_op_outbox RENAME TO sync_op_outbox_legacy/,
    );
    expect(ROUTINE_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /CHECK \(status IN \('pending','rejected','dead_letter'\)\)/,
    );
    expect(ROUTINE_CLIENT_MIGRATIONS[1]!.sql).toMatch(
      /sync_op_outbox_pending_due_idx_lite/,
    );

    // PR #042d-prep migration relaxes the `op` CHECK so PN-counter
    // `'increment'` rows can sit in the outbox alongside LWW kinds.
    // Pin the same three rebuild anchors as PR #040 plus the new
    // CHECK literal that is the actual contract change.
    expect(ROUTINE_CLIENT_MIGRATIONS[2]!.name).toBe(
      "003_sync_op_outbox_increment_op.sql",
    );
    expect(ROUTINE_CLIENT_MIGRATIONS[2]!.sql).toMatch(
      /ALTER TABLE sync_op_outbox RENAME TO sync_op_outbox_legacy/,
    );
    expect(ROUTINE_CLIENT_MIGRATIONS[2]!.sql).toMatch(
      /CHECK \(op IN \('insert','update','delete','increment'\)\)/,
    );
    // Status CHECK must stay at the post-PR-040 shape — relaxing op
    // does not re-tighten status.
    expect(ROUTINE_CLIENT_MIGRATIONS[2]!.sql).toMatch(
      /CHECK \(status IN \('pending','rejected','dead_letter'\)\)/,
    );
    // Backfill INSERT must list `attempts` / `next_retry_at` /
    // `last_error` (PR #040 columns) by name on both sides — copying
    // them verbatim from the legacy table without defaulting.
    expect(ROUTINE_CLIENT_MIGRATIONS[2]!.sql).toMatch(
      /attempts, next_retry_at, last_error/,
    );
    // All three indexes (UNIQUE idem, partial pending, partial
    // pending+due) must be re-created — the rename drops the
    // originals.
    expect(ROUTINE_CLIENT_MIGRATIONS[2]!.sql).toMatch(
      /sync_op_outbox_idem_uniq_lite/,
    );
    expect(ROUTINE_CLIENT_MIGRATIONS[2]!.sql).toMatch(
      /sync_op_outbox_pending_idx_lite/,
    );
    expect(ROUTINE_CLIENT_MIGRATIONS[2]!.sql).toMatch(
      /sync_op_outbox_pending_due_idx_lite/,
    );
  });

  it("uses the standard `__migrations` ledger table", () => {
    expect(ROUTINE_MIGRATIONS_TABLE).toBe("__migrations");
  });

  it("re-exports the deprecated SPIKE-named aliases as the same references", () => {
    // SPIKE consumers (apps/{web,mobile}/.../sqliteSpike/) must keep
    // working unchanged; the aliases must be the exact same array, not
    // a new array with the same contents.
    expect(ROUTINE_SPIKE_CLIENT_MIGRATIONS).toBe(ROUTINE_CLIENT_MIGRATIONS);
    expect(ROUTINE_SPIKE_MIGRATIONS_TABLE).toBe(ROUTINE_MIGRATIONS_TABLE);
  });
});
