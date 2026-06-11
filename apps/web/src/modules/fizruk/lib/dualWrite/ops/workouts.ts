/**
 * Last validated: 2026-06-11
 * Status: Active
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type {
  FizrukWorkoutSnapshot,
  FizrukItemSnapshot,
} from "../diff/index.js";

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
export async function upsertWorkout(
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

export async function upsertWorkoutItem(
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

export async function upsertWorkoutSet(
  client: SqliteMigrationClient,
  setId: string,
  workoutItemId: string,
  userId: string,
  clientTs: string,
  set: WorkoutSet,
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
// Soft-delete operations
// -----------------------------------------------------------------------

export async function softDeleteWorkout(
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