import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Postgres schema for `push_subscriptions` table.
 * Mirrors migration 003_baseline_schema.sql.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial().primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_push_subs_user").on(table.userId)],
);
