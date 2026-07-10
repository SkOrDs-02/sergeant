import {
  buildDelete,
  buildLwwUpsert,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  FizrukMonthlyPlanSnapshot,
  FizrukWorkoutTemplateSnapshot,
} from "./diff";

// -----------------------------------------------------------------------
// Table specs
// -----------------------------------------------------------------------

const MONTHLY_PLAN_UPSERT_SPEC: TableSpec = {
  table: "fizruk_monthly_plan",
  insertClause: `INSERT INTO fizruk_monthly_plan (user_id, data_json, updated_at)
     VALUES (?, ?, ?)`,
  conflictTarget: ["user_id"],
  updateColumns: [{ column: "data_json" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const WORKOUT_TEMPLATE_UPSERT_SPEC: TableSpec = {
  table: "fizruk_workout_templates",
  insertClause: `INSERT INTO fizruk_workout_templates
       (id, user_id, name, exercise_ids_json, groups_json, last_used_at,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "name" },
    { column: "exercise_ids_json" },
    { column: "groups_json" },
    { column: "last_used_at" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const MONTHLY_PLAN_UPSERT_SQL = buildLwwUpsert(MONTHLY_PLAN_UPSERT_SPEC);
const WORKOUT_TEMPLATE_UPSERT_SQL = buildLwwUpsert(
  WORKOUT_TEMPLATE_UPSERT_SPEC,
);
const WORKOUT_TEMPLATE_DELETE_SQL = buildDelete({
  table: "fizruk_workout_templates",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — monthly-plan singleton row
// -----------------------------------------------------------------------

export async function setMonthlyPlan(
  client: SqliteMigrationClient,
  monthlyPlan: FizrukMonthlyPlanSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(MONTHLY_PLAN_UPSERT_SQL, [
    userId,
    monthlyPlan.dataJson ?? "{}",
    clientTs,
  ]);
}

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — workout-template per-row upsert / soft-delete
// -----------------------------------------------------------------------

export async function upsertWorkoutTemplate(
  client: SqliteMigrationClient,
  t: FizrukWorkoutTemplateSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const exerciseIdsJson = JSON.stringify(
    Array.isArray(t.exerciseIds) ? t.exerciseIds.map(String) : [],
  );
  const groupsJson = JSON.stringify(Array.isArray(t.groups) ? t.groups : []);
  await client.run(WORKOUT_TEMPLATE_UPSERT_SQL, [
    t.id,
    userId,
    t.name ?? "",
    exerciseIdsJson,
    groupsJson,
    t.lastUsedAt ?? null,
    clientTs,
    clientTs,
  ]);
}

export async function softDeleteWorkoutTemplate(
  client: SqliteMigrationClient,
  templateId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(WORKOUT_TEMPLATE_DELETE_SQL, [
    clientTs,
    clientTs,
    templateId,
    userId,
    clientTs,
  ]);
}
