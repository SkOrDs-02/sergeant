import {
  buildDelete,
  buildLwwUpsert,
  buildReconcileChildren,
  createApplyOps,
  toIntOrNull,
  toRealOrNull,
  type ApplyDualWriteOptions as CoreApplyDualWriteOptions,
  type ApplyDualWriteResult as CoreApplyDualWriteResult,
  type DualWriteLogger as CoreDualWriteLogger,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger as webLogger } from "@shared/lib";

import type {
  FizrukCustomExerciseSnapshot,
  FizrukDailyLogSnapshot,
  FizrukDualWriteOp,
  FizrukItemSnapshot,
  FizrukMeasurementSnapshot,
  FizrukMonthlyPlanSnapshot,
  FizrukWorkoutSnapshot,
  FizrukWorkoutTemplateSnapshot,
} from "./diff/index.js";

/**
 * Async SQLite-side adapter for the Fizruk dual-write layer.
 *
 * Stage 12 PR #070f-dualwrite. Migrated onto `@sergeant/dualwrite-core` in
 * ADR-0073 крок 4: the op-loop is now `createApplyOps` (`errorPolicy:
 * "best-effort"` — aligned with every other pipeline in Open Question #1,
 * PR #112) and every table's SQL is emitted by the shared `buildLwwUpsert` /
 * `buildDelete` / `buildReconcileChildren` builders. Behaviour and emitted
 * SQL are byte-identical to the previous hand-written adapter — see
 * `adapter.snapshot.test.ts`.
 *
 * Design notes:
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op
 *   does NOT abort the rest.
 * - Idempotent: upserts use ON CONFLICT(id) DO UPDATE with LWW guard.
 * - LWW guard: updates only apply when the incoming `clientTs` is
 *   strictly newer than the local `updated_at`.
 * - `fizruk_workout_items` / `fizruk_workout_sets` cascade deletes stay
 *   hand-written: the workout-delete cascade fans out across two child
 *   tables in one op (including a `workout_item_id IN (SELECT …)` subquery
 *   for sets), a shape `buildReconcileChildren` doesn't model.
 */

export type ApplyDualWriteOptions = CoreApplyDualWriteOptions;
export type DualWriteLogger = CoreDualWriteLogger;
export type ApplyDualWriteResult = CoreApplyDualWriteResult;

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    webLogger.warn(`[fizruk.dualWrite] ${message}`, meta ?? {});
  }
};

const applyOps = createApplyOps<FizrukDualWriteOp>({
  errorPolicy: "best-effort",
  handlers: {
    "workout-upsert": async (client, op, rt) => {
      await upsertWorkout(client, op.workout, rt);
      return "applied";
    },
    "workout-delete": async (client, op, rt) => {
      await softDeleteWorkout(client, op.workoutId, rt);
      return "applied";
    },
    "custom-exercise-upsert": async (client, op, rt) => {
      await upsertCustomExercise(client, op.exercise, rt);
      return "applied";
    },
    "custom-exercise-delete": async (client, op, rt) => {
      await softDeleteCustomExercise(client, op.exerciseId, rt);
      return "applied";
    },
    "measurement-upsert": async (client, op, rt) => {
      await upsertMeasurement(client, op.measurement, rt);
      return "applied";
    },
    "measurement-delete": async (client, op, rt) => {
      await softDeleteMeasurement(client, op.measurementId, rt);
      return "applied";
    },
    "daily-log-upsert": async (client, op, rt) => {
      await upsertDailyLog(client, op.entry, rt);
      return "applied";
    },
    "daily-log-delete": async (client, op, rt) => {
      await softDeleteDailyLog(client, op.entryId, rt);
      return "applied";
    },
    "monthly-plan-set": async (client, op, rt) => {
      await setMonthlyPlan(client, op.monthlyPlan, rt);
      return "applied";
    },
    "workout-template-upsert": async (client, op, rt) => {
      await upsertWorkoutTemplate(client, op.template, rt);
      return "applied";
    },
    "workout-template-delete": async (client, op, rt) => {
      await softDeleteWorkoutTemplate(client, op.templateId, rt);
      return "applied";
    },
  },
});

