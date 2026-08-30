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
 * SQLite schema for the `routine_completion_events` table.
 *
 * Mirrors the Postgres version from
 * `apps/server/src/migrations/085_routine_completion_events.sql` and
 * `packages/db-schema/src/pg/routine.ts`. Клієнтська міграція —
 * `007_routine_completion_events.sql` у
 * `packages/db-schema/src/sqlite/migrations/index.ts`.
 *
 * Append-only журнал відміток звичок (Хвиля 1, стадія 1 задачі
 * W1-ROUTINE-APPEND). На цій стадії таблиця лише ПИШЕТЬСЯ паралельно з
 * `routineEntries`; жоден читач (`sqliteReader`, streak / rate / heatmap)
 * на неї ще не спирається.
 *
 * AI-DANGER: append-only. Немає ні `updated_at`, ні `deleted_at` — і не
 * додавай. Запис іде через `INSERT OR IGNORE` з детермінованим `id`
 * (див. `buildCompletionEventId` у `@sergeant/routine-domain`), тому
 * повторне застосування тієї самої події ідемпотентне. Pull-шлях
 * (`applyPullOp`) для цієї таблиці insert-only.
 *
 * Differences from Postgres: TIMESTAMPTZ → TEXT (ISO-8601 з offset),
 * немає FK на `"user"(id)`, індекси мають суфікс `_lite`.
 */
export const routineCompletionEvents = sqliteTable(
  "routine_completion_events",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    habitId: text("habit_id").notNull(),
    /** YYYY-MM-DD як його порахував КЛІЄНТ; трактування залежить від `dayAnchor`. */
    dateKey: text("date_key").notNull(),
    /** `'done'` | `'undone'` — CHECK-констрейнт живе в inline-міграції. */
    state: text().notNull().default("done"),
    occurredAt: text("occurred_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    tzOffsetMin: integer("tz_offset_min"),
    /** `'device-local'` | `'kyiv'` | `'unknown'` (backfill). */
    dayAnchor: text("day_anchor").notNull().default("unknown"),
    /** `'ui'` | `'chat'` | `'bulk'` | `'backfill'` | `'seed'`. */
    source: text().notNull().default("ui"),
    deviceId: text("device_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("routine_completion_events_user_habit_date_idx_lite").on(
      table.userId,
      table.habitId,
      table.dateKey,
      table.occurredAt,
    ),
    index("routine_completion_events_user_occurred_idx_lite").on(
      table.userId,
      table.occurredAt,
    ),
  ],
);

/**
 * SQLite schema for the `routine_streaks` table.
 *
 * Mirrors the Postgres version. Один рядок на користувача, реагує на
 * push/pull op-log-у через apply-шлях `applyRoutineStreaks` у
 * `apps/server/src/modules/sync/syncV2.ts`.
 *
 * AI-DANGER: імʼя таблиці фантомне (audit E-4). `current_streak` /
 * `longest_streak` — це НЕ derived день-стрік, а net-лічильник кліків
 * «відмітив/зняв» по ВСІХ звичках разом (increment-only PN-counter із
 * clamp-ом `>= 0`). Одиниця виміру — кліки, не послідовні дні. НЕ читай
 * ці стовпці для UI / push / digest: справжній стрік рахується
 * client-side (`streakForHabit`) з `routine_entries`/completions. Канон:
 * `docs/01-product/model/routine.md` §4.
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
    /**
     * Датовані інтервали паузи (Хвиля 4) — JSON-масив як TEXT.
     *
     * `paused` (вище) лишається живою колонкою — pre-beta schema-debt
     * аудит 2026-08-04: `routine-domain/src/reducers.ts` і
     * web/mobile `sqliteReader.ts` / `sqliteWriter/adapter.ts` досі
     * читають/пишуть її, дзеркалячи серверний `applySyncFullState.ts` +
     * `lib/reminders/sweep.ts`. Two-phase DROP (Hard Rule #4) вимагає
     * Phase 1 (сервер + клієнт перестають читати/писати) перед будь-яким
     * DROP COLUMN.
     */
    pauseIntervalsJson: text("pause_intervals_json").notNull().default("[]"),
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
 *
 * Власність перенесено у `fizruk_pushups` (канон routine.md §10, Phase B):
 * dual-write і читачі знято, локальна таблиця лишається порожнім
 * артефактом старих міграцій.
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
/**
 * SQLite counterpart of `routine_habit_skips` (Хвиля 4, канон §5).
 * Shipped by client migration `009_routine_habit_skips.sql`.
 */
export const routineHabitSkips = sqliteTable(
  "routine_habit_skips",
  {
    userId: text("user_id").notNull(),
    skipKey: text("skip_key").notNull(),
    reason: text().notNull().default("other"),
    note: text().notNull().default(""),
    at: text()
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.skipKey] }),
    index("routine_habit_skips_user_active_idx_lite")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

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
  "quarantined",
] as const;
export type SyncOpOutboxStatus = (typeof SYNC_OP_OUTBOX_STATUSES)[number];

export const syncOpOutbox = sqliteTable(
  "sync_op_outbox",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /**
     * Owner of the queued op. Added in `005_sync_op_outbox_user_id.sql`
     * (HIGH-#2 of the T3 audit) — the drain helper filters by this
     * column so a shared-device session swap cannot push the previous
     * user's pending rows under the new user's cookie. Server-side,
     * `applyXxx` enforces that the envelope's `row.user_id` matches
     * the session — see `missing_user_id` / `user_id_mismatch` reject
     * reasons in `apps/server/src/modules/sync/syncV2.ts`.
     */
    userId: text("user_id").notNull(),
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
    index("sync_op_outbox_user_pending_idx_lite")
      .on(table.userId, table.nextRetryAt, table.id)
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

/**
 * Cursor key for the SPIKE's primary `/v2/sync/pull` cursor.
 *
 * Canonical definition moved to `../shared/constants.js` so boot-path
 * callers can read it without pulling this Drizzle module (and the whole
 * `vendor-sqlite` chunk) into the eager bundle. Re-exported here so the
 * `./sqlite` barrel stays source-compatible.
 */
export { SYNC_OP_CURSOR_PULL_SINCE } from "../shared/constants.js";
