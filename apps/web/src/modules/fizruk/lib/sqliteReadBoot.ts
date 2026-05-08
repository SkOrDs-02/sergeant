/**
 * Boot wiring for the Fizruk SQLite read path (PR #029).
 *
 * Mirrors `apps/web/src/modules/routine/lib/sqliteReadBoot.ts`. Called
 * once from `FizrukApp` (via `useFizrukSqliteReadBoot`) after the
 * React-Query `me` cache and the sqlite-wasm singleton are available.
 * Evaluates the `feature.fizruk.sqlite_v2.read_sqlite` flag and, when
 * enabled:
 *
 *  1. Runs the fizruk SQLite migrations so the tables exist.
 *  2. Performs the initial `refreshFizrukSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * The function is idempotent — calling it twice with the same flag
 * value is a no-op on the second call.
 */

import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getFlag } from "../../../core/lib/featureFlags.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { migrateFizruk } from "./clientMigrate.js";
import { refreshFizrukSqliteState } from "./sqliteReader.js";

const FLAG_ID = "feature.fizruk.sqlite_v2.read_sqlite";

let booted = false;

/**
 * Initialise the SQLite read path if the feature flag is on.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootFizrukSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;

  const enabled = getFlag(FLAG_ID);
  if (!enabled || !userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateFizruk(client);
    await refreshFizrukSqliteState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    console.warn(
      "[fizruk.sqliteRead] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
    recordReadFallback(
      "fizruk",
      err instanceof Error ? `boot-failed: ${err.message}` : "boot-failed",
    );
    return false;
  }
}

/** Test helper — reset boot state between specs. */
export function __resetFizrukSqliteReadBootForTests(): void {
  booted = false;
}
