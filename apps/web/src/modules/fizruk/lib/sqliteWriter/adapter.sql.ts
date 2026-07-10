/**
 * Pre-built SQL, helper functions, and non-registry op implementations for
 * the Fizruk dual-write adapter.
 *
 * Extracted from `adapter.ts` to keep that file under the 600-line
 * module-size hard rule (Hard Rule #18). All exports are consumed only
 * by `adapter.ts` — not part of the public module surface.
 *
 * Non-registry tables (fizruk_daily_log, fizruk_monthly_plan,
 * fizruk_workout_templates) live here because they have no sync-v2 outbox
 * enqueue — they belong to the Phase 2 SQLite-only backlog.
 */

import {
  buildDelete,
  buildLwwUpsert,
  buildReconcileChildren,
  toIntOrNull,
  toRealOrNull,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type {
  FizrukDailyLogSnapshot,
  FizrukMonthlyPlanSnapshot,
  FizrukWorkoutTemplateSnapshot,
} from "./diff/index.js";

// -----------------------------------------------------------------------
// Table specs
// -----------------------------------------------------------------------

const WORKOUT_UPSERT_SPEC: TableSpec = {
  table: "fizruk_workouts",
  insertClause: `INSERT INTO fizruk_workouts
       (id, user_id, started_at, ended_at, note, groups_json,
        warmup_json, cooldown_json, wellbeing_json,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "started_at" },
    { column: "ended_at" },
    { column: "note" },
    { column: "groups_json" },
    { column: "warmup_json" },
    { column: "cooldown_json" },
    { column: "wellbeing_json" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const WORKOUT_ITEM_UPSERT_SPEC: TableSpec = {
  table: "fizruk_workout_items",
  insertClause: `INSERT INTO fizruk_workout_items
       (id, workout_id, user_id, exercise_id, name_uk, primary_group,
        muscles_primary, muscles_secondary, type, duration_sec, distance_m,
        sort_order, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "workout_id" },
    { column: "exercise_id" },
    { column: "name_uk" },
    { column: "primary_group" },
    { column: "muscles_primary" },
    { column: "muscles_secondary" },
    { column: "type" },
    { column: "duration_sec" },
    { column: "distance_m" },
    { column: "sort_order" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const WORKOUT_SET_UPSERT_SPEC: TableSpec = {
  table: "fizruk_workout_sets",
  insertClause: `INSERT INTO fizruk_workout_sets
       (id, workout_item_id, user_id, weight_kg, reps, rpe,
        sort_order, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "weight_kg" },
    { column: "reps" },
    { column: "rpe" },
    { column: "sort_order" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
  alignWidth: 15,
};

const CUSTOM_EXERCISE_UPSERT_SPEC: TableSpec = {
  table: "fizruk_custom_exercises",
  insertClause: `INSERT INTO fizruk_custom_exercises
       (id, user_id, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "data_json" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const MEASUREMENT_UPSERT_SPEC: TableSpec = {
  table: "fizruk_measurements",
  insertClause: `INSERT INTO fizruk_measurements
       (id, user_id, measured_at, weight_kg, waist_cm, chest_cm, hips_cm,
        bicep_cm, sleep_hours, energy_level, mood,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "measured_at" },
    { column: "weight_kg" },
    { column: "waist_cm" },
    { column: "chest_cm" },
    { column: "hips_cm" },
    { column: "bicep_cm" },
    { column: "sleep_hours" },
    { column: "energy_level" },
    { column: "mood" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const DAILY_LOG_UPSERT_SPEC: TableSpec = {
  table: "fizruk_daily_log",
  insertClause: `INSERT INTO fizruk_daily_log
       (id, user_id, entry_at, weight_kg, sleep_hours, energy_level, mood,
        note, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "entry_at" },
    { column: "weight_kg" },
    { column: "sleep_hours" },
    { column: "energy_level" },
    { column: "mood" },
    { column: "note" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
  alignWidth: 13,
};

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

// -----------------------------------------------------------------------
// Pre-built SQL strings
// -----------------------------------------------------------------------

export const WORKOUT_UPSERT_SQL = buildLwwUpsert(WORKOUT_UPSERT_SPEC);
export const WORKOUT_ITEM_UPSERT_SQL = buildLwwUpsert(WORKOUT_ITEM_UPSERT_SPEC);
export const WORKOUT_SET_UPSERT_SQL = buildLwwUpsert(WORKOUT_SET_UPSERT_SPEC);
export const CUSTOM_EXERCISE_UPSERT_SQL = buildLwwUpsert(
  CUSTOM_EXERCISE_UPSERT_SPEC,
);
export const MEASUREMENT_UPSERT_SQL = buildLwwUpsert(MEASUREMENT_UPSERT_SPEC);
export const DAILY_LOG_UPSERT_SQL = buildLwwUpsert(DAILY_LOG_UPSERT_SPEC);
export const MONTHLY_PLAN_UPSERT_SQL = buildLwwUpsert(MONTHLY_PLAN_UPSERT_SPEC);
export const WORKOUT_TEMPLATE_UPSERT_SQL = buildLwwUpsert(
  WORKOUT_TEMPLATE_UPSERT_SPEC,
);

export const WORKOUT_DELETE_SQL = buildDelete({
  table: "fizruk_workouts",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
export const CUSTOM_EXERCISE_DELETE_SQL = buildDelete({
  table: "fizruk_custom_exercises",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
export const MEASUREMENT_DELETE_SQL = buildDelete({
  table: "fizruk_measurements",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
export const DAILY_LOG_DELETE_SQL = buildDelete({
  table: "fizruk_daily_log",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
export const WORKOUT_TEMPLATE_DELETE_SQL = buildDelete({
  table: "fizruk_workout_templates",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});

// Cascade soft-delete of items/sets when a whole workout is deleted.
export const WORKOUT_ITEMS_CASCADE_SQL = buildReconcileChildren(
  { table: "fizruk_workout_items", parentColumn: "workout_id" },
  0,
);

// -----------------------------------------------------------------------
// softDeleteRemovedChildren — soft-deletes children no longer in the
// parent's array (e.g. items removed from a workout, sets removed from
// an item).
// -----------------------------------------------------------------------

export async function softDeleteRemovedChildren(
  client: SqliteMigrationClient,
  tableName: string,
  parentCol: string,
  parentId: string,
  userId: string,
  clientTs: string,
  keepIds: string[],
): Promise<void> {
  const sql = buildReconcileChildren(
    { table: tableName, parentColumn: parentCol },
    keepIds.length,
  );
  if (keepIds.length === 0) {
    await client.run(sql, [clientTs, clientTs, parentId, userId]);
    return;
  }
  await client.run(sql, [clientTs, clientTs, parentId, userId, ...keepIds]);
}

// -----------------------------------------------------------------------
// Non-registry op implementations (no sync-v2 outbox enqueue — Phase 2
// SQLite-only backlog): daily log, monthly plan, workout templates.
// -----------------------------------------------------------------------

export async function upsertDailyLog(
  client: SqliteMigrationClient,
  e: FizrukDailyLogSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(DAILY_LOG_UPSERT_SQL, [
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
  ]);
}

export async function softDeleteDailyLog(
  client: SqliteMigrationClient,
  entryId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(DAILY_LOG_DELETE_SQL, [
    clientTs,
    clientTs,
    entryId,
    userId,
    clientTs,
  ]);
}

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
