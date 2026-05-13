/**
 * Boot wiring for the Mono cache mirror (PR #038).
 *
 * Mirrors `sqliteReadBoot.ts` (PR #037). Called once from
 * `useFinykMonoMirrorBoot()` after the auth `me` query and the
 * sqlite-wasm singleton are available.
 *
 * Stage 13 PR #078: the `feature.finyk.sqlite_v2.mono_mirror` flag
 * has been retired — the mirror now boots unconditionally.
 *
 *  1. Runs the finyk SQLite migrations (002 ships the mono mirror
 *     tables — see `packages/db-schema/src/sqlite/migrations`).
 *  2. Performs the initial `refreshFinykMonoMirrorState()` so the
 *     cache is warm before the first overlay read.
 *
 * Idempotent — calling it twice is a no-op.
 */

import { logger } from "@shared/lib";
import { getSqliteDb } from "../../../core/db/sqlite.js";
import { migrateFinyk } from "./clientMigrate.js";
import { refreshFinykMonoMirrorState } from "./monoMirrorReader.js";

let booted = false;

/**
 * Initialise the Mono mirror cache.
 *
 * @param userId - The authenticated user's id (from the `me` query).
 *   When `null` the boot is skipped (pre-auth window).
 * @returns `true` if the mirror was activated.
 */
export async function bootFinykMonoMirror(
  userId: string | null,
): Promise<boolean> {
  if (booted) return false;
  if (!userId) return false;

  try {
    const handle = await getSqliteDb();
    const client = handle.migrationClient();
    await migrateFinyk(client);
    await refreshFinykMonoMirrorState(client, userId);

    booted = true;
    return true;
  } catch (err) {
    logger.warn(
      "[finyk.monoMirror] boot failed, falling back to LS",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Test helper — reset boot state between specs. */
export function __resetFinykMonoMirrorBootForTests(): void {
  booted = false;
}
