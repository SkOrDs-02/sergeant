import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SYNC_OP_TYPES, SYNC_OUTCOMES, SYNC_MODULES } from "../shared/index.js";
import { sql } from "drizzle-orm";

/**
 * SQLite schema for `sync_audit_log` table.
 * Mirrors the Postgres version for cross-platform use.
 *
 * Differences from Postgres:
 * - Uses INTEGER PRIMARY KEY instead of BIGSERIAL.
 * - `conflict` stored as INTEGER (0/1) — SQLite has no native BOOLEAN.
 * - Timestamps stored as TEXT (ISO-8601).
 */
export const syncAuditLog = sqliteTable(
  "sync_audit_log",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    opType: text("op_type", { enum: SYNC_OP_TYPES }).notNull(),
    module: text({ enum: SYNC_MODULES }).notNull(),
    outcome: text({ enum: SYNC_OUTCOMES }).notNull(),
    conflict: integer({ mode: "boolean" }).notNull().default(false),
    payloadSizeBytes: integer("payload_size_bytes"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("sync_audit_log_user_created_idx_lite").on(
      table.userId,
      table.createdAt,
    ),
    index("sync_audit_log_created_idx_lite").on(table.createdAt),
    index("sync_audit_log_outcome_idx_lite").on(table.outcome, table.createdAt),
  ],
);
