import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  type OutboxRow,
  type RoutineEntryRow,
  type RoutineEntryWirePayload,
  type RoutineStreakRow,
} from "./types.js";

/**
 * Pure-SQL routine SPIKE repo.
 *
 * Operates against any SQLite driver that conforms to the minimal
 * `SqliteMigrationClient` shape (`exec`, `run`, `all`) — same surface
 * the migration runner uses. That keeps the repo testable with raw
 * `better-sqlite3` while running unchanged in production against
 * sqlite-wasm (web) and `expo-sqlite` (mobile). The platform-specific
 * adapters live in `./sqliteWasmAdapter.ts` (web) and the equivalent
 * mobile module — they're tiny because the underlying driver APIs
 * already line up with the `{exec, run, all}` contract.
 *
 * The repo is intentionally lower-level than Drizzle: writes do not
 * piggy-back on `datetime('now')` defaults — clients always pass an
 * ISO-8601-with-offset `clientTs` so cross-device LWW comparisons
 * stay byte-identical to what the server's apply-шлях persists in
 * `apps/server/src/modules/sync/syncV2.ts`.
 *
 * SPIKE-only contract: outbox enqueues and row writes are NOT wrapped
 * in a single transaction. A crash between them leaves a tiny window
 * where the row is written but the op isn't queued, or vice versa.
 * Stage 5 PR #040 introduces a persistent op-log with retry/back-off
 * and crash recovery; this is acknowledged tech-debt for the SPIKE.
 */

export type SpikeSqliteClient = SqliteMigrationClient;

// ───────────────────────── routine_entries ─────────────────────────

export interface InsertRoutineEntryInput {
  id: string;
  userId: string;
  name: string;
  /** Optional ISO-8601 with offset (`null` if entry exists but never completed). */
  completedAt: string | null;
  /** ISO-8601 with offset; written verbatim to `created_at`. */
  createdAt: string;
  /** ISO-8601 with offset; written verbatim to `updated_at`. */
  updatedAt: string;
}

/**
 * Upsert a routine entry by `id`. On conflict, the local row is
 * overwritten — callers are expected to have done their own LWW guard
 * via {@link applyPulledRoutineEntry}, mirroring the server's
 * `applyRoutineEntries` shape.
 */
export async function upsertRoutineEntry(
  client: SpikeSqliteClient,
  input: InsertRoutineEntryInput,
): Promise<void> {
  await client.run(
    `INSERT INTO routine_entries
       (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at,
       deleted_at = NULL`,
    [
      input.id,
      input.userId,
      input.name,
      input.completedAt,
      input.createdAt,
      input.updatedAt,
    ],
  );
}

/**
 * Soft-delete a routine entry by writing a tombstone (`deleted_at = clientTs`)
 * and bumping `updated_at`. Returns the number of rows touched so the
 * caller can decide whether to enqueue an outbox op.
 */
export async function softDeleteRoutineEntry(
  client: SpikeSqliteClient,
  args: { id: string; userId: string; clientTs: string },
): Promise<void> {
  await client.run(
    `UPDATE routine_entries
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
    [args.clientTs, args.clientTs, args.id, args.userId],
  );
}

/**
 * List active (non-tombstoned) entries for a user, newest-first by
 * `created_at`. Caps at `limit` rows to keep payloads bounded; the
 * server-side default for /v2/sync/pull is 100 (see `SYNC_V2_PULL_DEFAULT_LIMIT`),
 * SPIKE callers can override.
 */
export async function listActiveRoutineEntries(
  client: SpikeSqliteClient,
  userId: string,
  limit = 100,
): Promise<RoutineEntryRow[]> {
  const rows = await client.all<{
    id: string;
    user_id: string;
    name: string;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>(
    `SELECT id, user_id, name, completed_at, created_at, updated_at, deleted_at
       FROM routine_entries
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, limit],
  );
  return rows.map(rowToRoutineEntry);
}

