import {
  buildLwwUpsert,
  buildReconcileChildren,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "@/core/syncEngine/enqueueOutboxUpsert";
import type { FizrukItemSnapshot, FizrukWorkoutSnapshot } from "./diff";

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

const WORKOUT_UPSERT_SQL = buildLwwUpsert(WORKOUT_UPSERT_SPEC);
const WORKOUT_ITEM_UPSERT_SQL = buildLwwUpsert(WORKOUT_ITEM_UPSERT_SPEC);
const WORKOUT_SET_UPSERT_SQL = buildLwwUpsert(WORKOUT_SET_UPSERT_SPEC);

// Cascade soft-delete of items/sets when a whole workout is deleted — these
// WHERE shapes (`deleted_at IS NULL`, no LWW guard) match the reconcile
// keepCount-0 branch, so reuse that builder.
const WORKOUT_ITEMS_CASCADE_SQL = buildReconcileChildren(
  { table: "fizruk_workout_items", parentColumn: "workout_id" },
  0,
);

// -----------------------------------------------------------------------
// Workout upsert / soft-delete (includes items, sets, and child cleanup)
// -----------------------------------------------------------------------

export async function upsertWorkout(
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

export async function softDeleteWorkout(
  client: SqliteMigrationClient,
  workoutId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  // Pre-query cascaded children so we can enqueue their deletes after
  // the SQL runs — mirrors the web version's pre-cascade collect.
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

  await client.run(
    `UPDATE fizruk_workouts
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, workoutId, userId, clientTs],
  );
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
