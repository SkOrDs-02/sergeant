/**
 * Boot wiring for the Finyk SQLite read path (PR #037).
 *
 * Mirrors `apps/web/src/modules/nutrition/lib/sqliteReadBoot.ts` and
 * `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts`. Called once
 * from the Finyk app shell (via `useFinykSqliteReadBoot`) after the
 * React-Query `me` cache and the sqlite-wasm singleton are available.
 *
 *  1. Runs the finyk SQLite migrations so the tables exist.
 *  2. Performs the initial `refreshFinykSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Stage 8 PR #057k-flag — `feature.finyk.sqlite_v2.read_sqlite` was
 * graduated out of the registry; the boot now fires unconditionally
 * once a `userId` is available. Idempotent — calling it twice is a
 * no-op on the second call.
 */

import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { migrateFinyk } from "./clientMigrate.js";
import { refreshFinykSqliteState } from "./sqliteReader.js";

let booted = false;

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootFinykSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;
  if (!userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateFinyk(client);
    await refreshFinykSqliteState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    console.warn(
      "[finyk.sqliteRead] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
    recordReadFallback(
      "finyk",
      err instanceof Error ? `boot-failed: ${err.message}` : "boot-failed",
    );
    return false;
  }
}

/** Test helper — reset boot state between specs. */
export function __resetFinykSqliteReadBootForTests(): void {
  booted = false;
}
