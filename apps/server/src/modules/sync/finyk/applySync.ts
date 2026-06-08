/* eslint-disable no-restricted-syntax --
   The finyk apply functions build SQL with templated identifiers (${table},
   ${extColumn}) that are type-constrained literal-string unions sourced from
   the validated sync registry — never user input. All user-supplied values are
   parameterised ($1/$2/…). Так шаблонний-query guard (M11) тут — false-positive.
   See docs/security/hardening/M11-eslint-plugin-security.md. */
import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import {
  parseOptionalDate,
  parseOptionalNumber,
  toJsonbParam,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

export async function applyFinykTombstone(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
  table: "finyk_hidden_accounts" | "finyk_hidden_transactions",
  extColumn: "account_id" | "transaction_id",
): Promise<AppliedStatus> {
  const row = op.row;
  const extId = typeof row[extColumn] === "string" ? row[extColumn] : null;
  if (!extId) return { status: "rejected", reason: "missing_ext_id" };

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT updated_at, deleted_at FROM ${table} WHERE user_id = $1 AND ${extColumn} = $2`,
    [userId, extId],
  );
  if (existing.rows.length > 0) {
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
      `UPDATE ${table}
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND ${extColumn} = $3`,
      [clientTs, userId, extId],
    );
    return { status: "applied" };
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
      `INSERT INTO ${table}
         (user_id, ${extColumn}, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, extId, createdAt ?? clientTs, clientTs, deletedAt ?? null],
    );
  } else {
    await client.query(
      `UPDATE ${table}
         SET updated_at = $1, deleted_at = $2
       WHERE user_id = $3 AND ${extColumn} = $4`,
      [clientTs, deletedAt ?? null, userId, extId],
    );
  }
  return { status: "applied" };
}

export async function applyFinykHiddenAccounts(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykTombstone(
    client,
    op,
    userId,
    clientTs,
    "finyk_hidden_accounts",
    "account_id",
  );
}

export async function applyFinykHiddenTransactions(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykTombstone(
    client,
    op,
    userId,
    clientTs,
    "finyk_hidden_transactions",
    "transaction_id",
  );
}

export async function applyFinykPerRowBlob(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
  table: string,
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
  }>(`SELECT user_id, updated_at, deleted_at FROM ${table} WHERE id = $1`, [
    id,
  ]);
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
      `UPDATE ${table}
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
      `INSERT INTO ${table}
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
      `UPDATE ${table}
         SET data_json  = $1::jsonb,
             updated_at = $2,
             deleted_at = $3
       WHERE id = $4 AND user_id = $5`,
      [dataJson, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

export async function applyFinykBudgets(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(client, op, userId, clientTs, "finyk_budgets");
}

export async function applyFinykSubscriptions(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(
    client,
    op,
    userId,
    clientTs,
    "finyk_subscriptions",
  );
}

export async function applyFinykAssets(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(client, op, userId, clientTs, "finyk_assets");
}

export async function applyFinykDebts(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(client, op, userId, clientTs, "finyk_debts");
}

export async function applyFinykReceivables(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(
    client,
    op,
    userId,
    clientTs,
    "finyk_receivables",
  );
}

export async function applyFinykCustomCategories(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(
    client,
    op,
    userId,
    clientTs,
    "finyk_custom_categories",
  );
}

export async function applyFinykManualExpenses(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(
    client,
    op,
    userId,
    clientTs,
    "finyk_manual_expenses",
  );
}

export async function applyFinykTxFilters(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerRowBlob(client, op, userId, clientTs, "finyk_tx_filters");
}

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

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM finyk_tx_categories
       WHERE user_id = $1 AND transaction_id = $2`,
    [userId, transactionId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    await client.query(
      `DELETE FROM finyk_tx_categories
         WHERE user_id = $1 AND transaction_id = $2`,
      [userId, transactionId],
    );
    return { status: "applied" };
  }

  const categoryId =
    typeof row["category_id"] === "string" ? row["category_id"] : null;
  if (!categoryId) {
    return { status: "rejected", reason: "missing_category_id" };
  }

  await client.query(
    `INSERT INTO finyk_tx_categories
       (user_id, transaction_id, category_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, transaction_id) DO UPDATE
       SET category_id = EXCLUDED.category_id,
           updated_at  = EXCLUDED.updated_at`,
    [userId, transactionId, categoryId, clientTs, clientTs],
  );
  return { status: "applied" };
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

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM ${table}
       WHERE user_id = $1 AND transaction_id = $2`,
    [userId, transactionId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    await client.query(
      `DELETE FROM ${table}
         WHERE user_id = $1 AND transaction_id = $2`,
      [userId, transactionId],
    );
    return { status: "applied" };
  }

  const jsonValue = toJsonbParam(row[jsonColumn]) ?? "[]";

  await client.query(
    `INSERT INTO ${table}
       (user_id, transaction_id, ${jsonColumn}, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (user_id, transaction_id) DO UPDATE
       SET ${jsonColumn} = EXCLUDED.${jsonColumn},
           updated_at    = EXCLUDED.updated_at`,
    [userId, transactionId, jsonValue, clientTs, clientTs],
  );
  return { status: "applied" };
}

