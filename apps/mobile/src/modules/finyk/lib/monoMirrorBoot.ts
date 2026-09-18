/**
 * Boot wiring for the mobile Mono cache mirror (PR #038).
 *
 * Mirrors `apps/mobile/src/modules/finyk/lib/sqliteReadBoot.ts`. Called
 * once from `useFinykMonoMirrorBoot` after the auth `me` cache is
 * available.
 *
 * Stage 13 PR #078: the `feature.finyk.sqlite_v2.mono_mirror` flag has
 * been retired — the mirror now boots unconditionally.
 *
 * Fail-soft: any thrown error is caught, logged via `console.warn`
 * and surfaces as `false` so consumers keep reading from MMKV.
 */

import { getSqliteMigrationClient } from "@/core/db/sqlite";

import { migrateFinyk } from "./clientMigrate";
import { refreshFinykMonoMirrorState } from "./monoMirrorReader";

/**
 * Initialise the Mono mirror cache.
 *
 * @param userId - The authenticated user's id. When falsy the boot is
 *   skipped (pre-auth window).
 * @returns `true` only if the cache was actually refreshed.
 */
export async function bootFinykMonoMirror(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  try {
    const client = await getSqliteMigrationClient();
    await migrateFinyk(client);
    await refreshFinykMonoMirrorState(client, userId);
    return true;
  } catch (err) {
    console.warn(
      "[finyk.monoMirror] boot failed, falling back to MMKV",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
