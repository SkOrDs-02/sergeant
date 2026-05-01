import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { MODULE_DATA_MODULES } from "../shared/index.js";

/**
 * Postgres schema for `module_data` table.
 * Mirrors migration 003_baseline_schema.sql + 007 FK + 024 CHECK constraint.
 */
export const moduleData = pgTable(
  "module_data",
  {
    id: serial().primaryKey(),
    userId: text("user_id").notNull(),
    module: text({ enum: MODULE_DATA_MODULES }).notNull(),
    data: jsonb().notNull().default({}),
    version: integer().notNull().default(1),
    clientUpdatedAt: timestamp("client_updated_at", {
      withTimezone: true,
    }).defaultNow(),
    serverUpdatedAt: timestamp("server_updated_at", {
      withTimezone: true,
    }).defaultNow(),
  },
  (table) => [
    unique().on(table.userId, table.module),
    index("idx_module_data_user").on(table.userId),
  ],
);
