import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  FizrukMonthlyPlanSnapshot,
  FizrukWorkoutTemplateSnapshot,
} from "./diff";

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — monthly-plan singleton row
// -----------------------------------------------------------------------

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

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — workout-template per-row upsert / soft-delete
// -----------------------------------------------------------------------

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
