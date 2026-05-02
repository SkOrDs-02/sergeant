/**
 * Cross-platform schema migration runner — public entry.
 *
 * Implements PR #019 of `docs/planning/storage-roadmap.md`. The runner
 * itself is dialect-free; dialect adapters live in dedicated entry
 * points so server bundles do not pull in SQLite shims and client
 * bundles do not pull in `pg`.
 *
 * Typical usage on the server (lazy-imported):
 *
 * ```ts
 * import { runMigrations, loadMigrationFiles } from "@sergeant/db-schema/migrate";
 * import { createPgAdapter } from "@sergeant/db-schema/migrate/pg";
 *
 * const files = await loadMigrationFiles("./migrations");
 * await runMigrations({ adapter: createPgAdapter(client), files });
 * ```
 *
 * Typical usage on a SQLite client (sync `better-sqlite3` / expo-sqlite):
 *
 * ```ts
 * import { runMigrations } from "@sergeant/db-schema/migrate";
 * import { createSqliteAdapter } from "@sergeant/db-schema/migrate/sqlite";
 *
 * await runMigrations({
 *   adapter: createSqliteAdapter({ db }),
 *   files: BUNDLED_MIGRATIONS,
 * });
 * ```
 *
 * Note: nothing here executes at module load. Consumers must call
 * `runMigrations` explicitly. PR #019 ships the runner only; wiring
 * into specific consumers is tracked as PR #020 (server) and PR #022
 * (client SPIKE).
 */
export {
  DEFAULT_MIGRATIONS_TABLE,
  MIGRATION_FILENAME_RE,
  type MigrationAdapter,
  type MigrationFile,
  type MigrationLogEvent,
  type MigrationLogger,
  type RunMigrationsOptions,
  type RunMigrationsResult,
} from "./types.js";

export { runMigrations, MigrationFailedError } from "./runner.js";

export { loadMigrationFiles } from "./files.js";
