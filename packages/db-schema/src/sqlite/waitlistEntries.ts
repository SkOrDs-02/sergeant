import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { WAITLIST_TIERS, DEFAULT_WAITLIST_SOURCE } from "../shared/index.js";

/**
 * SQLite schema for `waitlist_entries` table.
 * Mirrors the Postgres version for cross-platform use.
 *
 * Differences from Postgres:
 * - Uses INTEGER PRIMARY KEY (autoincrement via rowid) instead of BIGSERIAL.
 * - Timestamps stored as TEXT (ISO-8601) — SQLite has no native TIMESTAMPTZ.
 * - No FK to "user" table (client-side SQLite won't have auth tables).
 */
export const waitlistEntries = sqliteTable(
  "waitlist_entries",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    email: text().notNull(),
    tierInterest: text("tier_interest", {
      enum: WAITLIST_TIERS,
    }).notNull(),
    source: text().notNull().default(DEFAULT_WAITLIST_SOURCE),
    locale: text(),
    userId: text("user_id"),
    userAgent: text("user_agent"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    notifiedAt: text("notified_at"),
  },
  (table) => [
    uniqueIndex("waitlist_entries_email_uniq_lite").on(table.email),
    index("waitlist_entries_created_at_idx_lite").on(table.createdAt),
    index("waitlist_entries_tier_idx_lite").on(table.tierInterest),
  ],
);
