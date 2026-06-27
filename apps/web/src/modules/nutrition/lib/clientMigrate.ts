/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import {
  NUTRITION_CLIENT_MIGRATIONS,
  NUTRITION_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import {
  createClientMigrator,
  type SqliteMigrationClient,
} from "@shared/lib/db/clientMigrator";

/**
 * Run the Nutrition SQLite client migrations. Idempotent via the
 * runner's `__nutrition_migrations` ledger contract.
 *
 * Stage 4 PR #031 of `docs/planning/storage-roadmap.md` — schema-only.
 * The seam this exports is wired into the write paths by PR #032
 * (dual-write); PR #031 itself only ships the runner so PR #032 has
 * the same shape as the fizruk dual-write entry-point.
 */
export const migrateNutrition = createClientMigrator(
  NUTRITION_CLIENT_MIGRATIONS,
  NUTRITION_MIGRATIONS_TABLE,
);

export type { SqliteMigrationClient };
