import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../http/schemas.js";
import {
  parseOptionalDate,
  parseRequiredDate,
  parseOptionalNumber,
  parseOptionalInt,
  toNonNegativeInt,
  toJsonbParam,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

export async function applyFizrukWorkouts(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_workouts WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_workouts
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const startedAt = parseRequiredDate(row["started_at"]);
  if (startedAt === "invalid") {
    return { status: "rejected", reason: "invalid_started_at" };
  }
  const endedAt = parseOptionalDate(row["ended_at"]);
  if (endedAt === "invalid") {
    return { status: "rejected", reason: "invalid_ended_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  const note = typeof row["note"] === "string" ? row["note"] : "";

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_workouts
         (id, user_id, started_at, ended_at, note,
          groups_json, warmup_json, cooldown_json, wellbeing_json,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5,
               COALESCE($6::jsonb, '[]'::jsonb), $7, $8, $9,
               $10, $11, $12)`,
      [
        id,
        userId,
        startedAt,
        endedAt ?? null,
        note,
        toJsonbParam(row["groups_json"]),
        toJsonbParam(row["warmup_json"]),
        toJsonbParam(row["cooldown_json"]),
        toJsonbParam(row["wellbeing_json"]),
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_workouts
         SET started_at      = $1,
             ended_at        = $2,
             note            = $3,
             groups_json     = COALESCE($4::jsonb, '[]'::jsonb),
             warmup_json     = $5,
             cooldown_json   = $6,
             wellbeing_json  = $7,
             updated_at      = $8,
             deleted_at      = $9
       WHERE id = $10 AND user_id = $11`,
      [
        startedAt,
        endedAt ?? null,
        note,
        toJsonbParam(row["groups_json"]),
        toJsonbParam(row["warmup_json"]),
        toJsonbParam(row["cooldown_json"]),
        toJsonbParam(row["wellbeing_json"]),
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

export async function applyFizrukItems(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_workout_items WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_workout_items
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const workoutId =
    typeof row["workout_id"] === "string" ? row["workout_id"] : null;
  if (!workoutId) {
    return { status: "rejected", reason: "missing_workout_id" };
  }
  const exerciseId =
    typeof row["exercise_id"] === "string" ? row["exercise_id"] : null;
  if (!exerciseId) {
    return { status: "rejected", reason: "missing_exercise_id" };
  }
  const nameUk = typeof row["name_uk"] === "string" ? row["name_uk"] : null;
  if (nameUk === null) {
    return { status: "rejected", reason: "missing_name_uk" };
  }
  const primaryGroup =
    typeof row["primary_group"] === "string" ? row["primary_group"] : "";
  const type = typeof row["type"] === "string" ? row["type"] : "strength";
  const sortOrder = toNonNegativeInt(row["sort_order"]) ?? 0;
  const durationSec = parseOptionalInt(row["duration_sec"]);
  if (durationSec === "invalid") {
    return { status: "rejected", reason: "invalid_duration_sec" };
  }
  const distanceM = parseOptionalInt(row["distance_m"]);
  if (distanceM === "invalid") {
    return { status: "rejected", reason: "invalid_distance_m" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_workout_items
         (id, workout_id, user_id, exercise_id, name_uk, primary_group,
          muscles_primary, muscles_secondary, type,
          duration_sec, distance_m, sort_order,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               COALESCE($7::jsonb, '[]'::jsonb),
               COALESCE($8::jsonb, '[]'::jsonb),
               $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        workoutId,
        userId,
        exerciseId,
        nameUk,
        primaryGroup,
        toJsonbParam(row["muscles_primary"]),
        toJsonbParam(row["muscles_secondary"]),
        type,
        durationSec ?? null,
        distanceM ?? null,
        sortOrder,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_workout_items
         SET workout_id        = $1,
             exercise_id       = $2,
             name_uk           = $3,
             primary_group     = $4,
             muscles_primary   = COALESCE($5::jsonb, '[]'::jsonb),
             muscles_secondary = COALESCE($6::jsonb, '[]'::jsonb),
             type              = $7,
             duration_sec      = $8,
             distance_m        = $9,
             sort_order        = $10,
             updated_at        = $11,
             deleted_at        = $12
       WHERE id = $13 AND user_id = $14`,
      [
        workoutId,
        exerciseId,
        nameUk,
        primaryGroup,
        toJsonbParam(row["muscles_primary"]),
        toJsonbParam(row["muscles_secondary"]),
        type,
        durationSec ?? null,
        distanceM ?? null,
        sortOrder,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

export async function applyFizrukSets(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_workout_sets WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_workout_sets
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const workoutItemId =
    typeof row["workout_item_id"] === "string" ? row["workout_item_id"] : null;
  if (!workoutItemId) {
    return { status: "rejected", reason: "missing_workout_item_id" };
  }
  const weightKg = parseOptionalNumber(row["weight_kg"]);
  if (weightKg === "invalid") {
    return { status: "rejected", reason: "invalid_weight_kg" };
  }
  const reps = parseOptionalInt(row["reps"]);
  if (reps === "invalid") {
    return { status: "rejected", reason: "invalid_reps" };
  }
  const rpe = parseOptionalNumber(row["rpe"]);
  if (rpe === "invalid") {
    return { status: "rejected", reason: "invalid_rpe" };
  }
  const sortOrder = toNonNegativeInt(row["sort_order"]) ?? 0;
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_workout_sets
         (id, workout_item_id, user_id, weight_kg, reps, rpe,
          sort_order, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        workoutItemId,
        userId,
        weightKg ?? 0,
        reps ?? 0,
        rpe ?? null,
        sortOrder,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_workout_sets
         SET workout_item_id = $1,
             weight_kg       = $2,
             reps            = $3,
             rpe             = $4,
             sort_order      = $5,
             updated_at      = $6,
             deleted_at      = $7
       WHERE id = $8 AND user_id = $9`,
      [
        workoutItemId,
        weightKg ?? 0,
        reps ?? 0,
        rpe ?? null,
        sortOrder,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

export async function applyFizrukCustomExercises(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_custom_exercises WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_custom_exercises
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const dataJson = toJsonbParam(row["data_json"]);
  if (dataJson === null) {
    return { status: "rejected", reason: "missing_data_json" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_custom_exercises
         (id, user_id, data_json, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [
        id,
        userId,
        dataJson,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_custom_exercises
         SET data_json  = $1::jsonb,
             updated_at = $2,
             deleted_at = $3
       WHERE id = $4 AND user_id = $5`,
      [dataJson, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

export async function applyFizrukMeasurements(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM fizruk_measurements WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE fizruk_measurements
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const measuredAt = parseRequiredDate(row["measured_at"]);
  if (measuredAt === "invalid") {
    return { status: "rejected", reason: "invalid_measured_at" };
  }
  const weightKg = parseOptionalNumber(row["weight_kg"]);
  if (weightKg === "invalid") {
    return { status: "rejected", reason: "invalid_weight_kg" };
  }
  const waistCm = parseOptionalNumber(row["waist_cm"]);
  if (waistCm === "invalid") {
    return { status: "rejected", reason: "invalid_waist_cm" };
  }
  const chestCm = parseOptionalNumber(row["chest_cm"]);
  if (chestCm === "invalid") {
    return { status: "rejected", reason: "invalid_chest_cm" };
  }
  const hipsCm = parseOptionalNumber(row["hips_cm"]);
  if (hipsCm === "invalid") {
    return { status: "rejected", reason: "invalid_hips_cm" };
  }
  const bicepCm = parseOptionalNumber(row["bicep_cm"]);
  if (bicepCm === "invalid") {
    return { status: "rejected", reason: "invalid_bicep_cm" };
  }
  const sleepHours = parseOptionalNumber(row["sleep_hours"]);
  if (sleepHours === "invalid") {
    return { status: "rejected", reason: "invalid_sleep_hours" };
  }
  const energyLevel = parseOptionalInt(row["energy_level"]);
  if (energyLevel === "invalid") {
    return { status: "rejected", reason: "invalid_energy_level" };
  }
  const mood = parseOptionalInt(row["mood"]);
  if (mood === "invalid") {
    return { status: "rejected", reason: "invalid_mood" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO fizruk_measurements
         (id, user_id, measured_at, weight_kg, waist_cm, chest_cm,
          hips_cm, bicep_cm, sleep_hours, energy_level, mood,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14)`,
      [
        id,
        userId,
        measuredAt,
        weightKg ?? null,
        waistCm ?? null,
        chestCm ?? null,
        hipsCm ?? null,
        bicepCm ?? null,
        sleepHours ?? null,
        energyLevel ?? null,
        mood ?? null,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_measurements
         SET measured_at  = $1,
             weight_kg    = $2,
             waist_cm     = $3,
             chest_cm     = $4,
             hips_cm      = $5,
             bicep_cm     = $6,
             sleep_hours  = $7,
             energy_level = $8,
             mood         = $9,
             updated_at   = $10,
             deleted_at   = $11
       WHERE id = $12 AND user_id = $13`,
      [
        measuredAt,
        weightKg ?? null,
        waistCm ?? null,
        chestCm ?? null,
        hipsCm ?? null,
        bicepCm ?? null,
        sleepHours ?? null,
        energyLevel ?? null,
        mood ?? null,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}