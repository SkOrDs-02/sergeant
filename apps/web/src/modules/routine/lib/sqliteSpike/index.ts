/**
 * Public surface of the routine SQLite SPIKE library
 * (PR #022 of `docs/planning/storage-roadmap.md`).
 *
 * Everything exported from here is gated behind the
 * `feature.routine.sqlite_v2` flag — callers MUST check the flag
 * before invoking any of these helpers, since they assume the SPIKE
 * migration has been run and the local SQLite DB is open. See
 * `apps/web/src/core/lib/featureFlags.ts` for the flag definition.
 */

export { migrateRoutineSpike } from "./clientMigrate.js";
export type { SqliteMigrationClient } from "./clientMigrate.js";

export {
  upsertRoutineEntry,
  softDeleteRoutineEntry,
  listActiveRoutineEntries,
  findRoutineEntryById,
  upsertRoutineStreak,
  getRoutineStreak,
  enqueueOutboxOp,
  listPendingOutboxOps,
  removeOutboxOp,
  rejectOutboxOp,
  getPullSince,
  setPullSince,
  applyPulledRoutineEntry,
  applyPulledRoutineStreak,
  type SpikeSqliteClient,
  type EnqueueOutboxInput,
  type InsertRoutineEntryInput,
  type ApplyOutcome,
} from "./repo.js";

export {
  pushPendingOutbox,
  pullSince,
  recordRoutineCompletion,
  deleteRoutineCompletion,
  summarizePushResults,
  type SyncEngineOptions,
  type PushResult,
  type PullResult,
} from "./syncEngine.js";

export { newIdempotencyKey } from "./idempotencyKey.js";

export {
  createSqliteWasmRawClient,
  type SqliteWasmExecutor,
} from "./sqliteWasmAdapter.js";

export type {
  RoutineEntryRow,
  RoutineStreakRow,
  OutboxRow,
  RoutineEntryWirePayload,
} from "./types.js";
