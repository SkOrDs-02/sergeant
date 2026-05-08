/**
 * Boot wiring for the Nutrition SQLite read path (PR #033).
 *
 * Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts`. Called
 * once from the Nutrition app shell (via `useNutritionSqliteReadBoot`)
 * after the React-Query `me` cache and the sqlite-wasm singleton are
 * available. Evaluates the `feature.nutrition.sqlite_v2.read_sqlite`
 * flag and, when enabled:
 *
 *  1. Runs the nutrition SQLite migrations so the tables exist.
 *  2. Performs the initial `refreshNutritionSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * The function is idempotent — calling it twice with the same flag
 * value is a no-op on the second call.
 */

import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getFlag } from "../../../core/lib/featureFlags.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { migrateNutrition } from "./clientMigrate.js";
import { refreshNutritionSqliteState } from "./sqliteReader.js";

const FLAG_ID = "feature.nutrition.sqlite_v2.read_sqlite";

let booted = false;

/**
 * Initialise the SQLite read path if the feature flag is on.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export async function bootNutritionSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;

  const enabled = getFlag(FLAG_ID);
  if (!enabled || !userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateNutrition(client);
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
