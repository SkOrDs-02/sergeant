/**
 * Boot wiring for the SQLite read path (PR #025).
 *
 * Called once from `RoutineApp` (or the module bootstrap) after the
 * React-Query `me` cache and the sqlite-wasm singleton are available.
 *
 * Stage 8 PR #057r-flag dropped `feature.routine.sqlite_v2.read_sqlite`
 * — boot is now unconditional once `userId` is known.
 *
 * On success it performs the initial `refreshSqliteRoutineState()` /
 * `refreshSqliteCompletions()` so the cache is warm before the first
 * render; `loadRoutineState()` then overlays the cached values onto
 * `defaultRoutineState()` (no LS read).
 *
 * The function is idempotent — calling it twice is a no-op on the
 * second call.
 *
 * Stage 8 PR #057r-tombstone originally also added a residual-import
 * drain here so any leftover `hub_routine_v1` LS blob was bulk-imported
 * into SQLite (with a stale LWW timestamp) and then deleted before the
 * first cache refresh (`importRoutineResidualFromLs`,
 * `./residualImport.ts`). That one-time pre-beta drain was removed
 * 2026-08 once no testers were left with pre-SQLite LS data to migrate
 * — see git history for the prior implementation.
 */

import { logger } from "@shared/lib";
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
    logger.warn(
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
