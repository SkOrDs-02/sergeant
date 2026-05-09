import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite schema for the `routine_entries` table.
 *
 * Mirrors the Postgres version from `apps/server/src/migrations/026_routine_tables.sql`
 * and `packages/db-schema/src/pg/routine.ts`. Hosts the routine slice
 * (habit completions) on SQLite for both surfaces — web (sqlite-wasm
 * via OPFS-SAH) and mobile (`expo-sqlite`).
 *
 * History: shipped first as the Stage 3 SPIKE (PR #022 in
 * `docs/planning/storage-roadmap.md`); promoted to production
 * source-of-truth in PR #023. The accompanying inline migration lives
 * in `packages/db-schema/src/sqlite/migrations/index.ts` (`ROUTINE_CLIENT_MIGRATIONS`).
 *
 * Differences from Postgres:
 * - `id` is TEXT (UUID stored as a string — SQLite has no native UUID).
 *   Generation is the client's responsibility (`crypto.randomUUID()`).
 * - All TIMESTAMPTZ columns are TEXT (ISO-8601 with offset). Default
 *   `datetime('now')` returns UTC without offset; clients should write
 *   ISO-8601-with-offset themselves so cross-device LWW comparisons stay
 *   consistent with what the server's apply-шлях persists.
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

// ---------------------------------------------------------------------
// Stage 10 — extend Routine SQLite schema to full LS coverage
// (habits, tags, categories, prefs, pushups, habitOrder, completionNotes)
// ---------------------------------------------------------------------

/**
 * SQLite schema for the `routine_habits` table.
 *
 * Один рядок на звичку. Поля дзеркалять `Habit` з
 * `@sergeant/routine-domain`. JSON-масиви (`tagIds`, `reminderTimes`,
 * `weekdays`) зберігаються як TEXT (JSON string) — SQLite не має
 * нативного JSONB.
 *
 * Stage 10 / PR #070r-schema of `docs/planning/storage-roadmap.md`.
 */
