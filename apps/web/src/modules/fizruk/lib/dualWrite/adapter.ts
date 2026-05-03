import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  FizrukDualWriteOp,
  FizrukWorkoutSnapshot,
  FizrukItemSnapshot,
  FizrukMeasurementSnapshot,
  FizrukCustomExerciseSnapshot,
} from "./diff.js";

/**
 * Async SQLite-side adapter for the Fizruk dual-write layer.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. Takes the
 * `FizrukDualWriteOp[]` produced by `diffFizrukDualWriteOps` and
 * writes them to the local `fizruk_*` tables.
 *
 * Design notes (same as routine adapter):
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op
 *   does NOT abort the rest.
 * - Idempotent: upserts use ON CONFLICT(id) DO UPDATE with LWW guard.
 * - LWW guard: updates only apply when the incoming `clientTs` is
 *   strictly newer than the local `updated_at`.
 */

export interface ApplyDualWriteOptions {
  readonly userId: string;
  readonly clientTs: string;
  readonly logger?: DualWriteLogger;
}

export type DualWriteLogger = (
  level: "warn" | "info",
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface ApplyDualWriteResult {
  readonly applied: number;
  readonly errored: number;
  readonly skipped: number;
}

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    console.warn(`[fizruk.dualWrite] ${message}`, meta ?? {});
  }
};

