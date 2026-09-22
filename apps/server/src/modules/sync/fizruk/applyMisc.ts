import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import { MEASUREMENT_BOUNDS, type MeasurementBound } from "@sergeant/shared";

import {
  parseOptionalDate,
  parseRequiredDate,
  parseOptionalBoundedNumber,
  parseOptionalBoundedInt,
  toJsonbParam,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

/**
 * Готові запити для таблиць-JSON-блобів. Тексти зібрані наперед, а не
 * інтерполяцією імені таблиці в `client.query`: динамічний SQL у цьому
 * репо заборонений лінтом (M11), і правило слушне навіть тут, де значення
 * приходить із двох літералів - варіант з інтерполяцією виглядав би точно
 * так само в той день, коли ім'я почне приходити ззовні.
 */
const JSON_BLOB_SQL = {
  fizruk_custom_exercises: {
    select:
      "SELECT user_id, updated_at, deleted_at FROM fizruk_custom_exercises WHERE id = $1",
    softDelete:
      "UPDATE fizruk_custom_exercises SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3",
    insert:
      "INSERT INTO fizruk_custom_exercises (id, user_id, data_json, created_at, updated_at, deleted_at) VALUES ($1, $2, $3::jsonb, $4, $5, $6)",
    update:
      "UPDATE fizruk_custom_exercises SET data_json = $1::jsonb, updated_at = $2, deleted_at = $3 WHERE id = $4 AND user_id = $5",
  },
  fizruk_custom_activities: {
    select:
      "SELECT user_id, updated_at, deleted_at FROM fizruk_custom_activities WHERE id = $1",
    softDelete:
      "UPDATE fizruk_custom_activities SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3",
    insert:
      "INSERT INTO fizruk_custom_activities (id, user_id, data_json, created_at, updated_at, deleted_at) VALUES ($1, $2, $3::jsonb, $4, $5, $6)",
    update:
      "UPDATE fizruk_custom_activities SET data_json = $1::jsonb, updated_at = $2, deleted_at = $3 WHERE id = $4 AND user_id = $5",
  },
} as const;

/**
 * Апплай рядка-JSON-блоба: `fizruk_custom_exercises` і
 * `fizruk_custom_activities` мають однакову форму (id + user_id +
 * data_json + мітки), тож логіка LWW у них буквально та сама.
 */
async function applyFizrukJsonBlobRow(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
  table: keyof typeof JSON_BLOB_SQL,
): Promise<AppliedStatus> {
  const sql = JSON_BLOB_SQL[table];
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
  }>(sql.select, [id]);
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(sql.softDelete, [clientTs, id, userId]);
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
    await client.query(sql.insert, [
      id,
      userId,
      dataJson,
      createdAt ?? clientTs,
      clientTs,
      deletedAt ?? null,
    ]);
  } else {
    await client.query(sql.update, [
      dataJson,
      clientTs,
      deletedAt ?? null,
      id,
      userId,
    ]);
  }
  return { status: "applied" };
}

export async function applyFizrukCustomExercises(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFizrukJsonBlobRow(
    client,
    op,
    userId,
    clientTs,
    "fizruk_custom_exercises",
  );
}

/** Свої заняття для короткого запису - та сама форма, що й свої вправи. */
export async function applyFizrukCustomActivities(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFizrukJsonBlobRow(
    client,
    op,
    userId,
    clientTs,
    "fizruk_custom_activities",
  );
}

/**
 * Числові колонки `fizruk_measurements` і межі, за якими їх санітарить
 * sync-апплаєр. Ключ — імʼя КОЛОНКИ (snake_case), бо саме його несе
 * `op.row`; межі приходять із канонічного `MEASUREMENT_BOUNDS`
 * (`@sergeant/shared`), спільного з клієнтською формою.
 *
 * Причина відмови будується як `invalid_${column}`, тож імена колонок тут
 * є частиною контракту відмов (`invalid_weight_kg`, `invalid_bicep_cm`, …)
 * — перейменування колонки змінює і код відмови.
 *
 * Додаєш поле — додай межі в `MEASUREMENT_BOUNDS`, колонку в міграцію,
 * рядок сюди І параметр у два SQL-літерали нижче. Літерали навмисно
 * виписані повністю: динамічний SQL заборонений лінтом (M11, див.
 * коментар до `JSON_BLOB_SQL` вище), а підстановка значень по імені
 * (`num["neck_cm"]`) не дає параметрам тихо зсунутись.
 */
