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
 * Stage 4 PR #035 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md` — schema-only.
 * The seam this exports is wired into the write paths by PR #036
 * (dual-write); PR #035 itself only ships the runner so PR #036 has
 * the same shape as the nutrition dual-write entry-point.
 */
/**
 * Раннер клієнтських міграцій Фініка.
 *
 * Серіалізацію паралельних викликів робить сама фабрика
 * (`@shared/lib/db/clientMigrator`) — там же й розбір гонки, через яку
 * boot-гілки тихо не виконувались (`SQLITE_CONSTRAINT_UNIQUE` на журналі,
 * нулі в Аналітиці до релоуду). Тримати другу чергу ще й тут означало б
 * два механізми на один інваріант.
 */
export const migrateFinyk = createClientMigrator(
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
);

export type { SqliteMigrationClient };
