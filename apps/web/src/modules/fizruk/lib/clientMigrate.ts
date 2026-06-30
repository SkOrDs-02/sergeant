import {
  FIZRUK_CLIENT_MIGRATIONS,
  FIZRUK_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import {
  createClientMigrator,
  type SqliteMigrationClient,
} from "@shared/lib/db/clientMigrator";

/**
 * Run the Fizruk SQLite client migrations. Idempotent via the runner's
 * `__fizruk_migrations` ledger contract.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`.
 */
export const migrateFizruk = createClientMigrator(
  FIZRUK_CLIENT_MIGRATIONS,
  FIZRUK_MIGRATIONS_TABLE,
);

export type { SqliteMigrationClient };