export async function applyFinykTxSplits(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerTxJsonbArray(
    client,
    op,
    userId,
    clientTs,
    "finyk_tx_splits",
    "splits_json",
  );
}

export async function applyFinykMonoDebtLinks(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyFinykPerTxJsonbArray(
    client,
    op,
    userId,
    clientTs,
    "finyk_mono_debt_links",
    "debt_ids_json",
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

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM finyk_networth_history
       WHERE user_id = $1 AND month = $2`,
    [userId, month],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    await client.query(
      `DELETE FROM finyk_networth_history
         WHERE user_id = $1 AND month = $2`,
      [userId, month],
    );
    return { status: "applied" };
  }

  const networth = parseOptionalNumber(row["networth"]);
  if (networth === "invalid") {
    return { status: "rejected", reason: "invalid_networth" };
  }
  const snapshotJson = toJsonbParam(row["snapshot_json"]) ?? "{}";

  await client.query(
    `INSERT INTO finyk_networth_history
       (user_id, month, networth, snapshot_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (user_id, month) DO UPDATE
       SET networth      = EXCLUDED.networth,
           snapshot_json = EXCLUDED.snapshot_json,
           updated_at    = EXCLUDED.updated_at`,
    [userId, month, networth ?? 0, snapshotJson, clientTs, clientTs],
  );
  return { status: "applied" };
}

export async function applyFinykPrefs(
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

  const existing = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM finyk_prefs WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  const prefsJson = toJsonbParam(row["prefs_json"]) ?? "{}";
  const monthlyPlanJson = toJsonbParam(row["monthly_plan_json"]) ?? "{}";
  const showBalance =
    row["show_balance"] === false || row["show_balance"] === 0 ? false : true;
  const excludedStatTxIds = toJsonbParam(row["excluded_stat_tx_ids"]) ?? "[]";
  const dismissedRecurring = toJsonbParam(row["dismissed_recurring"]) ?? "[]";

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO finyk_prefs
         (user_id, prefs_json, monthly_plan_json, show_balance,
          excluded_stat_tx_ids, dismissed_recurring,
          created_at, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        userId,
        prefsJson,
        monthlyPlanJson,
        showBalance,
        excludedStatTxIds,
        dismissedRecurring,
        clientTs,
        clientTs,
      ],
    );
  } else {
    await client.query(
      `UPDATE finyk_prefs
         SET prefs_json           = $1::jsonb,
             monthly_plan_json    = $2::jsonb,
             show_balance         = $3,
             excluded_stat_tx_ids = $4::jsonb,
             dismissed_recurring  = $5::jsonb,
             updated_at           = $6
       WHERE user_id = $7`,
      [
        prefsJson,
        monthlyPlanJson,
        showBalance,
        excludedStatTxIds,
        dismissedRecurring,
        clientTs,
        userId,
      ],
    );
  }
  return { status: "applied" };
}
