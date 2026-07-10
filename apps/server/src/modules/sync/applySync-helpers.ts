import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../http/schemas.js";
import {
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalNumber,
  parseRequiredDate,
  toJsonbParam,
  toNonNegativeInt,
} from "./syncV2-core.js";
import type { AppliedStatus } from "./syncV2-types.js";

export type ExistingUuidRow = {
  user_id: string;
  updated_at: Date;
  deleted_at: Date | null;
};

export function assertRowUserId(
  row: Record<string, unknown>,
  userId: string,
): AppliedStatus | null {
  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }
  return null;
}

export function guardUuidPkApply(
  existing: ExistingUuidRow | undefined,
  userId: string,
  clientTs: Date,
  op: SyncV2Op,
): AppliedStatus | null {
  if (!existing) return null;
  if (existing.user_id !== userId) {
    return { status: "rejected", reason: "fk_violation" };
  }
  if (existing.updated_at.getTime() >= clientTs.getTime()) {
    return { status: "rejected", reason: "lww_conflict" };
  }
  if (existing.deleted_at !== null && op.op !== "delete") {
    return { status: "rejected", reason: "tombstoned" };
  }
  return null;
}

export async function queryOne<T extends Record<string, unknown>>(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<T | undefined> {
  const existing = await client.query<T>(sql, params);
  return existing.rows[0];
}

export async function softDeleteById(
  client: PoolClient,
  table:
    | "routine_habits"
    | "routine_tags"
    | "routine_categories"
    | "fizruk_daily_log"
    | "fizruk_workout_templates",
  id: string,
  userId: string,
  clientTs: Date,
  existing: ExistingUuidRow | undefined,
): Promise<AppliedStatus> {
  if (!existing) return { status: "rejected", reason: "not_found" };
  const sqlByTable = {
    routine_habits: `UPDATE routine_habits SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3`,
    routine_tags: `UPDATE routine_tags SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3`,
    routine_categories: `UPDATE routine_categories SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3`,
    fizruk_daily_log: `UPDATE fizruk_daily_log SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3`,
    fizruk_workout_templates: `UPDATE fizruk_workout_templates SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3`,
  } as const;
  await client.query(sqlByTable[table], [clientTs, id, userId]);
  return { status: "applied" };
}

export function guardUserPkLww(
  existing: { updated_at: Date } | undefined,
  clientTs: Date,
): AppliedStatus | null {
  if (existing && existing.updated_at.getTime() >= clientTs.getTime()) {
    return { status: "rejected", reason: "lww_conflict" };
  }
  return null;
}

/** Accept PG key or SQLite `*_json` alias; coerce to JSONB bind param. */
export function readJsonbField(
  row: Record<string, unknown>,
  pgKey: string,
  sqliteKey?: string,
  fallback = "null",
): string {
  const raw =
    row[pgKey] ??
    (sqliteKey ? row[sqliteKey] : undefined) ??
    (pgKey === "data" ? row["data_json"] : undefined) ??
    (pgKey === "order" ? row["order_json"] : undefined);
  if (raw == null) return fallback;
  return toJsonbParam(raw) ?? fallback;
}

export function readBoolField(
  row: Record<string, unknown>,
  key: string,
): boolean {
  const raw = row[key];
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  return false;
}

export {
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalNumber,
  parseRequiredDate,
  toJsonbParam,
  toNonNegativeInt,
};
