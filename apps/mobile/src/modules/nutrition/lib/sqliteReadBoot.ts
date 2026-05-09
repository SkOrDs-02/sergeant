/**
 * Boot wiring for the mobile Nutrition SQLite read path (PR #033).
 *
 * Mirrors `apps/web/src/modules/nutrition/lib/sqliteReadBoot.ts`. Called
 * once from the mobile Nutrition app shell (via
 * `useNutritionSqliteReadBoot`) after the auth `me` cache is available:
 *
 *  1. Resolves a `SqliteMigrationClient` from the singleton expo-sqlite
 *     handle.
 *  2. Runs the nutrition SQLite migrations so the tables exist.
 *  3. Stage 8 PR #057n-tombstone: imports any residual MMKV values
 *     (`nutrition_log_v1`, `nutrition_pantries_v1`,
 *     `nutrition_active_pantry_v1`, `nutrition_prefs_v1`) into the
 *     SQLite tables and deletes the MMKV keys. Idempotent; subsequent
 *     boots no-op once the MMKV keys are gone.
 *  4. Performs the initial `refreshNutritionSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Stage 8 PR #057n dropped `feature.nutrition.sqlite_v2.read_sqlite` —
 * the boot is unconditional once a `userId` is available.
 *
 * Fail-soft: any thrown error is caught, logged via `console.warn` and
 * surfaces as `false` so consumers can keep reading from the empty
 * cache (and MMKV residue, until residual-import lands).
 */

import { getSqliteMigrationClient } from "@/core/db/sqlite";

import { migrateNutrition } from "./clientMigrate";
import { importNutritionResidualFromMmkv } from "./residualImport";
import { refreshNutritionSqliteState } from "./sqliteReader";

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from
 *   `useUser()` / `me` query). When falsy the boot is skipped.
 * @returns `true` only if the cache was actually refreshed; `false`
 *   when the user is missing, the SQLite migration client is
 *   unavailable, or any step throws.
 */
export async function bootNutritionSqliteReadPath(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  try {
    const client = await getSqliteMigrationClient();
    await migrateNutrition(client);
    // Stage 8 PR #057n-tombstone: opportunistic, fail-soft. The
    // helper itself catches and logs any apply error so a hostile
    // MMKV blob can't block the rest of the boot.
    await importNutritionResidualFromMmkv(client, userId);
    await refreshNutritionSqliteState(client, userId);
    return true;
  } catch (err) {
    console.warn(
      "[nutrition.sqliteRead] boot failed, falling back to MMKV",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
