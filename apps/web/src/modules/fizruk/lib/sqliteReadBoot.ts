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
 *  2. Performs the initial `refreshFizrukSqliteState()` so the cache
 *     is warm before the first overlay read.
 *  3. W1-WEIGHT-SOT стадія 3: `bootstrapBodyWeightFromBiometrics()`
 *     seeds `fizruk_measurements` from `hub_biometrics.weightKg` when
 *     the journal has no weight sample yet. Idempotent; no-ops once a
 *     weight entry exists in either fizruk store.
 *
 * The function is idempotent — calling it twice within the same
 * process is a no-op on the second call.
 *
 * Stage 8 PR #057f-tombstone originally also drained any residual LS
 * values (`fizruk_workouts_v1`, `fizruk_custom_exercises_v1`,
 * `fizruk_measurements_v1`) into SQLite here via
 * `importFizrukResidualFromLs` (`./residualImport.ts`). That one-time
 * pre-beta drain was removed 2026-08 once no testers were left with
 * pre-SQLite LS data to migrate — see git history for the prior
 * implementation.
 *
 * Між 2026-08 і 2026-09 тут стояв ще один крок — місток демо-сіду
 * (`importFizrukDemoSeed`), який під демо-прапорцем доносив засіяний
 * LS-payload до SQLite. Демо-режим знято 2026-09-17 разом із ним.
 */

import { logger } from "@shared/lib";
import { recordReadFallback } from "../../../core/observability/dualWriteTelemetry.js";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { bootstrapBodyWeightFromBiometrics } from "./bodyWeightBootstrap.js";
import { migrateFizruk } from "./clientMigrate.js";
import { registerRealEntryCounter } from "../../../core/onboarding/realEntryProbe.js";
import {
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "./sqliteReader.js";

// AI-CONTEXT: FTUX-детекція «чи є справжні записи» читає канонічний
// warm-cache через реєстр (`core/onboarding/realEntryProbe`), а не
// tombstone-нутий LS-ключ `fizruk_workouts_v1`. Реєструємось на module-scope:
// цей файл вантажиться лише у складі лінивого boot-кластера модуля,
// тож хабовий eager-чанк нових ребер не отримує.
registerRealEntryCounter(
  "fizruk",
  () => getCachedFizrukSqliteState().workouts.length,
);

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

    await refreshFizrukSqliteState(client, userId);

    // W1-WEIGHT-SOT стадія 3: seed the journal from the Profile
    // biometrics cache when it has no weight sample yet — see
    // `bodyWeightBootstrap.ts` (self-contained error handling; never
    // throws, so it can't fail the rest of the boot).
    await bootstrapBodyWeightFromBiometrics(client, userId);

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
