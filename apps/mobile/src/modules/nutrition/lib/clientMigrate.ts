import {
  NUTRITION_CLIENT_MIGRATIONS,
  NUTRITION_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import { runMigrations } from "@sergeant/db-schema/migrate";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";

/**
 * Run the Nutrition SQLite client migrations.
 *
 * Idempotent: re-running over an already-migrated DB is a no-op
 * thanks to the runner's `__nutrition_migrations` ledger contract.
 *
 * Stage 4 PR #031 of `docs/planning/storage-roadmap.md` — schema-only.
 * The seam this exports is wired into the write paths by PR #032
 * (dual-write); PR #031 itself only ships the runner so PR #032 has
 * the same shape as the fizruk dual-write entry-point.
 */
export async function migrateNutrition(
  client: SqliteMigrationClient,
): Promise<void> {
  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: NUTRITION_CLIENT_MIGRATIONS,
    tableName: NUTRITION_MIGRATIONS_TABLE,
  });
}

export type { SqliteMigrationClient };