export const routineHabits = sqliteTable(
  "routine_habits",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    emoji: text().notNull().default(""),
    tagIdsJson: text("tag_ids_json").notNull().default("[]"),
    categoryId: text("category_id"),
    archived: integer({ mode: "boolean" }).notNull().default(false),
    paused: integer({ mode: "boolean" }).notNull().default(false),
    recurrence: text().notNull().default("daily"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    timeOfDay: text("time_of_day").notNull().default(""),
    reminderTimesJson: text("reminder_times_json").notNull().default("[]"),
    weekdaysJson: text("weekdays_json").notNull().default("[0,1,2,3,4,5,6]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("routine_habits_user_active_idx_lite")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `routine_tags` table.
 *
 * Один рядок на тег. Поля дзеркалять `Tag` з `@sergeant/routine-domain`.
 */
export const routineTags = sqliteTable(
  "routine_tags",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    scope: text().notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("routine_tags_user_active_idx_lite")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `routine_categories` table.
 *
 * Один рядок на категорію. Поля дзеркалять `Category` з
 * `@sergeant/routine-domain`.
 */
export const routineCategories = sqliteTable(
  "routine_categories",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    emoji: text().notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("routine_categories_user_active_idx_lite")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * SQLite schema for the `routine_prefs` table.
 *
 * Один рядок на користувача — JSON blob з RoutinePrefs.
 * Зберігається як єдиний TEXT-стовпець `data_json` щоб уникнути
 * ALTER TABLE при додаванні нових pref-полів.
 */
export const routinePrefs = sqliteTable("routine_prefs", {
  userId: text("user_id").primaryKey(),
  dataJson: text("data_json").notNull().default("{}"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/**
 * SQLite schema for the `routine_pushups` table.
 *
 * Один рядок на (user, date) — кількість відтискань за день.
 * Дзеркалить `RoutineState.pushupsByDate`.
 */
export const routinePushups = sqliteTable(
  "routine_pushups",
  {
    userId: text("user_id").notNull(),
    dateKey: text("date_key").notNull(),
    reps: integer().notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.dateKey] })],
);

/**
 * SQLite schema for the `routine_habit_order` table.
 *
 * Один рядок на користувача — JSON array з id-шниками звичок у
 * бажаному порядку. Дзеркалить `RoutineState.habitOrder`.
 */
export const routineHabitOrder = sqliteTable("routine_habit_order", {
  userId: text("user_id").primaryKey(),
  orderJson: text("order_json").notNull().default("[]"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/**
 * SQLite schema for the `routine_completion_notes` table.
 *
 * Один рядок на (user, noteKey) — короткий текст нотатки до
 * завершення звички. Дзеркалить `RoutineState.completionNotes`.
 * `noteKey` — це `completionNoteKey(habitId, dateKey)`.
 */
export const routineCompletionNotes = sqliteTable(
  "routine_completion_notes",
  {
    userId: text("user_id").notNull(),
    noteKey: text("note_key").notNull(),
    note: text().notNull().default(""),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.noteKey] }),
    index("routine_completion_notes_user_active_idx_lite")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Client-only outbox of pending `/api/v2/sync/push` ops.
 *
 * No Postgres counterpart — server-side ops live in `sync_op_log`
 * (`packages/db-schema/src/pg/syncOpLog.ts`). The outbox is the
 * client-side enqueue surface: every mutation under a `*_sqlite_v2`
 * feature flag writes an entry here in the same transaction as the
 * row mutation, so a crash mid-op never leaves the local DB diverged
 * from what's queued.
 *
 * Lifecycle:
 *   - inserted with `status='pending'`, `attempts=0`, `next_retry_at=NULL`
 *     by the SQLite repo;
 *   - sync engine batches up to 200 oldest pending ops where
 *     `next_retry_at IS NULL OR next_retry_at <= now()` and posts to
 *     `/api/v2/sync/push` (see `SYNC_V2_MAX_OPS_PER_PUSH` in
 *     `packages/shared/src/schemas/api.ts`);
 *   - server responses:
 *     * `applied` / `duplicate` → row is deleted (clean queue);
 *     * `rejected` (durable / 4xx) → row stays with `status='rejected'`
 *       and `reject_reason` populated; never retried automatically;
 *     * transient transport / 5xx → call `markRetryable` from
 *       `./syncOpRetry.ts`; updates `attempts`, `last_error`, and
 *       schedules the next attempt with exponential backoff. After
 *       `SYNC_OP_MAX_ATTEMPTS` attempts the row flips to
 *       `status='dead_letter'` and waits for human triage.
 *
 * The retry/backoff/dead-letter columns and the `'dead_letter'` status
 * landed in PR #040 (`docs/planning/storage-roadmap.md` Stage 5) on
 * top of the original SPIKE shape from PR #022. The migration
 * recreates the table because SQLite cannot relax a `CHECK` constraint
 * in place — see `002_sync_op_outbox_retry.sql`.
 */
/**
 * Allowed values of `sync_op_outbox.op`.
 *
 * The original SPIKE shape (`001_routine_spike.sql`, PR #022) only
 * supported the three LWW per-row mutation kinds. Stage 5 / PR #042a
 * extended the server protocol with `'increment'` for PN-counter
 * rows (`routine_streaks` today; future PN-counter-tier tables would
 * extend `INCREMENT_OP_SUPPORTED_TABLES` in
 * `packages/api-client/src/endpoints/syncV2.increment.ts`). The client
 * outbox follows in PR #042d-prep — `003_sync_op_outbox_increment_op.sql`
 * relaxes the legacy CHECK so a PN-counter `delta` op can durably sit
 * in the outbox alongside LWW writes without collapsing into them.
 *
 * Order of literals is the source-of-truth: it matches the CHECK
 * constraint in `003_sync_op_outbox_increment_op.sql` byte-for-byte;
 * snapshot tests in `packages/db-schema/src/__tests__/sqlite-routine-snapshot.test.ts`
 * pin the tuple shape so refactors here cannot silently drift.
 */
export const SYNC_OP_OUTBOX_OPS = [
  "insert",
  "update",
  "delete",
  "increment",
] as const;
export type SyncOpOutboxOp = (typeof SYNC_OP_OUTBOX_OPS)[number];

export const SYNC_OP_OUTBOX_STATUSES = [
  "pending",
  "rejected",
  "dead_letter",
] as const;
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
    attempts: integer().notNull().default(0),
    nextRetryAt: text("next_retry_at"),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("sync_op_outbox_idem_uniq_lite").on(table.idempotencyKey),
    index("sync_op_outbox_pending_idx_lite")
      .on(table.id)
      .where(sql`${table.status} = 'pending'`),
    index("sync_op_outbox_pending_due_idx_lite")
      .on(table.nextRetryAt, table.id)
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
