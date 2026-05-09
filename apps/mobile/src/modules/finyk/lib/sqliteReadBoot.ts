/**
 * Boot wiring for the mobile Finyk SQLite read path (PR #037).
 *
 * Mirrors `apps/web/src/modules/finyk/lib/sqliteReadBoot.ts`. Called
 * once from the mobile Finyk app shell (via `useFinykSqliteReadBoot`)
 * after the auth `me` cache is available.
 *
 *  1. Resolves a `SqliteMigrationClient` from the singleton expo-sqlite
 *     handle.
 *  2. Runs the finyk SQLite migrations so the tables exist.
 *  3. Performs the initial `refreshFinykSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Stage 8 PR #057k-flag — `feature.finyk.sqlite_v2.read_sqlite` was
 * graduated out of the registry; the boot now fires unconditionally
 * once a `userId` is available.
 *
 * Fail-soft: any thrown error is caught, logged via `console.warn` and
 * surfaces as `false` so consumers can keep reading from MMKV.
 */

import { getSqliteMigrationClient } from "@/core/db/sqlite";

import { migrateFinyk } from "./clientMigrate";
import { refreshFinykSqliteState } from "./sqliteReader";

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from
 *   `useUser()` / `me` query). When falsy the boot is skipped.
 * @returns `true` only if the cache was actually refreshed; `false`
 *   when the user is missing, the SQLite migration client is
 *   unavailable, or any step throws.
 */
export async function bootFinykSqliteReadPath(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  try {
    const client = await getSqliteMigrationClient();
    await migrateFinyk(client);
    await refreshFinykSqliteState(client, userId);
    return true;
  } catch (err) {
    console.warn(
      "[finyk.sqliteRead] boot failed, falling back to MMKV",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
