import {
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import { runMigrations } from "@sergeant/db-schema/migrate";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";

/**
 * Run the Finyk SQLite client migrations.
 *
 * Idempotent: re-running over an already-migrated DB is a no-op
 * thanks to the runner's `__finyk_migrations` ledger contract.
 *
 * Stage 4 PR #035 of `docs/planning/storage-roadmap.md` — schema-only.
 * The seam this exports is wired into the write paths by PR #036
 * (dual-write); PR #035 itself only ships the runner so PR #036 has
 * the same shape as the nutrition dual-write entry-point.
 */
export async function migrateFinyk(
  client: SqliteMigrationClient,
): Promise<void> {
  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: FINYK_CLIENT_MIGRATIONS,
    tableName: FINYK_MIGRATIONS_TABLE,
  });
}

export type { SqliteMigrationClient };
