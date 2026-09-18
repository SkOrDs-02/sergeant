/**
 * Re-export of the SQLite adapter so callers can do
 *   `import { createSqliteAdapter } from "@sergeant/db-schema/migrate/sqlite";`
 * without reaching into the package's internal `adapters/` folder.
 *
 * Pure dialect glue — works with `better-sqlite3` (tests),
 * `drizzle-orm/expo-sqlite` (mobile), and the sqlite-wasm proxy used
 * by `apps/web/src/core/db/sqlite.ts`.
 */
export {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "./adapters/sqlite.js";
