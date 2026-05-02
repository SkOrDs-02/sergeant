/**
 * Public surface of the routine SQLite SPIKE library on mobile
 * (PR #022 of `docs/planning/storage-roadmap.md`).
 *
 * This module mirrors `apps/web/src/modules/routine/lib/sqliteSpike/index.ts`
 * — the repo / sync engine / migration runner are byte-identical
 * since they only depend on `@sergeant/db-schema/migrate/sqlite` types
 * and `@sergeant/api-client`. The platform-specific bit lives in
 * `expoSqliteAdapter.ts` (web has its own `sqliteWasmAdapter.ts`).
 *
 * The duplication is acknowledged tech debt for the time-boxed SPIKE.
 * Stage 5 PR #040 promotes the SPIKE library to a shared package
 * (`@sergeant/routine-spike` or similar) once the design has settled.
 *
 * Everything here is gated behind a feature flag — callers MUST check
 * the flag before invoking any helpers, since they assume the SPIKE
 * migration has been run and the local SQLite DB is open.
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
  createExpoSqliteRawClient,
  type ExpoSqliteAsyncHandle,
} from "./expoSqliteAdapter.js";

export type {
  RoutineEntryRow,
  RoutineStreakRow,
  OutboxRow,
  RoutineEntryWirePayload,
} from "./types.js";
