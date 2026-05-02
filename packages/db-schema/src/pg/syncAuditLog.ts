import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { SYNC_OP_TYPES, SYNC_OUTCOMES, SYNC_MODULES } from "../shared/index.js";

/**
 * Postgres schema for `sync_audit_log` table.
 * Mirrors migration 023_sync_audit_log.sql.
 */
export const syncAuditLog = pgTable(
  "sync_audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    userId: text("user_id").notNull(),
    opType: text("op_type", { enum: SYNC_OP_TYPES }).notNull(),
    module: text({ enum: SYNC_MODULES }).notNull(),
    outcome: text({ enum: SYNC_OUTCOMES }).notNull(),
    conflict: boolean().notNull().default(false),
    payloadSizeBytes: integer("payload_size_bytes"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sync_audit_log_user_created_idx").on(
      table.userId,
      sql`${table.createdAt} DESC`,
    ),
    index("sync_audit_log_created_idx").on(sql`${table.createdAt} DESC`),
    index("sync_audit_log_outcome_idx")
      .on(table.outcome, sql`${table.createdAt} DESC`)
      .where(sql`${table.outcome} IN ('conflict', 'error', 'too_large')`),
  ],
);
