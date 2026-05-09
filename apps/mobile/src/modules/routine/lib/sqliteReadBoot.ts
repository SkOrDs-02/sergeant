/**
 * Boot wiring for the mobile Routine SQLite read path.
 *
 * Stage 8 PR #057r-tombstone-mobile of `docs/planning/storage-roadmap.md`.
 * Mirror of `apps/web/src/modules/routine/lib/sqliteReadBoot.ts` for
 * the mobile target. Called once from the mobile Routine app shell
 * (via `useRoutineSqliteReadBoot`) after the auth `me` cache is
 * available.
 *
 * Steps:
 *
 *  1. Resolve a `SqliteMigrationClient` from the singleton expo-sqlite
 *     handle.
 *  2. Run the routine SQLite client migrations so the tables exist.
 *  3. Drain any residual `hub_routine_v1` MMKV payload into SQLite via
 *     {@link importRoutineResidualFromMmkv} (idempotent + LWW-safe),
 *     then delete the MMKV key.
 *  4. Warm the `routine_entries` completions cache via
 *     {@link refreshSqliteCompletions}.
 *  5. Warm the Stage 10 full-state cache (habits / tags / categories /
 *     prefs / pushups / habitOrder / completionNotes) via
 *     {@link refreshSqliteRoutineState}.
 *
 * Stage 8 PR #057r-flag dropped `feature.routine.sqlite_v2.read_sqlite`
 * — boot is unconditional once `userId` is known. Idempotency is the
 * caller's responsibility: see `useRoutineSqliteReadBoot` which guards
 * on a `useRef(false)` so boot runs at most once per mount.
 *
 * Fail-soft: any thrown error is caught, logged via `console.warn` and
 * surfaces as `false` so consumers can keep reading from MMKV until the
 * dual-write tail catches up.
 */

import { getSqliteMigrationClient } from "@/core/db/sqlite";

import { migrateRoutine } from "./clientMigrate";
import { importRoutineResidualFromMmkv } from "./residualImport";
import {
  refreshSqliteCompletions,
  refreshSqliteRoutineState,
} from "./sqliteReader";

/**
 * Initialise the SQLite read path.
 *
 * @param userId - The authenticated user's id (from
 *   `useUser()` / `me` query). When falsy the boot is skipped.
 * @returns `true` only if the cache was actually refreshed; `false`
 *   when the user is missing, the SQLite migration client is
 *   unavailable, or any step throws.
 */
export async function bootRoutineSqliteReadPath(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  try {
    const client = await getSqliteMigrationClient();
    await migrateRoutine(client);

    // Stage 8 PR #057r-tombstone-mobile: drain any leftover
    // `hub_routine_v1` MMKV payload into SQLite before warming the
    // read caches so a first-launch user upgrading from the MMKV-write
    // era keeps their habits / tags / categories / prefs / pushups /
    // habitOrder / completionNotes / completions. Failures here are
    // non-fatal — the helper logs and falls back to a no-op so the
    // boot can keep going.
    await importRoutineResidualFromMmkv(client, userId);

    await refreshSqliteCompletions(client, userId);
    // Stage 10: also warm the full-state cache (habits, tags,
    // categories, prefs, pushups, habitOrder, completionNotes).
    await refreshSqliteRoutineState(client, userId);

    return true;
  } catch (err) {
    console.warn(
      "[routine.sqliteRead] boot failed, falling back to MMKV",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
