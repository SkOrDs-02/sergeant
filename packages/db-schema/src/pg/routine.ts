import {
  index,
  integer,
  pgTable,
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
