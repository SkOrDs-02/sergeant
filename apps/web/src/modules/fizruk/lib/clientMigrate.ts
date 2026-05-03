import {
  FIZRUK_CLIENT_MIGRATIONS,
  FIZRUK_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";

/**
 * Run the Fizruk SQLite client migrations.
 *
 * Idempotent: re-running over an already-migrated DB is a no-op
 * thanks to the runner's `__fizruk_migrations` ledger contract.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`.
 */
export async function migrateFizruk(
  client: SqliteMigrationClient,
): Promise<void> {
  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: FIZRUK_CLIENT_MIGRATIONS,
    tableName: FIZRUK_MIGRATIONS_TABLE,
  });
}

export type { SqliteMigrationClient };
