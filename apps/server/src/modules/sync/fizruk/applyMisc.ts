import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import {
  parseOptionalDate,
  parseRequiredDate,
  parseOptionalNumber,
  parseOptionalInt,
  toJsonbParam,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

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