export async function applyFizrukDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly FizrukDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  return applyOps(client, ops, {
    userId: options.userId,
    clientTs: options.clientTs,
    logger: options.logger ?? DEFAULT_LOGGER,
  });
}

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
  // Hand-written SQL aligned wider than this table's own max column name
  // (`sort_order`/`updated_at`/`deleted_at`, 10 chars) — see `alignWidth` doc.
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
  // Hand-written SQL aligned one column wider than this table's own max
  // (`energy_level`, 12 chars) — see `alignWidth` doc.
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

const WORKOUT_UPSERT_SQL = buildLwwUpsert(WORKOUT_UPSERT_SPEC);
const WORKOUT_ITEM_UPSERT_SQL = buildLwwUpsert(WORKOUT_ITEM_UPSERT_SPEC);
const WORKOUT_SET_UPSERT_SQL = buildLwwUpsert(WORKOUT_SET_UPSERT_SPEC);
const CUSTOM_EXERCISE_UPSERT_SQL = buildLwwUpsert(CUSTOM_EXERCISE_UPSERT_SPEC);
const MEASUREMENT_UPSERT_SQL = buildLwwUpsert(MEASUREMENT_UPSERT_SPEC);
const DAILY_LOG_UPSERT_SQL = buildLwwUpsert(DAILY_LOG_UPSERT_SPEC);
const MONTHLY_PLAN_UPSERT_SQL = buildLwwUpsert(MONTHLY_PLAN_UPSERT_SPEC);
const WORKOUT_TEMPLATE_UPSERT_SQL = buildLwwUpsert(
  WORKOUT_TEMPLATE_UPSERT_SPEC,
);

