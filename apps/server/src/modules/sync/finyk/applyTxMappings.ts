/* eslint-disable no-restricted-syntax -- Templated client.query() тут
   інтерполює лише SQL *identifiers* (`${table}`, `${jsonColumn}`) з типізованих
   union-літералів у цьому файлі — ніколи не user input; усі значення йдуть
   через $N bind-params. Ідентифікатор не можна підставити плейсхолдером, тож
   шаблон — єдиний варіант. Так само в `applySync.ts` поруч. */
import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import {
  parseOptionalDate,
  parseOptionalNumber,
  toJsonbParam,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";
import { applyIfNewer } from "../applySync-helpers.js";

/**
 * Soft-delete apply для чотирьох finyk-таблиць без власного UUID-PK
 * (data-15, частина Б; міграція 156, ADR-0073 § Рішення):
 * `finyk_tx_categories`, `finyk_tx_splits`, `finyk_mono_debt_links` (ключ
 * `(user_id, transaction_id)`) і `finyk_networth_history` (ключ
 * `(user_id, month)`).
 *
 * AI-DANGER: `op = 'delete'` тут НЕ видаляє рядок фізично, а ставить
 * `deleted_at = updated_at = clientTs`. Раніше був справжній `DELETE`: після
 * нього застарілий upsert (insert@T1 після delete@T2) ішов у
 * `INSERT … ON CONFLICT` без рядка, якому було б з чим порівнятись за LWW, і
 * воскрешав видалене. Tombstone тримає `updated_at` видалення, тож SELECT
 * нижче відхиляє застарілий запис як `lww_conflict`. Новіший за tombstone
 * запис воскрешає рядок (`deleted_at = NULL`) — той самий чистий LWW, що й
 * для `finyk_budgets` (див. `guardUuidPkApply`). Не повертай `DELETE`.
 */
type KeyedTable =
  | "finyk_tx_categories"
  | "finyk_tx_splits"
  | "finyk_mono_debt_links"
  | "finyk_networth_history";

interface KeyedTarget {
  table: KeyedTable;
  /** Колонки природного ключа, окрім `user_id`. */
  keyColumn: "transaction_id" | "month";
  keyValue: string;
}

/**
 * Спільна частина: власник, LWW за наявним рядком (живим чи tombstone-ом),
 * delete → tombstone. Для upsert повертає `null`, і викликач виконує свій
 * INSERT … ON CONFLICT (колонки payload-у різні).
 */
async function guardAndTombstone(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
  target: KeyedTarget,
): Promise<AppliedStatus | null> {
  const { table, keyColumn, keyValue } = target;
  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM ${table}
       WHERE user_id = $1 AND ${keyColumn} = $2`,
    [userId, keyValue],
  );
  const current = existing.rows[0];
  // Tombstone теж має `updated_at`, тож застарілий upsert після delete
  // відсіюється тут, а не воскрешає рядок.
  if (current && current.updated_at.getTime() >= clientTs.getTime()) {
    return { status: "rejected", reason: "lww_conflict" };
  }

  if (op.op === "delete") {
    // Рядка немає взагалі: нічого позначати (як і раніше — `applied`).
    if (!current) return { status: "applied" };
    return applyIfNewer(
      client,
      `UPDATE ${table}
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND ${keyColumn} = $3 AND updated_at < $1`,
      [clientTs, userId, keyValue],
    );
  }
  return null;
}

function checkOwner(
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

/**
 * `deleted_at` вхідного не-delete опа. Живий upsert несе `null` (воскресіння
 * скидає tombstone), а рядок із міткою — наприклад, snapshot анонімного
 * профілю, де запис уже видалено — лишається tombstone-ом і не воскресає на
 * новому профілі. Той самий контракт, що в `applyFinykPerRowBlob`.
 */
const INVALID_DELETED_AT: AppliedStatus = {
  status: "rejected",
  reason: "invalid_deleted_at",
};

export async function applyFinykTxCategories(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const transactionId =
    typeof row["transaction_id"] === "string" ? row["transaction_id"] : null;
  if (!transactionId) return { status: "rejected", reason: "missing_tx_id" };

  const ownerError = checkOwner(row, userId);
  if (ownerError) return ownerError;

  const settled = await guardAndTombstone(client, op, userId, clientTs, {
    table: "finyk_tx_categories",
    keyColumn: "transaction_id",
    keyValue: transactionId,
  });
  if (settled) return settled;

  const categoryId =
    typeof row["category_id"] === "string" ? row["category_id"] : null;
  if (!categoryId) {
    return { status: "rejected", reason: "missing_category_id" };
  }

  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") return INVALID_DELETED_AT;

  return applyIfNewer(
    client,
    `INSERT INTO finyk_tx_categories
       (user_id, transaction_id, category_id, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, transaction_id) DO UPDATE
       SET category_id = EXCLUDED.category_id,
           updated_at  = EXCLUDED.updated_at,
           deleted_at  = EXCLUDED.deleted_at
       WHERE finyk_tx_categories.updated_at < EXCLUDED.updated_at`,
    [userId, transactionId, categoryId, clientTs, clientTs, deletedAt ?? null],
  );
}

export async function applyFinykPerTxJsonbArray(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
  table: "finyk_tx_splits" | "finyk_mono_debt_links",
  jsonColumn: "splits_json" | "debt_ids_json",
): Promise<AppliedStatus> {
  const row = op.row;
  const transactionId =
    typeof row["transaction_id"] === "string" ? row["transaction_id"] : null;
  if (!transactionId) return { status: "rejected", reason: "missing_tx_id" };

  const ownerError = checkOwner(row, userId);
  if (ownerError) return ownerError;

  const settled = await guardAndTombstone(client, op, userId, clientTs, {
    table,
    keyColumn: "transaction_id",
    keyValue: transactionId,
  });
  if (settled) return settled;

  const jsonValue = toJsonbParam(row[jsonColumn]) ?? "[]";
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") return INVALID_DELETED_AT;

  return applyIfNewer(
    client,
    `INSERT INTO ${table}
       (user_id, transaction_id, ${jsonColumn}, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (user_id, transaction_id) DO UPDATE
       SET ${jsonColumn} = EXCLUDED.${jsonColumn},
           updated_at    = EXCLUDED.updated_at,
           deleted_at    = EXCLUDED.deleted_at
       WHERE ${table}.updated_at < EXCLUDED.updated_at`,
    [userId, transactionId, jsonValue, clientTs, clientTs, deletedAt ?? null],
  );
}

export async function applyFinykNetworthHistory(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const month = typeof row["month"] === "string" ? row["month"] : null;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return { status: "rejected", reason: "invalid_month" };
  }

  const ownerError = checkOwner(row, userId);
  if (ownerError) return ownerError;

  const settled = await guardAndTombstone(client, op, userId, clientTs, {
    table: "finyk_networth_history",
    keyColumn: "month",
    keyValue: month,
  });
  if (settled) return settled;

  const networth = parseOptionalNumber(row["networth"]);
  if (networth === "invalid") {
    return { status: "rejected", reason: "invalid_networth" };
  }
  const snapshotJson = toJsonbParam(row["snapshot_json"]) ?? "{}";
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") return INVALID_DELETED_AT;

  return applyIfNewer(
    client,
    `INSERT INTO finyk_networth_history
       (user_id, month, networth, snapshot_json, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     ON CONFLICT (user_id, month) DO UPDATE
       SET networth      = EXCLUDED.networth,
           snapshot_json = EXCLUDED.snapshot_json,
           updated_at    = EXCLUDED.updated_at,
           deleted_at    = EXCLUDED.deleted_at
       WHERE finyk_networth_history.updated_at < EXCLUDED.updated_at`,
    [
      userId,
      month,
      networth ?? 0,
      snapshotJson,
      clientTs,
      clientTs,
      deletedAt ?? null,
    ],
  );
}
