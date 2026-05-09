/**
 * Boot wiring for the SQLite read path (PR #025).
 *
 * Called once from `RoutineApp` (or the module bootstrap) after the
 * React-Query `me` cache and the sqlite-wasm singleton are available.
 *
 * Stage 8 PR #057r-flag dropped `feature.routine.sqlite_v2.read_sqlite`
 * — boot is now unconditional once `userId` is known. On success it
 * performs the initial `refreshSqliteCompletions()` so the cache is
 * warm before the first render reads it; `loadRoutineState()` then
 * overlays completions from the SQLite cache (gated only on
 * `refreshedAt !== null`).
 *
 * The function is idempotent — calling it twice is a no-op on the
 * second call.
 */

import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";

import { migrateRoutine } from "./clientMigrate.js";
import {
  refreshSqliteCompletions,
  refreshSqliteRoutineState,
} from "./sqliteReader.js";

let booted = false;

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;
  if (!userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateRoutine(client);
    await refreshSqliteCompletions(client, userId);
    // Stage 10: also warm the full-state cache (habits, tags,
    // categories, prefs, pushups, habitOrder, completionNotes).
    await refreshSqliteRoutineState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    console.warn(
      "[routine.sqliteRead] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
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
