/**
 * Boot wiring for the Fizruk SQLite read path.
 *
 * Stage 8 PR #057f-flag: the `feature.fizruk.sqlite_v2.read_sqlite`
 * flag has graduated — boot is now unconditional once `userId` is
 * available. Mirrors `apps/web/src/modules/routine/lib/sqliteReadBoot.ts`.
 * Called once from `FizrukApp` (via `useFizrukSqliteReadBoot`) after
 * the React-Query `me` cache and the sqlite-wasm singleton are
 * available. Steps:
 *
 *  1. Runs the fizruk SQLite migrations so the tables exist.
 *  2. Stage 8 PR #057f-tombstone: imports any residual LS values
 *     (`fizruk_workouts_v1`, `fizruk_custom_exercises_v1`,
 *     `fizruk_measurements_v1`) into the SQLite tables and deletes
 *     the LS keys. Idempotent; subsequent boots no-op once the LS
 *     keys are gone.
 *  3. Performs the initial `refreshFizrukSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * The function is idempotent — calling it twice within the same
 * process is a no-op on the second call.
 */

import { logger } from "@shared/lib";
import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { migrateFizruk } from "./clientMigrate.js";
import { importFizrukResidualFromLs } from "./residualImport.js";
import { refreshFizrukSqliteState } from "./sqliteReader.js";

let booted = false;

/**
 * Initialise the SQLite read path. Stage 8 PR #057f-flag drop: no flag
 * check — boot runs whenever `userId` is provided.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootFizrukSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;
  if (!userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateFizruk(client);

    // Stage 8 PR #057f-tombstone: drain LS into SQLite before the
    // first cache refresh so warm-up sees any leftover values that
    // older builds wrote. Failures here are non-fatal — the residual
    // helper logs and falls back to a no-op so the boot can keep
    // going on a fresh-install / clean-LS device.
    await importFizrukResidualFromLs(client, userId);

    await refreshFizrukSqliteState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    logger.warn(
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
