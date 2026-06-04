import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  FizrukItemSnapshot,
  FizrukWorkoutSnapshot,
} from "./diff";

// -----------------------------------------------------------------------
// Workout upsert / soft-delete (includes items, sets, and child cleanup)
// -----------------------------------------------------------------------

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

  const items = w.items ?? [];
  for (let i = 0; i < items.length; i++) {
    await upsertWorkoutItem(client, items[i]!, w.id, userId, clientTs, i);
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

  const sets = item.sets ?? [];
  for (let s = 0; s < sets.length; s++) {
    const setId = `${item.id}:s${s}`;
    await upsertWorkoutSet(
      client,
      setId,
      item.id,
      userId,
      clientTs,
      sets[s]!,
      s,
    );
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

export async function softDeleteWorkout(
  client: SqliteMigrationClient,
  workoutId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_workouts
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, workoutId, userId, clientTs],
  );
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
// Child-row cleanup (used only within this family)
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
    await client.run(
      `UPDATE ${tableName}
          SET deleted_at = ?, updated_at = ?
        WHERE ${parentCol} = ? AND user_id = ? AND deleted_at IS NULL`,
      [clientTs, clientTs, parentId, userId],
    );
    return;
  }
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
