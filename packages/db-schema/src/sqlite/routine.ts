import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite schema for the `routine_entries` table.
 *
 * Mirrors the Postgres version from `apps/server/src/migrations/026_routine_tables.sql`
 * and `packages/db-schema/src/pg/routine.ts`. Used by the Stage 3 SPIKE
 * (PR #022 in `docs/planning/storage-roadmap.md`) — the proof-of-concept
 * for hosting one routine slice fully on SQLite on web (sqlite-wasm)
 * and mobile (`expo-sqlite`).
 *
 * Differences from Postgres:
 * - `id` is TEXT (UUID stored as a string — SQLite has no native UUID).
 *   Generation is the client's responsibility (`crypto.randomUUID()`).
 * - All TIMESTAMPTZ columns are TEXT (ISO-8601 with offset). Default
 *   `datetime('now')` returns UTC without offset; clients should write
 *   ISO-8601-with-offset themselves so cross-device LWW comparisons stay
 *   consistent with what the server's apply-shлях persists.
 * - No FK to `"user"(id)` — the client SQLite database has no auth tables.
 * - Index names are `_lite`-suffixed so a future SQLite-on-Postgres
 *   linter can spot drift if a server-side migration accidentally lifts
 *   one of these names verbatim.
 */
export const routineEntries = sqliteTable(
  "routine_entries",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("routine_entries_user_created_idx_lite").on(
      table.userId,
      sql`${table.createdAt} DESC`,
    ),
    index("routine_entries_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `routine_streaks` table.
 *
 * Mirrors the Postgres version. Один рядок на користувача —
 * агреговані стрік-метрики, реагує на push/pull op-log-у через
 * apply-шлях `applyRoutineStreaks` у `apps/server/src/modules/sync/syncV2.ts`.
 */
export const routineStreaks = sqliteTable("routine_streaks", {
  userId: text("user_id").primaryKey(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastCompletedAt: text("last_completed_at"),
});

/**
 * Client-only outbox of pending `/api/v2/sync/push` ops.
 *
 * No Postgres counterpart — server-side ops live in `sync_op_log`
 * (`packages/db-schema/src/pg/syncOpLog.ts`). The outbox is the SPIKE's
 * client-side enqueue surface: every routine mutation under feature
 * flag `feature.routine.sqlite_v2` writes an entry here in the same
 * transaction as the row mutation, so a crash mid-op never leaves the
 * local DB diverged from what's queued.
 *
 * Lifecycle:
 *   - inserted with `status='pending'` by the SQLite repo;
 *   - sync engine batches up to 200 oldest pending ops and posts to
 *     `/api/v2/sync/push` (see `SYNC_V2_MAX_OPS_PER_PUSH` in
 *     `packages/shared/src/schemas/api.ts`);
 *   - server responses:
 *     * `applied` / `duplicate` → row is deleted (clean queue);
 *     * `rejected` → row stays with `status='rejected'` and
 *       `reject_reason` populated, ready for human triage. Stage 5
 *       PR #040 will introduce retry/back-off; SPIKE keeps it simple.
 */
export const SYNC_OP_OUTBOX_OPS = ["insert", "update", "delete"] as const;
export type SyncOpOutboxOp = (typeof SYNC_OP_OUTBOX_OPS)[number];

export const SYNC_OP_OUTBOX_STATUSES = ["pending", "rejected"] as const;
export type SyncOpOutboxStatus = (typeof SYNC_OP_OUTBOX_STATUSES)[number];

export const syncOpOutbox = sqliteTable(
  "sync_op_outbox",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    tableName: text("table_name").notNull(),
    op: text({ enum: SYNC_OP_OUTBOX_OPS }).notNull(),
    row: text().notNull(),
    clientTs: text("client_ts").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text({ enum: SYNC_OP_OUTBOX_STATUSES })
      .notNull()
      .default("pending"),
    rejectReason: text("reject_reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("sync_op_outbox_idem_uniq_lite").on(table.idempotencyKey),
    index("sync_op_outbox_pending_idx_lite")
      .on(table.id)
      .where(sql`${table.status} = 'pending'`),
  ],
);

/**
 * Client-only durable cursor table for `/api/v2/sync/pull?since=<id>`.
 *
 * Stage 3 SPIKE only stores one row keyed `pull_since`. Future stages
 * may add per-table cursors (e.g. `pull_since:routine_entries`) once
 * the v2 endpoints support per-table streams. `value_int` matches the
 * `BIGSERIAL`-derived `id` column on the server's `sync_op_log`
 * coerced to `number` in the api-client (Hard Rule #1 from `AGENTS.md`).
 */
export const syncOpCursor = sqliteTable("sync_op_cursor", {
  key: text().primaryKey(),
  valueInt: integer("value_int").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/** Cursor key for the SPIKE's primary `/v2/sync/pull` cursor. */
export const SYNC_OP_CURSOR_PULL_SINCE = "pull_since";
