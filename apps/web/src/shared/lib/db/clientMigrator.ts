import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";

// The runner is imported from the dedicated `./migrate/runner` sub-path
// rather than the umbrella `./migrate`: that entry re-exports
// `loadMigrationFiles` from `./files.js`, which top-level imports
// `node:fs` / `node:path` and breaks Vite's browser bundle once a SQLite
// library lands in the production graph (see PR #1378 follow-up). The
// runner itself is dialect- and platform-free.

type RunMigrationsOptions = Parameters<typeof runMigrations>[0];

/**
 * Build a module's SQLite client-migration runner.
 *
 * Each Sergeant module (finyk, fizruk, nutrition, routine) differs only
 * in its migration file set and its ledger table name; the runner call
 * shape is identical. The returned function is idempotent — re-running
 * over an already-migrated DB is a no-op thanks to the runner's ledger
 * contract (`<tableName>`).
 */
export function createClientMigrator(
  files: RunMigrationsOptions["files"],
  tableName: string,
): (client: SqliteMigrationClient) => Promise<void> {
  return async (client: SqliteMigrationClient): Promise<void> => {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files,
      tableName,
    });
  };
}

export type { SqliteMigrationClient };
