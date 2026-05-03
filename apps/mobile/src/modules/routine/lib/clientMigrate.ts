import {
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import { runMigrations } from "@sergeant/db-schema/migrate";
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
