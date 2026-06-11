/**
 * Last validated: 2026-06-11
 * Status: Active
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { toIntOrNull } from "@shared/lib/dualWrite/core";
import type {
  FizrukCustomExerciseSnapshot,
  FizrukMeasurementSnapshot,
} from "../diff/index.js";

/**
 * Upserts a custom exercise.
 */
export async function upsertCustomExercise(
  client: SqliteMigrationClient,
  exercise: FizrukCustomExerciseSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  const dataJson = JSON.stringify(exercise);
  await client.run(
    `INSERT INTO fizruk_custom_exercises
       (id, user_id, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at,
       deleted_at = NULL
     WHERE excluded.updated_at > fizruk_custom_exercises.updated_at`,
    [exercise.id, userId, dataJson, clientTs, clientTs],
  );
}

/**
 * Soft-deletes a custom exercise.
 */
export async function softDeleteCustomExercise(
  client: SqliteMigrationClient,
  exerciseId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_custom_exercises
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, exerciseId, userId, clientTs],
  );
}

/**
 * Upserts a measurement entry.
 */
export async function upsertMeasurement(
  client: SqliteMigrationClient,
  m: FizrukMeasurementSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_measurements
       (id, user_id, measured_at, weight_kg, waist_cm, chest_cm, hips_cm,
        bicep_cm, sleep_hours, energy_level, mood,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       measured_at  = excluded.measured_at,
       weight_kg    = excluded.weight_kg,
       waist_cm     = excluded.waist_cm,
       chest_cm     = excluded.chest_cm,
       hips_cm      = excluded.hips_cm,
       bicep_cm     = excluded.bicep_cm,
       sleep_hours  = excluded.sleep_hours,
       energy_level = excluded.energy_level,
       mood         = excluded.mood,
       updated_at   = excluded.updated_at,
       deleted_at   = NULL
     WHERE excluded.updated_at > fizruk_measurements.updated_at`,
    [
      m.id,
      userId,
      m.at,
      toIntOrNull(m["weightKg"]),
      toIntOrNull(m["waistCm"]),
      toIntOrNull(m["chestCm"]),
      toIntOrNull(m["hipsCm"]),
      toIntOrNull(m["bicepCm"]),
      toIntOrNull(m["sleepHours"]),
      toIntOrNull(m["energyLevel"]),
      toIntOrNull(m["mood"]),
      clientTs,
      clientTs,
    ],
  );
}

/**
 * Soft-deletes a measurement entry.
 */
export async function softDeleteMeasurement(
  client: SqliteMigrationClient,
  measurementId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_measurements
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, measurementId, userId, clientTs],
  );
}
