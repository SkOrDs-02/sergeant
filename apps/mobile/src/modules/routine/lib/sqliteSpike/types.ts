/**
 * Public types for the routine SQLite SPIKE (PR #022 in
 * `docs/planning/storage-roadmap.md`).
 *
 * Mirrors the on-the-wire shapes from `apps/server/src/modules/sync/syncV2.ts`
 * and the SQLite Drizzle schemas in `packages/db-schema/src/sqlite/routine.ts`.
 *
 * Naming: TypeScript interfaces use camelCase property names while the
 * SQL columns use snake_case. The repo functions translate between
 * them at the SQL boundary so calling code never sees snake_case.
 */

/** Routine entry as stored in client SQLite (`routine_entries`). */
export interface RoutineEntryRow {
  id: string;
  userId: string;
  name: string;
  /** ISO-8601 with offset, or null for entries that exist but were never completed. */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** ISO-8601 with offset, or null for active rows. */
  deletedAt: string | null;
}

/** Per-user aggregate stored in `routine_streaks`. */
export interface RoutineStreakRow {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt: string | null;
}

/** One queued op in `sync_op_outbox` waiting to be pushed to /v2/sync/push. */
export interface OutboxRow {
  /** Auto-increment ROWID — local-only, used for FIFO ordering. */
  id: number;
  tableName: string;
  op: "insert" | "update" | "delete";
  /** JSON-serialized row payload that will become `row` in the v2 push body. */
  row: string;
  clientTs: string;
  idempotencyKey: string;
  status: "pending" | "rejected";
  rejectReason: string | null;
  createdAt: string;
}

/** Routine-entry row payload as it travels over the wire to /v2/sync. */
export interface RoutineEntryWirePayload {
  id: string;
  user_id: string;
  name: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
