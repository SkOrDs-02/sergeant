import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import type { AppliedStatus } from "../syncV2-types.js";
import {
  assertRowUserId,
  guardUuidPkApply,
  guardUserPkLww,
  queryOne,
  type ExistingUuidRow,
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalNumber,
  parseRequiredDate,
  readJsonbField,
  softDeleteById,
} from "../applySync-helpers.js";

export async function applyFizrukDailyLog(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM fizruk_daily_log WHERE id = $1`,
    [id],
  );
  const guard = guardUuidPkApply(existing, userId, clientTs, op);
  if (guard) return guard;

  if (op.op === "delete") {
    return softDeleteById(
      client,
      "fizruk_daily_log",
      id,
      userId,
      clientTs,
      existing,
    );
  }

  const entryAt = parseRequiredDate(row["entry_at"]);
  if (entryAt === "invalid") {
    return { status: "rejected", reason: "invalid_entry_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }
  const weightKg = parseOptionalNumber(row["weight_kg"]);
  if (weightKg === "invalid") {
    return { status: "rejected", reason: "invalid_weight_kg" };
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
  const note = typeof row["note"] === "string" ? row["note"] : "";

  if (!existing) {
    await client.query(
      `INSERT INTO fizruk_daily_log
         (id, user_id, entry_at, weight_kg, sleep_hours, energy_level, mood,
          note, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        userId,
        entryAt,
        weightKg,
        sleepHours,
        energyLevel,
        mood,
        note,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_daily_log
         SET entry_at = $1, weight_kg = $2, sleep_hours = $3,
             energy_level = $4, mood = $5, note = $6,
             updated_at = $7, deleted_at = $8
       WHERE id = $9 AND user_id = $10`,
      [
        entryAt,
        weightKg,
        sleepHours,
        energyLevel,
        mood,
        note,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

export async function applyFizrukMonthlyPlan(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const existing = await queryOne<{ user_id: string; updated_at: Date }>(
    client,
    `SELECT user_id, updated_at FROM fizruk_monthly_plan WHERE user_id = $1`,
    [userId],
  );
  const guard = guardUserPkLww(existing, clientTs);
  if (guard) return guard;

  const dataJson = readJsonbField(row, "data", "data_json");
  await client.query(
    `INSERT INTO fizruk_monthly_plan (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, dataJson, clientTs],
  );
  return { status: "applied" };
}

export async function applyFizrukPlanTemplates(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const existing = await queryOne<{ user_id: string; updated_at: Date }>(
    client,
    `SELECT user_id, updated_at FROM fizruk_plan_templates WHERE user_id = $1`,
    [userId],
  );
  const guard = guardUserPkLww(existing, clientTs);
  if (guard) return guard;

  const dataJson = readJsonbField(row, "data", "data_json");
  await client.query(
    `INSERT INTO fizruk_plan_templates (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, dataJson === "null" ? null : dataJson, clientTs],
  );
  return { status: "applied" };
}

export async function applyFizrukPrograms(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const existing = await queryOne<{ user_id: string; updated_at: Date }>(
    client,
    `SELECT user_id, updated_at FROM fizruk_programs WHERE user_id = $1`,
    [userId],
  );
  const guard = guardUserPkLww(existing, clientTs);
  if (guard) return guard;

  const activeProgramId =
    typeof row["active_program_id"] === "string"
      ? row["active_program_id"]
      : null;

  await client.query(
    `INSERT INTO fizruk_programs (user_id, active_program_id, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET active_program_id = EXCLUDED.active_program_id,
           updated_at = EXCLUDED.updated_at`,
    [userId, activeProgramId, clientTs],
  );
  return { status: "applied" };
}

export async function applyFizrukWellbeing(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const dateKey = typeof row["date_key"] === "string" ? row["date_key"] : null;
  if (!dateKey) return { status: "rejected", reason: "missing_date_key" };

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM fizruk_wellbeing WHERE user_id = $1 AND date_key = $2`,
    [userId, dateKey],
  );
  if (existing) {
    if (existing.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    if (existing.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (!existing) return { status: "rejected", reason: "not_found" };
    await client.query(
      `UPDATE fizruk_wellbeing
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND date_key = $3`,
      [clientTs, userId, dateKey],
    );
    return { status: "applied" };
  }

  const mood = parseOptionalInt(row["mood"]);
  if (mood === "invalid") return { status: "rejected", reason: "invalid_mood" };
  const energy = parseOptionalInt(row["energy"]);
  if (energy === "invalid") {
    return { status: "rejected", reason: "invalid_energy" };
  }
  const sleepQuality = parseOptionalInt(row["sleep_quality"]);
  if (sleepQuality === "invalid") {
    return { status: "rejected", reason: "invalid_sleep_quality" };
  }
  const sleepHours = parseOptionalNumber(row["sleep_hours"]);
  if (sleepHours === "invalid") {
    return { status: "rejected", reason: "invalid_sleep_hours" };
  }
  const notes = typeof row["notes"] === "string" ? row["notes"] : "";
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }

  await client.query(
    `INSERT INTO fizruk_wellbeing
       (user_id, date_key, mood, energy, sleep_quality, sleep_hours, notes,
        created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
     ON CONFLICT (user_id, date_key) DO UPDATE
       SET mood = EXCLUDED.mood,
           energy = EXCLUDED.energy,
           sleep_quality = EXCLUDED.sleep_quality,
           sleep_hours = EXCLUDED.sleep_hours,
           notes = EXCLUDED.notes,
           updated_at = EXCLUDED.updated_at,
           deleted_at = NULL`,
    [
      userId,
      dateKey,
      mood,
      energy,
      sleepQuality,
      sleepHours,
      notes,
      createdAt ?? clientTs,
      clientTs,
    ],
  );
  return { status: "applied" };
}

export async function applyFizrukWorkoutTemplates(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM fizruk_workout_templates WHERE id = $1`,
    [id],
  );
  const guard = guardUuidPkApply(existing, userId, clientTs, op);
  if (guard) return guard;

  if (op.op === "delete") {
    return softDeleteById(
      client,
      "fizruk_workout_templates",
      id,
      userId,
      clientTs,
      existing,
    );
  }

  const name = typeof row["name"] === "string" ? row["name"] : null;
  if (!name) return { status: "rejected", reason: "missing_name" };

  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }
  const lastUsedAt = parseOptionalDate(row["last_used_at"]);
  if (lastUsedAt === "invalid") {
    return { status: "rejected", reason: "invalid_last_used_at" };
  }
  const exerciseIds = readJsonbField(
    row,
    "exercise_ids",
    "exercise_ids_json",
    "[]",
  );
  const groups = readJsonbField(row, "groups", "groups_json", "[]");

  if (!existing) {
    await client.query(
      `INSERT INTO fizruk_workout_templates
         (id, user_id, name, exercise_ids, groups, last_used_at,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`,
      [
        id,
        userId,
        name,
        exerciseIds,
        groups,
        lastUsedAt,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_workout_templates
         SET name = $1, exercise_ids = $2::jsonb, groups = $3::jsonb,
             last_used_at = $4, updated_at = $5, deleted_at = $6
       WHERE id = $7 AND user_id = $8`,
      [
        name,
        exerciseIds,
        groups,
        lastUsedAt,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}
