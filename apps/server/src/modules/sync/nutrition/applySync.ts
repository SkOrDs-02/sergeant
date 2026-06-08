import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import {
  parseOptionalDate,
  parseRequiredDate,
  parseOptionalNumber,
  parseOptionalInt,
  toJsonbParam,
  toNonNegativeInt,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

export async function applyNutritionMeals(
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
    `SELECT user_id, updated_at, deleted_at FROM nutrition_meals WHERE id = $1`,
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
      `UPDATE nutrition_meals
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const eatenAt = parseRequiredDate(row["eaten_at"]);
  if (eatenAt === "invalid") {
    return { status: "rejected", reason: "invalid_eaten_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  const mealType =
    typeof row["meal_type"] === "string" ? row["meal_type"] : "snack";
  const name = typeof row["name"] === "string" ? row["name"] : "";
  const label = typeof row["label"] === "string" ? row["label"] : "";
  const source = typeof row["source"] === "string" ? row["source"] : "manual";
  const macroSource =
    typeof row["macro_source"] === "string" ? row["macro_source"] : "manual";
  const foodId = typeof row["food_id"] === "string" ? row["food_id"] : null;
  const isDemo = row["is_demo"] === true || row["is_demo"] === 1;

  const kcal = parseOptionalInt(row["kcal"]);
  if (kcal === "invalid") {
    return { status: "rejected", reason: "invalid_kcal" };
  }
  const proteinG = parseOptionalNumber(row["protein_g"]);
  if (proteinG === "invalid") {
    return { status: "rejected", reason: "invalid_protein_g" };
  }
  const fatG = parseOptionalNumber(row["fat_g"]);
  if (fatG === "invalid") {
    return { status: "rejected", reason: "invalid_fat_g" };
  }
  const carbsG = parseOptionalNumber(row["carbs_g"]);
  if (carbsG === "invalid") {
    return { status: "rejected", reason: "invalid_carbs_g" };
  }
  const amountG = parseOptionalNumber(row["amount_g"]);
  if (amountG === "invalid") {
    return { status: "rejected", reason: "invalid_amount_g" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO nutrition_meals
         (id, user_id, eaten_at, meal_type, name, label,
          kcal, protein_g, fat_g, carbs_g,
          source, macro_source, amount_g, food_id, is_demo,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10,
               $11, $12, $13, $14, $15,
               $16, $17, $18)`,
      [
        id,
        userId,
        eatenAt,
        mealType,
        name,
        label,
        kcal ?? null,
        proteinG ?? null,
        fatG ?? null,
        carbsG ?? null,
        source,
        macroSource,
        amountG ?? null,
        foodId,
        isDemo,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE nutrition_meals
         SET eaten_at     = $1,
             meal_type    = $2,
             name         = $3,
             label        = $4,
             kcal         = $5,
             protein_g    = $6,
             fat_g        = $7,
             carbs_g      = $8,
             source       = $9,
             macro_source = $10,
             amount_g     = $11,
             food_id      = $12,
             is_demo      = $13,
             updated_at   = $14,
             deleted_at   = $15
       WHERE id = $16 AND user_id = $17`,
      [
        eatenAt,
        mealType,
        name,
        label,
        kcal ?? null,
        proteinG ?? null,
        fatG ?? null,
        carbsG ?? null,
        source,
        macroSource,
        amountG ?? null,
        foodId,
        isDemo,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

export async function applyNutritionPantries(
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
    `SELECT user_id, updated_at, deleted_at FROM nutrition_pantries WHERE id = $1`,
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
      `UPDATE nutrition_pantries
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const name = typeof row["name"] === "string" ? row["name"] : "";
  const text = typeof row["text"] === "string" ? row["text"] : "";
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
      `INSERT INTO nutrition_pantries
         (id, user_id, name, text, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        userId,
        name,
        text,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE nutrition_pantries
         SET name       = $1,
             text       = $2,
             updated_at = $3,
             deleted_at = $4
       WHERE id = $5 AND user_id = $6`,
      [name, text, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

export async function applyNutritionPantryItems(
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
    `SELECT user_id, updated_at, deleted_at FROM nutrition_pantry_items WHERE id = $1`,
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
      `UPDATE nutrition_pantry_items
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const pantryId =
    typeof row["pantry_id"] === "string" ? row["pantry_id"] : null;
  if (!pantryId) {
    return { status: "rejected", reason: "missing_pantry_id" };
  }
  const name = typeof row["name"] === "string" ? row["name"] : "";
  const qty = parseOptionalNumber(row["qty"]);
  if (qty === "invalid") {
    return { status: "rejected", reason: "invalid_qty" };
  }
  const unit = typeof row["unit"] === "string" ? row["unit"] : null;
  const notes = typeof row["notes"] === "string" ? row["notes"] : null;
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
      `INSERT INTO nutrition_pantry_items
         (id, pantry_id, user_id, name, qty, unit, notes, sort_order,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        pantryId,
        userId,
        name,
        qty ?? null,
        unit,
        notes,
        sortOrder,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE nutrition_pantry_items
         SET pantry_id  = $1,
             name       = $2,
             qty        = $3,
             unit       = $4,
             notes      = $5,
             sort_order = $6,
             updated_at = $7,
             deleted_at = $8
       WHERE id = $9 AND user_id = $10`,
      [
        pantryId,
        name,
        qty ?? null,
        unit,
        notes,
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

export async function applyNutritionPrefs(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }

  const row = op.row;

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ user_id: string; updated_at: Date }>(
    `SELECT user_id, updated_at FROM nutrition_prefs WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  const prefsJson = toJsonbParam(row["prefs_json"]) ?? "{}";
  const activePantryId =
    typeof row["active_pantry_id"] === "string"
      ? row["active_pantry_id"]
      : null;

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO nutrition_prefs
         (user_id, prefs_json, active_pantry_id, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5)`,
      [userId, prefsJson, activePantryId, clientTs, clientTs],
    );
  } else {
    await client.query(
      `UPDATE nutrition_prefs
         SET prefs_json       = $1::jsonb,
             active_pantry_id = $2,
             updated_at       = $3
       WHERE user_id = $4`,
      [prefsJson, activePantryId, clientTs, userId],
    );
  }
  return { status: "applied" };
}

export async function applyNutritionRecipes(
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
    `SELECT user_id, updated_at, deleted_at FROM nutrition_recipes WHERE id = $1`,
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
      `UPDATE nutrition_recipes
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const name = typeof row["name"] === "string" ? row["name"] : "";
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
      `INSERT INTO nutrition_recipes
         (id, user_id, name, data_json, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [
        id,
        userId,
        name,
        dataJson,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE nutrition_recipes
         SET name       = $1,
             data_json  = $2::jsonb,
             updated_at = $3,
             deleted_at = $4
       WHERE id = $5 AND user_id = $6`,
      [name, dataJson, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}
