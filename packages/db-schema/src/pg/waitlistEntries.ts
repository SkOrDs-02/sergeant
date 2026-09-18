import {
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { WAITLIST_TIERS, DEFAULT_WAITLIST_SOURCE } from "../shared/index.js";

/**
 * Postgres schema for `waitlist_entries` table.
 * Mirrors migration 009_waitlist.sql.
 */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    email: text().notNull(),
    tierInterest: text("tier_interest", {
      enum: WAITLIST_TIERS,
    }).notNull(),
    source: text().notNull().default(DEFAULT_WAITLIST_SOURCE),
    locale: text(),
    userId: text("user_id"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("waitlist_entries_email_uniq").on(sql`LOWER(${table.email})`),
    index("waitlist_entries_created_at_idx").on(sql`${table.createdAt} DESC`),
    index("waitlist_entries_tier_idx").on(table.tierInterest),
  ],
);
