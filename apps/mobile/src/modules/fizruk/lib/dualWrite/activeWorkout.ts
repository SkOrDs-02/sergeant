import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukActiveWorkoutSnapshot } from "./diff";

/**
 * Stage 12.5 / PR #070f3-active-workout-dualwrite — the kv_store
 * key under which the active-workout id is mirrored. Mirrors the
 * MMKV slot constant `STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT` exactly
 * so a future tombstone PR can drain MMKV → kv_store on boot under
 * the same key.
 */
export const ACTIVE_WORKOUT_KV_KEY = "fizruk_active_workout_id_v1";

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f3-active-workout-dualwrite — active-workout
// kv_store slot writer
// -----------------------------------------------------------------------

/**
 * Mirror the active-workout id into the shared `kv_store` table at
 * key `fizruk_active_workout_id_v1`. The `value` column is
 * `JSON.stringify(activeWorkoutId)` — a JSON-encoded `string`
 * (`'"abc"'`) for an active id, or the JSON literal `'null'` when
 * the slot is cleared. The `updated_at` column is `INTEGER` epoch
 * millis (per the `kvStore` Drizzle schema), so we coerce `clientTs`
 * (ISO 8601) via `Date.parse` and apply the LWW guard against the
 * existing row's `updated_at`.
 *
 * Unlike the per-table writers above, this op does **not** scope the
 * row to a `user_id`: `kv_store` is a per-device table (no
 * server-side counterpart) and the active-workout slot is a single
 * device-local string. Multi-account devices share the same
 * `kv_store` row across users — matching the existing MMKV slot
 * `STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT` semantics.
 */
export async function setActiveWorkout(
  client: SqliteMigrationClient,
  activeWorkout: FizrukActiveWorkoutSnapshot,
  clientTs: string,
): Promise<void> {
  const id = activeWorkout.activeWorkoutId;
  const value = JSON.stringify(id ?? null);
  const parsed = Date.parse(clientTs);
  const updatedAtMs = Number.isFinite(parsed) ? parsed : Date.now();
  await client.run(
    `INSERT INTO kv_store (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value      = excluded.value,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > kv_store.updated_at`,
    [ACTIVE_WORKOUT_KV_KEY, value, updatedAtMs],
  );
}
