/**
 * Boot wiring for the Nutrition SQLite read path (PR #033).
 *
 * Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts`. Called
 * once from the Nutrition app shell (via `useNutritionSqliteReadBoot`)
 * after the React-Query `me` cache and the sqlite-wasm singleton are
 * available:
 *
 *  1. Runs the nutrition SQLite migrations so the tables exist.
 *  2. Stage 8 PR #057n-tombstone: imports any residual LS values
 *     (`nutrition_log_v1`, `nutrition_pantries_v1`,
 *     `nutrition_active_pantry_v1`, `nutrition_prefs_v1`) into the
 *     SQLite tables and deletes the LS keys. Idempotent; subsequent
 *     boots no-op once the LS keys are gone.
 *  3. Performs the initial `refreshNutritionSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Stage 8 PR #057n dropped `feature.nutrition.sqlite_v2.read_sqlite` —
 * the boot is unconditional once a `userId` is available. The function
 * latches via the module-level `booted` flag so the second call is a
 * no-op.
 */

import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { migrateNutrition } from "./clientMigrate.js";
import { importNutritionResidualFromLs } from "./residualImport.js";
import { refreshNutritionSqliteState } from "./sqliteReader.js";

let booted = false;

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootNutritionSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;
  if (!userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateNutrition(client);

    // Stage 8 PR #057n-tombstone: drain LS into SQLite before the
    // first cache refresh so warm-up sees any leftover values that
    // older builds wrote. Failures here are non-fatal — the residual
    // helper logs and falls back to a no-op so the boot can keep
    // going on a fresh-install / clean-LS device.
    await importNutritionResidualFromLs(client, userId);

    await refreshNutritionSqliteState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    console.warn(
      "[nutrition.sqliteRead] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
    recordReadFallback(
      "nutrition",
      err instanceof Error ? `boot-failed: ${err.message}` : "boot-failed",
    );
    return false;
  }
}

/** Test helper — reset boot state between specs. */
export function __resetNutritionSqliteReadBootForTests(): void {
  booted = false;
}
