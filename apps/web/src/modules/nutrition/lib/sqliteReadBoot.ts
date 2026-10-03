/**
 * Last validated: 2026-08-08
 * Status: Active
 * Boot wiring for the Nutrition SQLite read path (PR #033).
 *
 * Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts`. Called
 * once from the Nutrition app shell (via `useNutritionSqliteReadBoot`)
 * after the React-Query `me` cache and the sqlite-wasm singleton are
 * available:
 *
 *  1. Runs the nutrition SQLite migrations so the tables exist.
 *  2. Performs the initial `refreshNutritionSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Stage 8 PR #057n dropped `feature.nutrition.sqlite_v2.read_sqlite` —
 * the boot is unconditional once a `userId` is available. The function
 * latches via the module-level `booted` flag so the second call is a
 * no-op.
 *
 * Stage 8 PR #057n-tombstone originally also drained any residual LS
 * values (`nutrition_log_v1`, `nutrition_pantries_v1`,
 * `nutrition_active_pantry_v1`, `nutrition_prefs_v1`) into SQLite here
 * via `importNutritionResidualFromLs` (`./residualImport.ts`). That
 * one-time pre-beta drain was removed 2026-08 once no testers were left
 * with pre-SQLite LS data to migrate — see git history for the prior
 * implementation.
 *
 * Між 2026-08 і 2026-09 тут стояв ще один крок — місток демо-сіду
 * (`importNutritionDemoSeed`), який під демо-прапорцем доносив засіяний
 * LS-payload до SQLite. Демо-режим знято 2026-09-17 разом із ним.
 */

import { logger } from "@shared/lib";
import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { migrateNutrition } from "./clientMigrate.js";
import { registerRealEntryCounter } from "../../../core/onboarding/realEntryProbe.js";
import {
  getCachedNutritionSqliteState,
  refreshNutritionSqliteState,
} from "./sqliteReader.js";

// AI-CONTEXT: FTUX-детекція «чи є справжні записи» читає канонічний
// warm-cache через реєстр (`core/onboarding/realEntryProbe`), а не
// tombstone-нутий LS-ключ `nutrition_log_v1`. Реєструємось на module-scope:
// цей файл вантажиться лише у складі лінивого boot-кластера модуля,
// тож хабовий eager-чанк нових ребер не отримує.
registerRealEntryCounter("nutrition", () => {
  let meals = 0;
  for (const day of Object.values(getCachedNutritionSqliteState().log)) {
    meals += day.meals.length;
  }
  return meals;
});

let booted = false;
// Бут кличуть і `NutritionBootCluster`, і `NutritionApp`. `booted` ставиться
// лише після успіху, тож без спільного промісу обидва виклики проганяли
// міграцію й читання паралельно, а завершувались у різний час.
let inFlight: Promise<boolean> | null = null;

/**
 * Initialise the SQLite read path. Concurrent calls share one run.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the SQLite read path was activated.
 */
export function bootNutritionSqliteReadPath(
  userId: string | null,
): Promise<boolean> {
  if (booted || !userId) return Promise.resolve(false);
  inFlight ??= runBoot(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runBoot(userId: string): Promise<boolean> {
  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateNutrition(client);

    await refreshNutritionSqliteState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    logger.warn(
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
  inFlight = null;
}
