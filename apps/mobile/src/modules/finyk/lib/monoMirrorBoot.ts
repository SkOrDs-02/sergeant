/**
 * Boot wiring for the mobile Mono cache mirror (PR #038).
 *
 * Mirrors `apps/mobile/src/modules/finyk/lib/sqliteReadBoot.ts`. Called
 * once from `useFinykMonoMirrorBoot` after the auth `me` cache is
 * available. Evaluates `feature.finyk.sqlite_v2.mono_mirror` and, when
 * enabled, runs the finyk migrations + initial cache refresh so the
 * `transactionsStore` overlay can paint cached rows on cold start.
 *
 * Boot is **outside React** so we cannot use `useFlag()` here — we
 * read the persisted flag map directly from MMKV (`@hub_flags_v1`),
 * the same key `useFlag` reads from.
 *
 * Fail-soft: any thrown error is caught, logged via `console.warn`
 * and surfaces as `false` so consumers keep reading from MMKV.
 */

import { safeReadLS } from "@/lib/storage";
import { getSqliteMigrationClient } from "@/core/db/sqlite";
import {
  EXPERIMENTAL_FLAGS,
  FLAGS_KEY,
  type FlagValues,
} from "@/core/lib/featureFlags";

import { migrateFinyk } from "./clientMigrate";
import { refreshFinykMonoMirrorState } from "./monoMirrorReader";

const FLAG_ID = "feature.finyk.sqlite_v2.mono_mirror";

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
 * Initialise the Mono mirror cache if the flag is on.
 *
 * @param userId - The authenticated user's id. When falsy the boot is
 *   skipped (pre-auth window).
 * @returns `true` only if the cache was actually refreshed.
 */
export async function bootFinykMonoMirror(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;

  const enabled = readFlagFromStorage();
  if (!enabled) return false;

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
