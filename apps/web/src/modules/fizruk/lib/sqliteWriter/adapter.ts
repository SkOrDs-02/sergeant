import {
  createApplyOps,
  toIntOrNull,
  type ApplyDualWriteOptions,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type DualWriteRuntime,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger as webLogger } from "@shared/lib";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";
import { fireSyncOutboxUpsert } from "../../../../core/syncEngine/fireSyncOutboxUpsert.js";
import type {
  FizrukCustomExerciseSnapshot,
  FizrukDualWriteOp,
  FizrukItemSnapshot,
  FizrukMeasurementSnapshot,
  FizrukWorkoutSnapshot,
} from "./diff/index.js";
import {
  CUSTOM_EXERCISE_DELETE_SQL,
  CUSTOM_EXERCISE_UPSERT_SQL,
  MEASUREMENT_DELETE_SQL,
  MEASUREMENT_UPSERT_SQL,
  setMonthlyPlan,
  softDeleteDailyLog,
  softDeleteRemovedChildren,
  softDeleteWorkoutTemplate,
  upsertDailyLog,
  upsertWorkoutTemplate,
  WORKOUT_DELETE_SQL,
  WORKOUT_ITEMS_CASCADE_SQL,
  WORKOUT_ITEM_UPSERT_SQL,
  WORKOUT_SET_UPSERT_SQL,
  WORKOUT_UPSERT_SQL,
} from "./adapter.sql.js";

/**
 * Async SQLite-side adapter for the Fizruk dual-write layer.
 *
 * Stage 12 PR #070f-dualwrite. Migrated onto `@sergeant/dualwrite-core` in
 * ADR-0073 крок 4: the op-loop is now `createApplyOps` (best-effort —
 * aligned with every other pipeline in Open Question #1,
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
 * - Sync-v2 outbox bridge: registry tables (`fizruk_workouts`,
 *   `fizruk_workout_items`, `fizruk_workout_sets`, `fizruk_custom_exercises`,
 *   `fizruk_measurements`) fire `enqueueOutboxUpsert` after each local write
 *   (fire-and-forget; failures are swallowed per R2).
 */

export type { ApplyDualWriteOptions, ApplyDualWriteResult, DualWriteLogger };

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    webLogger.warn(`[fizruk.dualWrite] ${message}`, meta ?? {});
  }
};