export async function applyFizrukDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly FizrukDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  if (ops.length === 0) {
    return { applied: 0, errored: 0, skipped: 0 };
  }
  const logger = options.logger ?? DEFAULT_LOGGER;
  let applied = 0;
  let errored = 0;
  let skipped = 0;

  for (const op of ops) {
    try {
      const outcome = await applyOne(client, op, options);
      if (outcome === "applied") applied += 1;
      else skipped += 1;
    } catch (err) {
      errored += 1;
      logger("warn", "dual-write op failed", {
        op: op.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errored, skipped };
}

type ApplyOutcome = "applied" | "skipped";

async function applyOne(
  client: SqliteMigrationClient,
  op: FizrukDualWriteOp,
  options: ApplyDualWriteOptions,
): Promise<ApplyOutcome> {
  const { userId, clientTs } = options;
  switch (op.kind) {
    case "workout-upsert":
      await upsertWorkout(client, op.workout, userId, clientTs);
      return "applied";

    case "workout-delete":
      await softDeleteWorkout(client, op.workoutId, userId, clientTs);
      return "applied";

    case "custom-exercise-upsert":
      await upsertCustomExercise(client, op.exercise, userId, clientTs);
      return "applied";

    case "custom-exercise-delete":
      await softDeleteCustomExercise(client, op.exerciseId, userId, clientTs);
      return "applied";

    case "measurement-upsert":
      await upsertMeasurement(client, op.measurement, userId, clientTs);
      return "applied";

    case "measurement-delete":
      await softDeleteMeasurement(client, op.measurementId, userId, clientTs);
      return "applied";

    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return "skipped";
    }
  }
}

// -----------------------------------------------------------------------
// Workout upsert — writes to fizruk_workouts, fizruk_workout_items,
// fizruk_workout_sets in a single pass.
// -----------------------------------------------------------------------

async function upsertWorkout(
  client: SqliteMigrationClient,
  w: FizrukWorkoutSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  const groupsJson = JSON.stringify(w.groups ?? []);
  const warmupJson = w.warmup ? JSON.stringify(w.warmup) : null;
  const cooldownJson = w.cooldown ? JSON.stringify(w.cooldown) : null;
  const wellbeingJson = w.wellbeing ? JSON.stringify(w.wellbeing) : null;

  await client.run(
    `INSERT INTO fizruk_workouts
       (id, user_id, started_at, ended_at, note, groups_json,
        warmup_json, cooldown_json, wellbeing_json,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       started_at     = excluded.started_at,
       ended_at       = excluded.ended_at,
       note           = excluded.note,
       groups_json    = excluded.groups_json,
       warmup_json    = excluded.warmup_json,
       cooldown_json  = excluded.cooldown_json,
       wellbeing_json = excluded.wellbeing_json,
       updated_at     = excluded.updated_at,
       deleted_at     = NULL
     WHERE excluded.updated_at > fizruk_workouts.updated_at`,
    [
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
    ],
  );

  // Upsert items
  const items = w.items ?? [];
  for (let i = 0; i < items.length; i++) {
    await upsertWorkoutItem(client, items[i], w.id, userId, clientTs, i);
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

  await client.run(
    `INSERT INTO fizruk_workout_items
       (id, workout_id, user_id, exercise_id, name_uk, primary_group,
        muscles_primary, muscles_secondary, type, duration_sec, distance_m,
        sort_order, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       workout_id        = excluded.workout_id,
       exercise_id       = excluded.exercise_id,
       name_uk           = excluded.name_uk,
       primary_group     = excluded.primary_group,
       muscles_primary   = excluded.muscles_primary,
       muscles_secondary = excluded.muscles_secondary,
       type              = excluded.type,
       duration_sec      = excluded.duration_sec,
       distance_m        = excluded.distance_m,
       sort_order        = excluded.sort_order,
       updated_at        = excluded.updated_at,
       deleted_at        = NULL
     WHERE excluded.updated_at > fizruk_workout_items.updated_at`,
    [
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
    ],
  );

  // Upsert sets
  const sets = item.sets ?? [];
  for (let s = 0; s < sets.length; s++) {
    const setId = `${item.id}:s${s}`;
    await upsertWorkoutSet(
      client,
      setId,
      item.id,
      userId,
      clientTs,
      sets[s],
      s,
    );
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
  set: {
    weightKg: number;
    reps: number;
    rpe?: number | null;
    [k: string]: unknown;
  },
  sortOrder: number,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_workout_sets
       (id, workout_item_id, user_id, weight_kg, reps, rpe,
        sort_order, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       weight_kg       = excluded.weight_kg,
       reps            = excluded.reps,
       rpe             = excluded.rpe,
       sort_order      = excluded.sort_order,
       updated_at      = excluded.updated_at,
       deleted_at      = NULL
     WHERE excluded.updated_at > fizruk_workout_sets.updated_at`,
    [
      setId,
      workoutItemId,
      userId,
      set.weightKg ?? 0,
      set.reps ?? 0,
      set.rpe ?? null,
      sortOrder,
      clientTs,
      clientTs,
    ],
  );
}

// -----------------------------------------------------------------------
// Soft-delete helpers
// -----------------------------------------------------------------------

async function softDeleteWorkout(
  client: SqliteMigrationClient,
  workoutId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  // Soft-delete the workout itself
  await client.run(
    `UPDATE fizruk_workouts
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, workoutId, userId, clientTs],
  );
  // Cascade soft-delete to items and sets
  await client.run(
    `UPDATE fizruk_workout_items
        SET deleted_at = ?, updated_at = ?
      WHERE workout_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [clientTs, clientTs, workoutId, userId],
  );
  await client.run(
    `UPDATE fizruk_workout_sets
        SET deleted_at = ?, updated_at = ?
      WHERE workout_item_id IN (
        SELECT id FROM fizruk_workout_items WHERE workout_id = ?
      ) AND user_id = ? AND deleted_at IS NULL`,
    [clientTs, clientTs, workoutId, userId],
  );
}

async function softDeleteCustomExercise(
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

async function softDeleteMeasurement(
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

// -----------------------------------------------------------------------
// Custom exercise upsert
// -----------------------------------------------------------------------

async function upsertCustomExercise(
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

// -----------------------------------------------------------------------
// Measurement upsert
// -----------------------------------------------------------------------

async function upsertMeasurement(
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
      toIntOrNull(m.weightKg),
      toIntOrNull(m.waistCm),
      toIntOrNull(m.chestCm),
      toIntOrNull(m.hipsCm),
      toIntOrNull(m.bicepCm),
      toIntOrNull(m.sleepHours),
      toIntOrNull(m.energyLevel),
      toIntOrNull(m.mood),
      clientTs,
      clientTs,
    ],
  );
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
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
  if (keepIds.length === 0) {
    // Delete all children of this parent.
    await client.run(
      `UPDATE ${tableName}
          SET deleted_at = ?, updated_at = ?
        WHERE ${parentCol} = ? AND user_id = ? AND deleted_at IS NULL`,
      [clientTs, clientTs, parentId, userId],
    );
    return;
  }
  // SQLite doesn't support array params, so we build a placeholder list.
  const placeholders = keepIds.map(() => "?").join(",");
  await client.run(
    `UPDATE ${tableName}
        SET deleted_at = ?, updated_at = ?
      WHERE ${parentCol} = ?
        AND user_id = ?
        AND deleted_at IS NULL
        AND id NOT IN (${placeholders})`,
    [clientTs, clientTs, parentId, userId, ...keepIds],
  );
}