const WORKOUT_DELETE_SQL = buildDelete({
  table: "fizruk_workouts",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
const CUSTOM_EXERCISE_DELETE_SQL = buildDelete({
  table: "fizruk_custom_exercises",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
const MEASUREMENT_DELETE_SQL = buildDelete({
  table: "fizruk_measurements",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
const DAILY_LOG_DELETE_SQL = buildDelete({
  table: "fizruk_daily_log",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
const WORKOUT_TEMPLATE_DELETE_SQL = buildDelete({
  table: "fizruk_workout_templates",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});

// Cascade soft-delete of items/sets when a whole workout is deleted — these
// WHERE shapes (`deleted_at IS NULL`, no LWW guard) match the reconcile
// keepCount-0 branch, so reuse that builder.
const WORKOUT_ITEMS_CASCADE_SQL = buildReconcileChildren(
  { table: "fizruk_workout_items", parentColumn: "workout_id" },
  0,
);

// -----------------------------------------------------------------------
// Workouts (parent + items + sets)
// -----------------------------------------------------------------------

/**
 * Shared type for sets inside workout items.
 */
export type WorkoutSet = {
  weightKg: number;
  reps: number;
  rpe?: number | null;
  [k: string]: unknown;
};

/**
 * Upserts a workout and all its child items/sets in a single pass.
 * Handles soft-delete of removed children.
 */
async function upsertWorkout(
  client: SqliteMigrationClient,
  w: FizrukWorkoutSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const groupsJson = JSON.stringify(w.groups ?? []);
  const warmupJson = w.warmup ? JSON.stringify(w.warmup) : null;
  const cooldownJson = w.cooldown ? JSON.stringify(w.cooldown) : null;
  const wellbeingJson = w.wellbeing ? JSON.stringify(w.wellbeing) : null;

  await client.run(WORKOUT_UPSERT_SQL, [
    w.id,
    userId,
    w.startedAt,
    w.endedAt ?? null,
    w.note ?? "",
    groupsJson,
    warmupJson,
    cooldownJson,
    wellbeingJson,
    clientTs,
    clientTs,
  ]);

  // Upsert items
  const items = w.items ?? [];
  for (const [i, item] of items.entries()) {
    await upsertWorkoutItem(client, item, w.id, userId, clientTs, i);
  }

  // Soft-delete items that were removed from the workout
  const itemIds = items.map((it) => it.id);
  await softDeleteRemovedChildren(
    client,
    "fizruk_workout_items",
    "workout_id",
    w.id,
    userId,
    clientTs,
    itemIds,
  );
}

async function upsertWorkoutItem(
  client: SqliteMigrationClient,
  item: FizrukItemSnapshot,
  workoutId: string,
  userId: string,
  clientTs: string,
  sortOrder: number,
): Promise<void> {
  const musclesPrimary = JSON.stringify(item.musclesPrimary ?? []);
  const musclesSecondary = JSON.stringify(item.musclesSecondary ?? []);

  await client.run(WORKOUT_ITEM_UPSERT_SQL, [
    item.id,
    workoutId,
    userId,
    item.exerciseId ?? "",
    item.nameUk ?? "",
    item.primaryGroup ?? "",
    musclesPrimary,
    musclesSecondary,
    item.type ?? "strength",
    item.durationSec ?? null,
    item.distanceM ?? null,
    sortOrder,
    clientTs,
    clientTs,
  ]);

  // Upsert sets
  const sets = item.sets ?? [];
  for (const [s, set] of sets.entries()) {
    const setId = `${item.id}:s${s}`;
    await upsertWorkoutSet(client, setId, item.id, userId, clientTs, set, s);
  }

  // Soft-delete removed sets
  const setIds = sets.map((_, s) => `${item.id}:s${s}`);
  await softDeleteRemovedChildren(
    client,
    "fizruk_workout_sets",
    "workout_item_id",
    item.id,
    userId,
    clientTs,
    setIds,
  );
}

async function upsertWorkoutSet(
  client: SqliteMigrationClient,
  setId: string,
  workoutItemId: string,
  userId: string,
  clientTs: string,
  set: WorkoutSet,
  sortOrder: number,
): Promise<void> {
  await client.run(WORKOUT_SET_UPSERT_SQL, [
    setId,
    workoutItemId,
    userId,
    set.weightKg ?? 0,
    set.reps ?? 0,
    set.rpe ?? null,
    sortOrder,
    clientTs,
    clientTs,
  ]);
}

async function softDeleteWorkout(
  client: SqliteMigrationClient,
  workoutId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  // Soft-delete the workout itself
  await client.run(WORKOUT_DELETE_SQL, [
    clientTs,
    clientTs,
    workoutId,
    userId,
    clientTs,
  ]);
  // Cascade soft-delete to items and sets
  await client.run(WORKOUT_ITEMS_CASCADE_SQL, [
    clientTs,
    clientTs,
    workoutId,
    userId,
  ]);
  await client.run(
    `UPDATE fizruk_workout_sets
        SET deleted_at = ?, updated_at = ?
      WHERE workout_item_id IN (
        SELECT id FROM fizruk_workout_items WHERE workout_id = ?
      ) AND user_id = ? AND deleted_at IS NULL`,
    [clientTs, clientTs, workoutId, userId],
  );
}

// -----------------------------------------------------------------------
// Child-row cleanup: soft-delete children that are no longer in the
// parent's array (e.g. items removed from a workout, sets removed
// from an item).
// -----------------------------------------------------------------------

async function softDeleteRemovedChildren(
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
// Custom exercises
// -----------------------------------------------------------------------

async function upsertCustomExercise(
  client: SqliteMigrationClient,
  exercise: FizrukCustomExerciseSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const dataJson = JSON.stringify(exercise);
  await client.run(CUSTOM_EXERCISE_UPSERT_SQL, [
    exercise.id,
    userId,
    dataJson,
    clientTs,
    clientTs,
  ]);
}

async function softDeleteCustomExercise(
  client: SqliteMigrationClient,
  exerciseId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(CUSTOM_EXERCISE_DELETE_SQL, [
    clientTs,
    clientTs,
    exerciseId,
    userId,
    clientTs,
  ]);
}

// -----------------------------------------------------------------------
// Measurements
// -----------------------------------------------------------------------

async function upsertMeasurement(
  client: SqliteMigrationClient,
  m: FizrukMeasurementSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(MEASUREMENT_UPSERT_SQL, [
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
  ]);
}

async function softDeleteMeasurement(
  client: SqliteMigrationClient,
  measurementId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(MEASUREMENT_DELETE_SQL, [
    clientTs,
    clientTs,
    measurementId,
    userId,
    clientTs,
  ]);
}

// -----------------------------------------------------------------------
// Daily log
// -----------------------------------------------------------------------

async function upsertDailyLog(
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

async function softDeleteDailyLog(
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

// -----------------------------------------------------------------------
// Monthly plan (singleton per user)
// -----------------------------------------------------------------------

async function setMonthlyPlan(
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
// Workout templates
// -----------------------------------------------------------------------

async function upsertWorkoutTemplate(
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

async function softDeleteWorkoutTemplate(
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