const applyOps = createApplyOps<FizrukDualWriteOp>({
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
      const e = op.entry;
      fireSyncOutboxUpsert(client, {
        userId: rt.userId,
        table: "fizruk_daily_log",
        op: "insert",
        clientTs: rt.clientTs,
        row: {
          id: e.id,
          user_id: rt.userId,
          entry_at: e.at,
          weight_kg: e.weightKg,
          sleep_hours: e.sleepHours,
          energy_level: e.energyLevel,
          mood: e.mood,
          note: e.note ?? "",
          created_at: rt.clientTs,
        },
      });
      return "applied";
    },
    "daily-log-delete": async (client, op, rt) => {
      await softDeleteDailyLog(client, op.entryId, rt);
      fireSyncOutboxUpsert(client, {
        userId: rt.userId,
        table: "fizruk_daily_log",
        op: "delete",
        clientTs: rt.clientTs,
        row: { id: op.entryId, user_id: rt.userId },
      });
      return "applied";
    },
    "monthly-plan-set": async (client, op, rt) => {
      await setMonthlyPlan(client, op.monthlyPlan, rt);
      fireSyncOutboxUpsert(client, {
        userId: rt.userId,
        table: "fizruk_monthly_plan",
        op: "insert",
        clientTs: rt.clientTs,
        row: {
          user_id: rt.userId,
          data_json: op.monthlyPlan.dataJson ?? "{}",
        },
      });
      return "applied";
    },
    "workout-template-upsert": async (client, op, rt) => {
      await upsertWorkoutTemplate(client, op.template, rt);
      const t = op.template;
      fireSyncOutboxUpsert(client, {
        userId: rt.userId,
        table: "fizruk_workout_templates",
        op: "insert",
        clientTs: rt.clientTs,
        row: {
          id: t.id,
          user_id: rt.userId,
          name: t.name ?? "",
          exercise_ids_json: JSON.stringify(t.exerciseIds ?? []),
          groups_json: JSON.stringify(t.groups ?? []),
          last_used_at: t.lastUsedAt ?? null,
          created_at: rt.clientTs,
        },
      });
      return "applied";
    },
    "workout-template-delete": async (client, op, rt) => {
      await softDeleteWorkoutTemplate(client, op.templateId, rt);
      fireSyncOutboxUpsert(client, {
        userId: rt.userId,
        table: "fizruk_workout_templates",
        op: "delete",
        clientTs: rt.clientTs,
        row: { id: op.templateId, user_id: rt.userId },
      });
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
// Shared type for sets inside workout items.
// -----------------------------------------------------------------------

export type WorkoutSet = {
  weightKg: number;
  reps: number;
  rpe?: number | null;
  [k: string]: unknown;
};

// -----------------------------------------------------------------------
// Workouts (parent + items + sets)
// -----------------------------------------------------------------------

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

  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_workouts",
    op: "insert",
    row: {
      id: w.id,
      user_id: userId,
      started_at: w.startedAt,
      ended_at: w.endedAt ?? null,
      note: w.note ?? "",
      groups_json: groupsJson,
      warmup_json: warmupJson,
      cooldown_json: cooldownJson,
      wellbeing_json: wellbeingJson,
      created_at: clientTs,
      deleted_at: null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});

  const items = w.items ?? [];
  for (const [i, item] of items.entries()) {
    await upsertWorkoutItem(client, item, w.id, userId, clientTs, i);
  }

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

  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_workout_items",
    op: "insert",
    row: {
      id: item.id,
      user_id: userId,
      workout_id: workoutId,
      exercise_id: item.exerciseId ?? "",
      name_uk: item.nameUk ?? "",
      primary_group: item.primaryGroup ?? "",
      muscles_primary: musclesPrimary,
      muscles_secondary: musclesSecondary,
      type: item.type ?? "strength",
      duration_sec: item.durationSec ?? null,
      distance_m: item.distanceM ?? null,
      sort_order: sortOrder,
      created_at: clientTs,
      deleted_at: null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});

  const sets = item.sets ?? [];
  for (const [s, set] of sets.entries()) {
    const setId = `${item.id}:s${s}`;
    await upsertWorkoutSet(client, setId, item.id, userId, clientTs, set, s);
  }

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

  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_workout_sets",
    op: "insert",
    row: {
      id: setId,
      user_id: userId,
      workout_item_id: workoutItemId,
      weight_kg: set.weightKg ?? 0,
      reps: set.reps ?? 0,
      rpe: set.rpe ?? null,
      sort_order: sortOrder,
      created_at: clientTs,
      deleted_at: null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

async function softDeleteWorkout(
  client: SqliteMigrationClient,
  workoutId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  // Collect item/set IDs before cascade so we can enqueue their deletes.
  const cascadeItemRows = await client.all<{ id: string }>(
    `SELECT id FROM fizruk_workout_items
     WHERE workout_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [workoutId, userId],
  );
  const itemIds = cascadeItemRows.map((r) => r.id);

  let cascadeSetIds: string[] = [];
  if (itemIds.length > 0) {
    const placeholders = itemIds.map(() => "?").join(",");
    const cascadeSetRows = await client.all<{ id: string }>(
      `SELECT id FROM fizruk_workout_sets
       WHERE workout_item_id IN (${placeholders})
         AND user_id = ? AND deleted_at IS NULL`,
      [...itemIds, userId],
    );
    cascadeSetIds = cascadeSetRows.map((r) => r.id);
  }

  // Soft-delete the workout itself.
  await client.run(WORKOUT_DELETE_SQL, [
    clientTs,
    clientTs,
    workoutId,
    userId,
    clientTs,
  ]);
  // Cascade soft-delete to items and sets.
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

  // Enqueue deletes for the workout and all its cascaded children.
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_workouts",
    op: "delete",
    row: { id: workoutId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});

  for (const itemId of itemIds) {
    void enqueueOutboxUpsert(client, {
      userId,
      table: "fizruk_workout_items",
      op: "delete",
      row: { id: itemId, user_id: userId },
      clientTs,
      idempotencyKey: crypto.randomUUID(),
    }).catch(() => {});
  }

  for (const setId of cascadeSetIds) {
    void enqueueOutboxUpsert(client, {
      userId,
      table: "fizruk_workout_sets",
      op: "delete",
      row: { id: setId, user_id: userId },
      clientTs,
      idempotencyKey: crypto.randomUUID(),
    }).catch(() => {});
  }
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
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_custom_exercises",
    op: "insert",
    row: {
      id: exercise.id,
      user_id: userId,
      data_json: dataJson,
      created_at: clientTs,
      deleted_at: null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
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
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_custom_exercises",
    op: "delete",
    row: { id: exerciseId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
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
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_measurements",
    op: "insert",
    row: {
      id: m.id,
      user_id: userId,
      measured_at: m.at,
      weight_kg: m["weightKg"] ?? null,
      waist_cm: m["waistCm"] ?? null,
      chest_cm: m["chestCm"] ?? null,
      hips_cm: m["hipsCm"] ?? null,
      bicep_cm: m["bicepCm"] ?? null,
      sleep_hours: m["sleepHours"] ?? null,
      energy_level: m["energyLevel"] ?? null,
      mood: m["mood"] ?? null,
      created_at: clientTs,
      deleted_at: null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
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
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_measurements",
    op: "delete",
    row: { id: measurementId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}