const MEASUREMENT_COLUMN_BOUNDS = {
  weight_kg: MEASUREMENT_BOUNDS.weightKg,
  body_fat_pct: MEASUREMENT_BOUNDS.bodyFatPct,
  neck_cm: MEASUREMENT_BOUNDS.neckCm,
  waist_cm: MEASUREMENT_BOUNDS.waistCm,
  chest_cm: MEASUREMENT_BOUNDS.chestCm,
  hips_cm: MEASUREMENT_BOUNDS.hipsCm,
  bicep_cm: MEASUREMENT_BOUNDS.bicepCm,
  bicep_l_cm: MEASUREMENT_BOUNDS.bicepLCm,
  bicep_r_cm: MEASUREMENT_BOUNDS.bicepRCm,
  forearm_l_cm: MEASUREMENT_BOUNDS.forearmLCm,
  forearm_r_cm: MEASUREMENT_BOUNDS.forearmRCm,
  thigh_l_cm: MEASUREMENT_BOUNDS.thighLCm,
  thigh_r_cm: MEASUREMENT_BOUNDS.thighRCm,
  calf_l_cm: MEASUREMENT_BOUNDS.calfLCm,
  calf_r_cm: MEASUREMENT_BOUNDS.calfRCm,
  sleep_hours: MEASUREMENT_BOUNDS.sleepHours,
  energy_level: MEASUREMENT_BOUNDS.energyLevel,
  mood: MEASUREMENT_BOUNDS.mood,
} as const satisfies Record<string, MeasurementBound>;

/**
 * Імена колонок як ЛІТЕРАЛЬНИЙ union — з нього будується `invalid_${column}`,
 * тож причини відмови лишаються в закритому union-і `AppliedStatus`
 * (`syncV2-types.ts`), а не розпливаються в `invalid_${string}`.
 */
export const MEASUREMENT_COLUMN_NAMES = Object.keys(
  MEASUREMENT_COLUMN_BOUNDS,
) as (keyof typeof MEASUREMENT_COLUMN_BOUNDS)[];

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
  // Порядок і межі — з `MEASUREMENT_COLUMN_BOUNDS`; нижче значення
  // підставляються в SQL ПО ІМЕНІ, тож розширення набору не може тихо
  // зсунути параметри. Причини відмови лишились ті самі
  // (`invalid_weight_kg`, `invalid_bicep_cm`, …).
  const num: Record<string, number | null> = {};
  for (const column of MEASUREMENT_COLUMN_NAMES) {
    // Аннотація потрібна, щоб `.integer` був видимий: `as const` звужує
    // кожен літерал і в тих, де прапорця немає, поля теж немає.
    const bound: MeasurementBound = MEASUREMENT_COLUMN_BOUNDS[column];
    const parsed = bound.integer
      ? parseOptionalBoundedInt(row[column], bound)
      : parseOptionalBoundedNumber(row[column], bound);
    if (parsed === "invalid") {
      return { status: "rejected", reason: `invalid_${column}` };
    }
    num[column] = parsed ?? null;
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
         (id, user_id, measured_at, weight_kg, body_fat_pct, neck_cm,
          waist_cm, chest_cm, hips_cm, bicep_cm, bicep_l_cm, bicep_r_cm,
          forearm_l_cm, forearm_r_cm, thigh_l_cm, thigh_r_cm,
          calf_l_cm, calf_r_cm, sleep_hours, energy_level, mood,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16, $17, $18, $19, $20, $21,
               $22, $23, $24)`,
      [
        id,
        userId,
        measuredAt,
        num["weight_kg"] ?? null,
        num["body_fat_pct"] ?? null,
        num["neck_cm"] ?? null,
        num["waist_cm"] ?? null,
        num["chest_cm"] ?? null,
        num["hips_cm"] ?? null,
        num["bicep_cm"] ?? null,
        num["bicep_l_cm"] ?? null,
        num["bicep_r_cm"] ?? null,
        num["forearm_l_cm"] ?? null,
        num["forearm_r_cm"] ?? null,
        num["thigh_l_cm"] ?? null,
        num["thigh_r_cm"] ?? null,
        num["calf_l_cm"] ?? null,
        num["calf_r_cm"] ?? null,
        num["sleep_hours"] ?? null,
        num["energy_level"] ?? null,
        num["mood"] ?? null,
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
             body_fat_pct = $3,
             neck_cm      = $4,
             waist_cm     = $5,
             chest_cm     = $6,
             hips_cm      = $7,
             bicep_cm     = $8,
             bicep_l_cm   = $9,
             bicep_r_cm   = $10,
             forearm_l_cm = $11,
             forearm_r_cm = $12,
             thigh_l_cm   = $13,
             thigh_r_cm   = $14,
             calf_l_cm    = $15,
             calf_r_cm    = $16,
             sleep_hours  = $17,
             energy_level = $18,
             mood         = $19,
             updated_at   = $20,
             deleted_at   = $21
       WHERE id = $22 AND user_id = $23`,
      [
        measuredAt,
        num["weight_kg"] ?? null,
        num["body_fat_pct"] ?? null,
        num["neck_cm"] ?? null,
        num["waist_cm"] ?? null,
        num["chest_cm"] ?? null,
        num["hips_cm"] ?? null,
        num["bicep_cm"] ?? null,
        num["bicep_l_cm"] ?? null,
        num["bicep_r_cm"] ?? null,
        num["forearm_l_cm"] ?? null,
        num["forearm_r_cm"] ?? null,
        num["thigh_l_cm"] ?? null,
        num["thigh_r_cm"] ?? null,
        num["calf_l_cm"] ?? null,
        num["calf_r_cm"] ?? null,
        num["sleep_hours"] ?? null,
        num["energy_level"] ?? null,
        num["mood"] ?? null,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}
