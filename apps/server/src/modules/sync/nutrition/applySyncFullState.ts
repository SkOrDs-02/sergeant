import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import type { AppliedStatus } from "../syncV2-types.js";
import {
  assertRowUserId,
  guardUserPkLww,
  queryOne,
  readJsonbField,
  toNonNegativeInt,
} from "../applySync-helpers.js";

export async function applyNutritionWaterLog(
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

  const dateKey = typeof row["date_key"] === "string" ? row["date_key"] : null;
  if (!dateKey) return { status: "rejected", reason: "missing_date_key" };

  const existing = await queryOne<{ user_id: string; updated_at: Date }>(
    client,
    `SELECT user_id, updated_at FROM nutrition_water_log WHERE user_id = $1 AND date_key = $2`,
    [userId, dateKey],
  );
  const guard = guardUserPkLww(existing, clientTs);
  if (guard) return guard;

  const volumeMl = toNonNegativeInt(row["volume_ml"]) ?? 0;
  await client.query(
    `INSERT INTO nutrition_water_log (user_id, date_key, volume_ml, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date_key) DO UPDATE
       SET volume_ml = EXCLUDED.volume_ml, updated_at = EXCLUDED.updated_at`,
    [userId, dateKey, volumeMl, clientTs],
  );
  return { status: "applied" };
}

export async function applyNutritionShoppingList(
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
    `SELECT user_id, updated_at FROM nutrition_shopping_list WHERE user_id = $1`,
    [userId],
  );
  const guard = guardUserPkLww(existing, clientTs);
  if (guard) return guard;

  const dataJson = readJsonbField(row, "data", "data_json");
  await client.query(
    `INSERT INTO nutrition_shopping_list (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, dataJson, clientTs],
  );
  return { status: "applied" };
}
