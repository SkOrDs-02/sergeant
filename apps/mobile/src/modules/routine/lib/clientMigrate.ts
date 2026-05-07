import {
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
// Import the runner from the dedicated `./migrate/runner` sub-path —
// the umbrella `./migrate` re-exports `loadMigrationFiles` from
// `./files.js`, which top-level imports `node:fs` / `node:path` and
// would break the mobile bundle if Metro ever stopped tree-shaking
// the unused export.
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";

/**
 * Run the routine SQLite client migrations.
 *
 * Idempotent: re-running over an already-migrated DB is a no-op
 * thanks to the runner's `__migrations` ledger contract.
 */
export async function migrateRoutine(
  client: SqliteMigrationClient,
): Promise<void> {
  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: ROUTINE_SPIKE_CLIENT_MIGRATIONS,
    tableName: ROUTINE_SPIKE_MIGRATIONS_TABLE, // keeps existing migration table name
  });
}

export type { SqliteMigrationClient };
