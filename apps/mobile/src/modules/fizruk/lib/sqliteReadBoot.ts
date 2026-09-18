/**
 * Boot wiring for the mobile Fizruk SQLite read path.
 *
 * Stage 8 PR #057f-flag: the `feature.fizruk.sqlite_v2.read_sqlite`
 * flag has graduated — boot is now unconditional once `userId` is
 * available. Mirrors `apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts`.
 * Called once from the mobile Fizruk app shell (via
 * `useFizrukSqliteReadBoot`) after the auth `me` cache is available.
 * Steps:
 *
 *  1. Resolves a `SqliteMigrationClient` from the singleton expo-sqlite
 *     handle.
 *  2. Runs the fizruk SQLite migrations so the tables exist.
 *  3. Performs the initial `refreshFizrukSqliteState()` so the cache
 *     is warm before the first overlay read.
 *
 * Idempotency is the caller's responsibility: see
 * `useFizrukSqliteReadBoot` which guards on a `useRef(false)` so that
 * boot runs at most once per mount. The function itself does NOT
 * latch globally; this matches the routine read-overlay shape on
 * mobile (`apps/mobile/src/modules/routine/lib`).
 *
 * Fail-soft: any thrown error is caught, logged via `console.warn` and
 * surfaces as `false` so consumers can keep reading from MMKV.
 */

import { getSqliteMigrationClient } from "@/core/db/sqlite";

import { migrateFizruk } from "./clientMigrate";
import { importFizrukResidualFromMmkv } from "./residualImport";
import { refreshFizrukSqliteState } from "./sqliteReader";

/**
 * Initialise the SQLite read path. Stage 8 PR #057f-flag drop: no flag
 * check — boot runs whenever `userId` is provided.
 *
 * @param userId - The authenticated user's id (from
 *   `useUser()` / `me` query). When falsy the boot is skipped.
 * @returns `true` only if the cache was actually refreshed; `false`
 *   when the user is missing, the SQLite migration client is
 *   unavailable, or any step throws.
 */
export async function bootFizrukSqliteReadPath(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  try {
    const client = await getSqliteMigrationClient();
    await migrateFizruk(client);

    // Stage 8 PR #057f-tombstone: drain MMKV into SQLite before the
    // first cache refresh so warm-up sees any leftover values that
    // older builds wrote. Failures here are non-fatal — the residual
    // helper logs and falls back to a no-op.
    await importFizrukResidualFromMmkv(client, userId);

    await refreshFizrukSqliteState(client, userId);
    return true;
  } catch (err) {
    console.warn(
      "[fizruk.sqliteRead] boot failed, falling back to MMKV",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
