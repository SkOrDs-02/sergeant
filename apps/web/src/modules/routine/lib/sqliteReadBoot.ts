/**
 * Boot wiring for the SQLite read path (PR #025).
 *
 * Called once from `RoutineApp` (or the module bootstrap) after the
 * React-Query `me` cache and the sqlite-wasm singleton are available.
 * Evaluates the `feature.routine.sqlite_v2.read_sqlite` flag and, when
 * enabled:
 *
 *  1. Sets `sqliteReadEnabled = true` in `routineStorage` so
 *     `loadRoutineState()` overlays completions from the SQLite cache.
 *  2. Performs the initial `refreshSqliteCompletions()` so the cache is
 *     warm before the first render reads it.
 *
 * The function is idempotent — calling it twice with the same flag
 * value is a no-op on the second call.
 */

import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getFlag } from "../../../core/lib/featureFlags.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";

import { migrateRoutine } from "./clientMigrate.js";
import { setSqliteReadEnabled } from "./routineStorage.js";
import { refreshSqliteCompletions } from "./sqliteReader.js";

const FLAG_ID = "feature.routine.sqlite_v2.read_sqlite";

let booted = false;

/**
 * Initialise the SQLite read path if the feature flag is on.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;

  const enabled = getFlag(FLAG_ID);
  if (!enabled || !userId) {
    setSqliteReadEnabled(false);
    return false;
  }

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateRoutine(client);
    await refreshSqliteCompletions(client, userId);

    setSqliteReadEnabled(true);
    booted = true;
    return true;
  } catch (err) {
    console.warn(
      "[routine.sqliteRead] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
    setSqliteReadEnabled(false);
    recordReadFallback(
      "routine",
      err instanceof Error ? `boot-failed: ${err.message}` : "boot-failed",
    );
    return false;
  }
}

/** Test helper — reset boot state between specs. */
export function __resetSqliteReadBootForTests(): void {
  booted = false;
}
