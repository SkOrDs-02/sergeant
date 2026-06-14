/**
 * Last validated: 2026-06-11
 * Status: Active
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { toIntOrNull, toRealOrNull } from "@shared/lib/dualWrite/core";
import type {
  FizrukDailyLogSnapshot,
  FizrukMonthlyPlanSnapshot,
  FizrukWorkoutTemplateSnapshot,
} from "../diff/index.js";

/**
 * Daily-log upsert for the workout session row.
 */
export async function upsertDailyLog(
  client: SqliteMigrationClient,
  e: FizrukDailyLogSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_daily_log
       (id, user_id, entry_at, weight_kg, sleep_hours, energy_level, mood,
        note, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       entry_at      = excluded.entry_at,
       weight_kg     = excluded.weight_kg,
       sleep_hours   = excluded.sleep_hours,
       energy_level  = excluded.energy_level,
       mood          = excluded.mood,
       note          = excluded.note,
       updated_at    = excluded.updated_at,
       deleted_at    = NULL
     WHERE excluded.updated_at > fizruk_daily_log.updated_at`,
    [
      e.id,
      userId,
      e.at,
      toRealOrNull(e.weightKg),
      toRealOrNull(e.sleepHours),
      toIntOrNull(e.energyLevel),
      toIntOrNull(e.mood),
      e.note ?? "",
      clientTs,
      clientTs,
    ],
  );
}

/**
 * Soft-deletes a daily-log entry.
 */
export async function softDeleteDailyLog(
  client: SqliteMigrationClient,
  entryId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_daily_log
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, entryId, userId, clientTs],
  );
}

/**
 * Sets the monthly plan singleton row.
 */
export async function setMonthlyPlan(
  client: SqliteMigrationClient,
  monthlyPlan: FizrukMonthlyPlanSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_monthly_plan (user_id, data_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > fizruk_monthly_plan.updated_at`,
    [userId, monthlyPlan.dataJson ?? "{}", clientTs],
  );
}

/**
 * Upserts a workout template.
 */
export async function upsertWorkoutTemplate(
  client: SqliteMigrationClient,
  t: FizrukWorkoutTemplateSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  const exerciseIdsJson = JSON.stringify(
    Array.isArray(t.exerciseIds) ? t.exerciseIds.map(String) : [],
  );
  const groupsJson = JSON.stringify(Array.isArray(t.groups) ? t.groups : []);
  await client.run(
    `INSERT INTO fizruk_workout_templates
       (id, user_id, name, exercise_ids_json, groups_json, last_used_at,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       name              = excluded.name,
       exercise_ids_json = excluded.exercise_ids_json,
       groups_json       = excluded.groups_json,
       last_used_at      = excluded.last_used_at,
       updated_at        = excluded.updated_at,
       deleted_at        = NULL
     WHERE excluded.updated_at > fizruk_workout_templates.updated_at`,
    [
      t.id,
      userId,
      t.name ?? "",
      exerciseIdsJson,
      groupsJson,
      t.lastUsedAt ?? null,
      clientTs,
      clientTs,
    ],
  );
}

/**
 * Soft-deletes a workout template.
 */
export async function softDeleteWorkoutTemplate(
  client: SqliteMigrationClient,
  templateId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_workout_templates
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, templateId, userId, clientTs],
  );
}
