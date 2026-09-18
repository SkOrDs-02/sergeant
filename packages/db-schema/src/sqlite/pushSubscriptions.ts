import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite schema for `push_subscriptions` table.
 * Mirrors the Postgres version for cross-platform use.
 *
 * Differences from Postgres:
 * - Uses INTEGER PRIMARY KEY instead of SERIAL.
 * - Timestamps stored as TEXT (ISO-8601).
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_push_subs_user_lite").on(table.userId)],
);