/** Find one entry by id (active or tombstoned). Returns `null` if absent. */
export async function findRoutineEntryById(
  client: SpikeSqliteClient,
  id: string,
): Promise<RoutineEntryRow | null> {
  const rows = await client.all<{
    id: string;
    user_id: string;
    name: string;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>(
    `SELECT id, user_id, name, completed_at, created_at, updated_at, deleted_at
       FROM routine_entries
      WHERE id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  return rowToRoutineEntry(rows[0]!);
}

function rowToRoutineEntry(r: {
  id: string;
  user_id: string;
  name: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}): RoutineEntryRow {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

// ───────────────────────── routine_streaks ─────────────────────────

export async function upsertRoutineStreak(
  client: SpikeSqliteClient,
  input: {
    userId: string;
    currentStreak: number;
    longestStreak: number;
    lastCompletedAt: string | null;
  },
): Promise<void> {
  await client.run(
    `INSERT INTO routine_streaks (user_id, current_streak, longest_streak, last_completed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       current_streak = excluded.current_streak,
       longest_streak = excluded.longest_streak,
       last_completed_at = excluded.last_completed_at`,
    [
      input.userId,
      input.currentStreak,
      input.longestStreak,
      input.lastCompletedAt,
    ],
  );
}

export async function getRoutineStreak(
  client: SpikeSqliteClient,
  userId: string,
): Promise<RoutineStreakRow | null> {
  const rows = await client.all<{
    user_id: string;
    current_streak: number;
    longest_streak: number;
    last_completed_at: string | null;
  }>(
    `SELECT user_id, current_streak, longest_streak, last_completed_at
       FROM routine_streaks
      WHERE user_id = ?`,
    [userId],
  );
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    userId: r.user_id,
    currentStreak: r.current_streak,
    longestStreak: r.longest_streak,
    lastCompletedAt: r.last_completed_at,
  };
}

// ───────────────────────── sync_op_outbox ─────────────────────────

export interface EnqueueOutboxInput {
  tableName: string;
  op: "insert" | "update" | "delete";
  /** Wire-shape row payload — will be JSON-serialized before INSERT. */
  row: Record<string, unknown>;
  clientTs: string;
  idempotencyKey: string;
}

export async function enqueueOutboxOp(
  client: SpikeSqliteClient,
  input: EnqueueOutboxInput,
): Promise<void> {
  await client.run(
    `INSERT INTO sync_op_outbox
       (table_name, op, row, client_ts, idempotency_key, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
      input.tableName,
      input.op,
      JSON.stringify(input.row),
      input.clientTs,
      input.idempotencyKey,
    ],
  );
}

/**
 * Pop the oldest `limit` pending ops, FIFO. Caller is responsible for
 * pushing them and then resolving each via {@link removeOutboxOp} or
 * {@link rejectOutboxOp} based on the server response.
 *
 * The SPIKE batches up to `limit`; production sync engine (PR #040)
 * may grow more sophisticated batching/back-off. Default 100 lines up
 * with `SYNC_V2_PULL_DEFAULT_LIMIT` so push and pull use comparable
 * cadences.
 */
export async function listPendingOutboxOps(
  client: SpikeSqliteClient,
  limit = 100,
): Promise<OutboxRow[]> {
  const rows = await client.all<{
    id: number;
    table_name: string;
    op: "insert" | "update" | "delete";
    row: string;
    client_ts: string;
    idempotency_key: string;
    status: "pending" | "rejected";
    reject_reason: string | null;
    created_at: string;
  }>(
    `SELECT id, table_name, op, row, client_ts, idempotency_key,
            status, reject_reason, created_at
       FROM sync_op_outbox
      WHERE status = 'pending'
      ORDER BY id ASC
      LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    tableName: r.table_name,
    op: r.op,
    row: r.row,
    clientTs: r.client_ts,
    idempotencyKey: r.idempotency_key,
    status: r.status,
    rejectReason: r.reject_reason,
    createdAt: r.created_at,
  }));
}

/** Remove an outbox row that the server marked `applied` or `duplicate`. */
export async function removeOutboxOp(
  client: SpikeSqliteClient,
  idempotencyKey: string,
): Promise<void> {
  await client.run(`DELETE FROM sync_op_outbox WHERE idempotency_key = ?`, [
    idempotencyKey,
  ]);
}

/** Mark an outbox row as rejected — keeps it for human triage in SPIKE. */
export async function rejectOutboxOp(
  client: SpikeSqliteClient,
  idempotencyKey: string,
  reason: string,
): Promise<void> {
  await client.run(
    `UPDATE sync_op_outbox
        SET status = 'rejected', reject_reason = ?
      WHERE idempotency_key = ?`,
    [reason, idempotencyKey],
  );
}

// ───────────────────────── sync_op_cursor ─────────────────────────

const PULL_SINCE_KEY = "pull_since";

export async function getPullSince(client: SpikeSqliteClient): Promise<number> {
  const rows = await client.all<{ value_int: number }>(
    `SELECT value_int FROM sync_op_cursor WHERE key = ?`,
    [PULL_SINCE_KEY],
  );
  if (rows.length === 0) return 0;
  return Number(rows[0]!.value_int);
}

export async function setPullSince(
  client: SpikeSqliteClient,
  value: number,
  updatedAt: string,
): Promise<void> {
  await client.run(
    `INSERT INTO sync_op_cursor (key, value_int, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_int = excluded.value_int,
       updated_at = excluded.updated_at`,
    [PULL_SINCE_KEY, value, updatedAt],
  );
}

// ───────────────────────── apply pulled op ─────────────────────────

/**
 * Apply a single pulled `routine_entries` op to local SQLite using the
 * same LWW shape as `apps/server/src/modules/sync/syncV2.ts ::
 * applyRoutineEntries`. Returns `"applied"` if the local row was
 * mutated, `"lww_conflict"` if local was newer (op ignored), or
 * `"missing_id"` if the payload is malformed.
 *
 * The function is idempotent: replaying the same op twice yields the
 * same end state because LWW guards against re-applying older rows.
 */
export type ApplyOutcome = "applied" | "lww_conflict" | "missing_id";

export async function applyPulledRoutineEntry(
  client: SpikeSqliteClient,
  args: {
    op: "insert" | "update" | "delete";
    row: Partial<RoutineEntryWirePayload>;
    clientTs: string;
  },
): Promise<ApplyOutcome> {
  const id = typeof args.row.id === "string" ? args.row.id : null;
  if (!id) return "missing_id";

  const existing = await client.all<{ updated_at: string }>(
    `SELECT updated_at FROM routine_entries WHERE id = ?`,
    [id],
  );
  if (existing.length > 0) {
    if (existing[0]!.updated_at >= args.clientTs) {
      return "lww_conflict";
    }
  }

  if (args.op === "delete") {
    await client.run(
      `UPDATE routine_entries
          SET deleted_at = ?, updated_at = ?
        WHERE id = ?`,
      [args.clientTs, args.clientTs, id],
    );
    return "applied";
  }

  const userId = typeof args.row.user_id === "string" ? args.row.user_id : null;
  const name = typeof args.row.name === "string" ? args.row.name : null;
  if (!userId || !name) return "missing_id";

  await upsertRoutineEntry(client, {
    id,
    userId,
    name,
    completedAt:
      typeof args.row.completed_at === "string" ? args.row.completed_at : null,
    createdAt:
      typeof args.row.created_at === "string"
        ? args.row.created_at
        : args.clientTs,
    updatedAt: args.clientTs,
  });
  return "applied";
}

/**
 * Apply a single pulled `routine_streaks` op. Mirrors `applyRoutineStreaks`
 * server-side. The streak is keyed by `user_id` (not a row id), so
 * `delete` clears the row entirely.
 */
export async function applyPulledRoutineStreak(
  client: SpikeSqliteClient,
  args: {
    op: "insert" | "update" | "delete";
    row: Partial<{
      user_id: string;
      current_streak: number;
      longest_streak: number;
      last_completed_at: string | null;
    }>;
    clientTs: string;
  },
): Promise<ApplyOutcome> {
  const userId = typeof args.row.user_id === "string" ? args.row.user_id : null;
  if (!userId) return "missing_id";

  if (args.op === "delete") {
    await client.run(`DELETE FROM routine_streaks WHERE user_id = ?`, [userId]);
    return "applied";
  }

  await upsertRoutineStreak(client, {
    userId,
    currentStreak:
      typeof args.row.current_streak === "number" ? args.row.current_streak : 0,
    longestStreak:
      typeof args.row.longest_streak === "number" ? args.row.longest_streak : 0,
    lastCompletedAt:
      typeof args.row.last_completed_at === "string"
        ? args.row.last_completed_at
        : null,
  });
  return "applied";
}
