import {
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import {
  createClientMigrator,
  type SqliteMigrationClient,
} from "@shared/lib/db/clientMigrator";

/**
 * Run the routine SQLite client migrations. Idempotent via the runner's
 * `__migrations` ledger contract (see
 * `packages/db-schema/src/migrate/runner.ts`).
 *
 * `ROUTINE_SPIKE_MIGRATIONS_TABLE` keeps the existing migration table
 * name.
 */
export const migrateRoutine = createClientMigrator(
  ROUTINE_SPIKE_CLIENT_MIGRATIONS,
  ROUTINE_SPIKE_MIGRATIONS_TABLE,
);

export type { SqliteMigrationClient };
