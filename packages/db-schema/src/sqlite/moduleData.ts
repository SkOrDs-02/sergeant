import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { MODULE_DATA_MODULES } from "../shared/index.js";

/**
 * SQLite schema for `module_data` table.
 * Mirrors the Postgres version for cross-platform use.
 *
 * Differences from Postgres:
 * - Uses INTEGER PRIMARY KEY instead of SERIAL.
 * - `data` stored as TEXT (JSON string) — SQLite has no native JSONB.
 * - Timestamps stored as TEXT (ISO-8601).
 */
export const moduleData = sqliteTable(
  "module_data",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    module: text({ enum: MODULE_DATA_MODULES }).notNull(),
    data: text().notNull().default("{}"),
    version: integer().notNull().default(1),
    clientUpdatedAt: text("client_updated_at").default(sql`(datetime('now'))`),
    serverUpdatedAt: text("server_updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("module_data_user_module_uniq_lite").on(
      table.userId,
      table.module,
    ),
    index("idx_module_data_user_lite").on(table.userId),
  ],
);
