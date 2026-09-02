import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Postgres schema for `routine_entries` table.
 * Mirrors migration 026_routine_tables.sql.
 *
 * Stage 2 / PR #020 із `docs/planning/storage-roadmap.md` — нормалізована
 * цільова форма habit-completion рядків. Write-only від backfill-скрипта
 * на цьому етапі; жоден API endpoint поки звідси не читає.
 */
export const routineEntries = pgTable(
  "routine_entries",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("routine_entries_user_created_idx").on(
      table.userId,
      sql`${table.createdAt} DESC`,
    ),
    index("routine_entries_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for the `routine_completion_events` table.
 * Mirrors migration `085_routine_completion_events.sql`.
 *
 * Append-only журнал відміток звичок (Хвиля 1, стадія 1 задачі
 * W1-ROUTINE-APPEND). На цій стадії таблиця тільки ПИШЕТЬСЯ паралельно з
 * `routineEntries` — жоден читач (streak / rate / heatmap / digest) на неї
 * ще не спирається.
 *
 * AI-DANGER: таблиця append-only. НЕ додавай сюди `updated_at`,
 * `deleted_at` чи UPDATE-шлях: apply-функція
 * `applyRoutineCompletionEvents` відхиляє `op='update'|'delete'` з
 * причиною `append_only_violation`. Виправлення історії — це нова подія,
 * а не редагування старої.
 *
 * `id` — TEXT, НЕ UUID (свідомо): клієнт шле `habitId:dateKey`, що не є UUID.
 * Ця таблиця обходила пастку з самого початку; решту `routine_*` довела до
 * того ж типу міграція 094 (`docs/90-work/tech-debt/backend.md` §
 * «Routine: PK-тип»).
 */
export const routineCompletionEvents = pgTable(
  "routine_completion_events",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    habitId: text("habit_id").notNull(),
    /** YYYY-MM-DD як його порахував КЛІЄНТ; трактування залежить від `dayAnchor`. */
    dateKey: text("date_key").notNull(),
    /** `'done'` | `'undone'` — CHECK-констрейнт живе в SQL-міграції. */
    state: text().notNull().default("done"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    tzOffsetMin: integer("tz_offset_min"),
    /** `'device-local'` | `'kyiv'` | `'unknown'` (backfill). */
    dayAnchor: text("day_anchor").notNull().default("unknown"),
    /** `'ui'` | `'chat'` | `'bulk'` | `'backfill'` | `'seed'`. */
    source: text().notNull().default("ui"),
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("routine_completion_events_user_habit_date_idx").on(
      table.userId,
      table.habitId,
      table.dateKey,
      table.occurredAt,
    ),
    index("routine_completion_events_user_occurred_idx").on(
      table.userId,
      table.occurredAt,
    ),
  ],
);

/**
 * Postgres schema for `routine_streaks` table.
 * Mirrors migration 026_routine_tables.sql.
 *
 * Один рядок на користувача. `userId` — PRIMARY KEY (не sequence),
 * ON DELETE CASCADE з "user".
 *
 * AI-DANGER: імʼя таблиці фантомне (audit E-4). `current_streak` /
 * `longest_streak` — це НЕ derived день-стрік, а net-лічильник кліків
 * «відмітив/зняв» по ВСІХ звичках разом (increment-only PN-counter із
 * clamp-ом `>= 0`, див. `applyRoutineStreaks`). Одиниця виміру — кліки,
 * не послідовні дні. НЕ читай ці стовпці для UI / push / digest:
 * справжній стрік рахується client-side (`streakForHabit`) з
 * `routine_entries`/completions. Канон:
 * `docs/01-product/model/routine.md` §4.
 */
export const routineStreaks = pgTable("routine_streaks", {
  userId: text("user_id").primaryKey(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------
// Stage 10 — extend Routine schema to full LS coverage
// (habits, tags, categories, prefs, pushups, habitOrder, completionNotes)
// Mirrors migration 050_routine_full_state.sql.
// ---------------------------------------------------------------------

/**
 * Postgres schema for `routine_habits` table.
 *
 * Один рядок на звичку. JSON-масиви (tagIds, reminderTimes, weekdays,
 * weeklyTargetHistory) зберігаються як `jsonb`. Boolean поля — нативний
 * `boolean`.
 */
export const routineHabits = pgTable(
  "routine_habits",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    emoji: text().notNull().default(""),
    tagIds: jsonb("tag_ids").notNull().default([]),
    categoryId: text("category_id"),
    archived: boolean().notNull().default(false),
    paused: boolean().notNull().default(false),
    recurrence: text().notNull().default("daily"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    timeOfDay: text("time_of_day").notNull().default(""),
    reminderTimes: jsonb("reminder_times").notNull().default([]),
    weekdays: jsonb().notNull().default([0, 1, 2, 3, 4, 5, 6]),
    /**
     * Датовані інтервали планованої паузи (Хвиля 4, канон `routine.md` §4).
     * Форма: `[{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" | null }]`.
     *
     * Колонка `paused` (вище) НЕ є мертвим легасі-прапором для «старих
     * клієнтів» — pre-beta schema-debt аудит 2026-08-04 підтвердив живих
     * читачів/писарів по обидва боки: сервер (`applySyncFullState.ts`
     * `readBoolField(row, "paused")` на INSERT/UPDATE,
     * `lib/reminders/sweep.ts` `SELECT ... t.paused` для гейту нагадувань)
     * і клієнт (`routine-domain/src/reducers.ts`, `sqliteReader.ts` /
     * `sqliteWriter/adapter.ts` у web+mobile). Two-phase DROP (Hard Rule #4)
     * тут ще не пройшло Phase 1 (сервер має спершу перестати
     * читати/писати `paused`) — не видаляй колонку без окремого
     * server-side PR, що це зробить.
     */
    pauseIntervals: jsonb("pause_intervals").notNull().default([]),
    weeklyTargetHistory: jsonb("weekly_target_history").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("routine_habits_user_active_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `routine_tags` table.
 */
export const routineTags = pgTable(
  "routine_tags",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    scope: text().notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("routine_tags_user_active_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `routine_categories` table.
 */
export const routineCategories = pgTable(
  "routine_categories",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    emoji: text().notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("routine_categories_user_active_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Postgres schema for `routine_prefs` table.
 *
 * Один рядок на користувача — JSON blob з RoutinePrefs.
 */
export const routinePrefs = pgTable("routine_prefs", {
  userId: text("user_id").primaryKey(),
  data: jsonb().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Postgres schema for `routine_pushups` table.
 *
 * Один рядок на (user, date) — кількість відтискань за день.
 *
 * Власність перенесено у `fizruk_pushups` (канон routine.md §10, Phase B):
 * нові клієнти сюди не пишуть, таблиця жива лише для старих клієнтів.
 * DROP — окремою пізнішою міграцією за Hard Rule #4 (двофазність).
 */
export const routinePushups = pgTable(
  "routine_pushups",
  {
    userId: text("user_id").notNull(),
    dateKey: text("date_key").notNull(),
    reps: integer().notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.dateKey] })],
);

/**
 * Postgres schema for `routine_habit_order` table.
 *
 * Один рядок на користувача — JSON array з id-шниками звичок.
 */
export const routineHabitOrder = pgTable("routine_habit_order", {
  userId: text("user_id").primaryKey(),
  order: jsonb().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Postgres schema for `routine_completion_notes` table.
 *
 * Один рядок на (user, noteKey) — короткий текст нотатки.
 */
/**
 * Postgres schema for `routine_habit_skips`.
 * Mirrors migration `098_routine_habit_skips.sql`.
 *
 * Третій стан дня — «не зміг з причиною» (Хвиля 4, канон `routine.md` §5).
 * Форма один-в-один як у `routine_completion_notes`: композитний PK
 * `(user_id, skip_key)`, LWW по `updated_at`, soft-delete. `skip_key` —
 * `habitId__dateKey` (`habitSkipKey` у `@sergeant/routine-domain`).
 *
 * AI-NOTE: взаємна виключність із відміткою виконання тримається на
 * КЛІЄНТІ (`applySetHabitSkip` / `applyToggleHabitCompletion`), а не тут.
 * Сервер приймає ops незалежно, бо два девайси можуть надіслати «зробив» і
 * «не зміг» на той самий день — і LWW має розсудити їх за часом, а не
 * відхилити обидва.
 */
export const routineHabitSkips = pgTable(
  "routine_habit_skips",
  {
    userId: text("user_id").notNull(),
    skipKey: text("skip_key").notNull(),
    reason: text().notNull().default("other"),
    note: text().notNull().default(""),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.skipKey] }),
    index("routine_habit_skips_user_active_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const routineCompletionNotes = pgTable(
  "routine_completion_notes",
  {
    userId: text("user_id").notNull(),
    noteKey: text("note_key").notNull(),
    note: text().notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.noteKey] }),
    index("routine_completion_notes_user_active_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
