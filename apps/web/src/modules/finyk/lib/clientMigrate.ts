import {
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import {
  createClientMigrator,
  type SqliteMigrationClient,
} from "@shared/lib/db/clientMigrator";

/**
 * Run the Finyk SQLite client migrations. Idempotent via the runner's
 * `__finyk_migrations` ledger contract.
 *
 * Stage 4 PR #035 of `docs/planning/storage-roadmap.md` — schema-only.
 * The seam this exports is wired into the write paths by PR #036
 * (dual-write); PR #035 itself only ships the runner so PR #036 has
 * the same shape as the nutrition dual-write entry-point.
 */
export const migrateFinyk = createClientMigrator(
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
);

export type { SqliteMigrationClient };
