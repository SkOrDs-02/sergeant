/**
 * Last validated: 2026-08-04
 * Status: Active
 *
 * Client-side, one-time bootstrap for users whose only body-weight
 * value lives in the Profile biometrics snapshot (`hub_biometrics`)
 * and never made it into the canonical fizruk journal.
 *
 * W1-WEIGHT-SOT стадія 3 (ADR-0080: fizruk — SoT ваги тіла;
 * `hub_biometrics.weightKg` — кеш, не незалежне джерело).
 *
 * This is deliberately NOT a SQL migration — there is no server column
 * for `hub_biometrics.weightKg` to backfill from or DROP (Hard Rule #4
 * two-phase DROP doesn't apply; nothing server-side exists to drop).
 * It's a local copy: seed `fizruk_measurements` with the cached
 * `weightKg` as of `weightUpdatedAt`, so a user who only ever weighed
 * in through Profile doesn't start with an empty fizruk journal (and
 * therefore an empty weight history / TDEE input once the cache
 * expires or the device changes).
 *
 * Idempotent by construction: it only writes when the freshly-refreshed
 * fizruk cache has zero body-weight samples (`selectLatestBodyWeight`
 * across `dailyLog` + `measurements`). Once the seed row lands, every
 * later boot sees a non-empty union and no-ops — no dedup key or flag
 * needed beyond "does the canonical journal already have an entry".
 */
import { selectLatestBodyWeight } from "@sergeant/fizruk-domain";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger } from "@shared/lib";
import { readBiometrics } from "../../../core/profile/biometrics.js";
import { applyFizrukDualWriteOps } from "./sqliteWriter/adapter.js";
import {
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "./sqliteReader.js";

/**
 * Seed one `fizruk_measurements` row from `hub_biometrics.weightKg`
 * when the fizruk journal has no weight sample yet.
 *
 * Must run after `refreshFizrukSqliteState()` so the emptiness check
 * sees current data (including anything just drained from residual LS
 * import). Refreshes the cache again after a successful write so
 * hooks mounted this boot see the seeded row immediately.
 *
 * @returns `true` when a row was written, `false` on no-op or failure.
 */
export async function bootstrapBodyWeightFromBiometrics(
  client: SqliteMigrationClient,
  userId: string,
): Promise<boolean> {
  const cache = getCachedFizrukSqliteState();
  const existing = selectLatestBodyWeight(cache.dailyLog, cache.measurements);
  if (existing != null) return false;

  const biometrics = readBiometrics();
  if (biometrics.weightKg == null) return false;
  const at = biometrics.weightUpdatedAt ?? biometrics.updatedAt;

  try {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "measurement-upsert",
          measurement: {
            id: `m_bootstrap_${userId}`,
            at,
            weightKg: biometrics.weightKg,
          },
        },
      ],
      { userId, clientTs: at },
    );
    await refreshFizrukSqliteState(client, userId);
    return true;
  } catch (err) {
    logger.warn(
      "[fizruk.bodyWeightBootstrap] apply failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
