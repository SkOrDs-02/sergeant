/**
 * Boot wiring for the Finyk SQLite read path.
 *
 * Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts`.
 * Called once from the Finyk app shell (via `useFinykSqliteReadBoot`)
 * after the React-Query `me` cache and the sqlite-wasm singleton are
 * available. Steps:
 *
 *  1. Runs the finyk SQLite migrations so the tables exist.
 *  2. Stage 8 PR #057k-tombstone: imports any residual LS values
 *     (14 `finyk_*` domain keys + `finyk_show_balance_v1`) into the
 *     SQLite tables and deletes the LS keys. Idempotent; subsequent
 *     boots no-op once the LS keys are gone.
 *  3. Performs the initial `refreshFinykSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Stage 8 PR #057k-flag — `feature.finyk.sqlite_v2.read_sqlite` was
 * graduated out of the registry; the boot now fires unconditionally
 * once a `userId` is available. Idempotent — calling it twice is a
 * no-op on the second call.
 */

import { logger } from "@shared/lib";
import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { migrateFinyk } from "./clientMigrate.js";
import { importFinykResidualFromLs } from "./residualImport.js";
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

    // Stage 8 PR #057k-tombstone: drain LS into SQLite before the
    // first cache refresh so warm-up sees any leftover values that
    // older builds wrote. Failures here are non-fatal -- the residual
    // helper logs and falls back to a no-op so the boot can keep
    // going on a fresh-install / clean-LS device.
    await importFinykResidualFromLs(client, userId);

    await refreshFinykSqliteState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    logger.warn(
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
