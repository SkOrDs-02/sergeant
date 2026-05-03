/**
 * Boot wiring for the mobile Nutrition SQLite read path (PR #033).
 *
 * Mirrors `apps/web/src/modules/nutrition/lib/sqliteReadBoot.ts`. Called
 * once from the mobile Nutrition app shell (via
 * `useNutritionSqliteReadBoot`) after the auth `me` cache is available.
 * Evaluates the `feature.nutrition.sqlite_v2.read_sqlite` flag and,
 * when enabled:
 *
 *  1. Resolves a `SqliteMigrationClient` from the singleton expo-sqlite
 *     handle.
 *  2. Runs the nutrition SQLite migrations so the tables exist.
 *  3. Performs the initial `refreshNutritionSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Boot is **outside React** so we cannot use `useFlag()` here — instead
 * we read the persisted flag map directly from MMKV (`@hub_flags_v1`),
 * exactly the same key `useFlag` reads from.
 *
 * Fail-soft: any thrown error is caught, logged via `console.warn` and
 * surfaces as `false` so consumers can keep reading from MMKV.
 */

import { safeReadLS } from "@/lib/storage";
import { getSqliteMigrationClient } from "@/core/db/sqlite";
import {
  EXPERIMENTAL_FLAGS,
  FLAGS_KEY,
  type FlagValues,
} from "@/core/lib/featureFlags";

import { migrateNutrition } from "./clientMigrate";
import { refreshNutritionSqliteState } from "./sqliteReader";

const FLAG_ID = "feature.nutrition.sqlite_v2.read_sqlite";

function readFlagFromStorage(): boolean {
  const stored = safeReadLS<FlagValues>(FLAGS_KEY, null);
  if (stored && typeof stored === "object") {
    const v = stored[FLAG_ID];
    if (typeof v === "boolean") return v;
  }
  const def = EXPERIMENTAL_FLAGS.find((f) => f.id === FLAG_ID);
  return def ? def.defaultValue : false;
}

/**
 * Initialise the SQLite read path if the feature flag is on.
 *
 * @param userId - The authenticated user's id (from
 *   `useUser()` / `me` query). When falsy the boot is skipped.
 * @returns `true` only if the cache was actually refreshed; `false`
 *   when the flag is off, the user is missing, the SQLite migration
 *   client is unavailable, or any step throws.
 */
export async function bootNutritionSqliteReadPath(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  const enabled = readFlagFromStorage();
  if (!enabled) return false;

  try {
    const client = await getSqliteMigrationClient();
    await migrateNutrition(client);
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
