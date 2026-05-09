import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
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
    id: uuid().primaryKey().defaultRandom(),
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
 * Postgres schema for `routine_streaks` table.
 * Mirrors migration 026_routine_tables.sql.
 *
 * Один рядок на користувача — агреговані стрік-метрики.
 * `userId` — PRIMARY KEY (не sequence), ON DELETE CASCADE з "user".
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
 * Один рядок на звичку. JSON-масиви (tagIds, reminderTimes, weekdays)
 * зберігаються як `jsonb`. Boolean поля — нативний `boolean`.
 */
export const routineHabits = pgTable(
  "routine_habits",
  {
    id: uuid().primaryKey().defaultRandom(),
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
    id: uuid().primaryKey().defaultRandom(),
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
    id: uuid().primaryKey().defaultRandom(),
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
