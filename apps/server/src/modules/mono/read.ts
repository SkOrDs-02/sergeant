import type { Request, Response } from "express";
import { query } from "../../db.js";
import { validateQuery } from "../../http/validate.js";
import {
  MonoAccountsResponseSchema,
  MonoTransactionsPageSchema,
  MonoTransactionsQuerySchema,
} from "../../http/schemas.js";
import {
  normalizeMonoAccount,
  normalizeMonoTransaction,
  type MonoAccountRow,
  type MonoTransactionRow,
} from "../../lib/normalizers/index.js";

interface AuthedRequest extends Request {
  user?: { id: string };
}

// AI-NOTE: coerce bigint→number here; pg returns int8 as string, breaking `!a.creditLimit` checks. See AGENTS.md rule #1.
// Coercion helpers extracted to lib/normalizers/mono.ts — toNumberOrNull,
// normalizeMonoAccount, normalizeMonoTransaction.

/**
 * GET /api/mono/accounts — returns user's Monobank accounts from DB.
 */
export async function accountsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { rows } = await query(
    `SELECT
       user_id          AS "userId",
       mono_account_id  AS "monoAccountId",
       send_id          AS "sendId",
       type,
       currency_code    AS "currencyCode",
       cashback_type    AS "cashbackType",
       masked_pan       AS "maskedPan",
       iban,
       balance,
       credit_limit     AS "creditLimit",
       last_seen_at     AS "lastSeenAt"
     FROM mono_account
     WHERE user_id = $1
     ORDER BY currency_code, mono_account_id`,
    [userId],
    { op: "mono_accounts_read" },
  );

  // Validate response shape against the SSOT before emitting (Hard Rule #3).
  // Drift between DB columns / normalizer output and the api-client `z.infer<>`
  // type now throws here, which surfaces in tests and CI rather than silently
  // shipping a typed lie to the client.
  res.json(
    MonoAccountsResponseSchema.parse(
      rows.map((r) => normalizeMonoAccount(r as MonoAccountRow)),
    ),
  );
}

/**
 * GET /api/mono/transactions — returns transactions from DB with cursor pagination.
 *
 * Query params: from, to, accountId, limit (max 200, default 50),
 * cursor (format: `<ISO-time>:<tx_id>`).
 *
 * Sorted by time DESC; cursor-based pagination uses (time, mono_tx_id) for stable ordering.
 */
export async function transactionsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = validateQuery(MonoTransactionsQuerySchema, req, res);
  if (!parsed.ok) return;

  const { from, to, accountId, limit, cursor } = parsed.data;

  // `t.deleted_at IS NULL` — soft-delete фільтр (міграція 024). Активні
  // рядки лежать у partial-індексі `mono_transaction_active_idx`, тому
  // умова не додає cost — план одразу йде по активному хвосту без
  // перегляду soft-deleted сторінок.
  const conditions: string[] = ["t.user_id = $1", "t.deleted_at IS NULL"];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (from) {
    conditions.push(`t.time >= $${paramIdx}`);
    params.push(from);
    paramIdx++;
  }
  if (to) {
    conditions.push(`t.time <= $${paramIdx}`);
    params.push(to);
    paramIdx++;
  }
  if (accountId) {
    conditions.push(`t.mono_account_id = $${paramIdx}`);
    params.push(accountId);
    paramIdx++;
  }
  if (cursor) {
    const lastColon = cursor.lastIndexOf(":");
    if (lastColon === -1 || lastColon === 0) {
      res.status(400).json({ error: "Invalid cursor format" });
      return;
    }
    const cursorTime = cursor.slice(0, lastColon);
    const cursorTxId = cursor.slice(lastColon + 1);
    conditions.push(
      `(t.time < $${paramIdx} OR (t.time = $${paramIdx} AND t.mono_tx_id < $${paramIdx + 1}))`,
    );
    params.push(cursorTime, cursorTxId);
    paramIdx += 2;
  }

  const where = conditions.join(" AND ");
  const sql = `
    SELECT
      t.user_id           AS "userId",
      t.mono_account_id   AS "monoAccountId",
      t.mono_tx_id        AS "monoTxId",
      t.time,
      t.amount,
      t.operation_amount  AS "operationAmount",
      t.currency_code     AS "currencyCode",
      t.mcc,
      t.original_mcc      AS "originalMcc",
      t.hold,
      t.description,
      t.comment,
      t.cashback_amount   AS "cashbackAmount",
      t.commission_rate   AS "commissionRate",
      t.balance,
      t.receipt_id        AS "receiptId",
      t.invoice_id        AS "invoiceId",
      t.counter_edrpou    AS "counterEdrpou",
      t.counter_iban      AS "counterIban",
      t.counter_name      AS "counterName",
      t.category_slug     AS "categorySlug",
      t.category_overridden AS "categoryOverridden",
      t.source,
      t.received_at       AS "receivedAt"
    FROM mono_transaction t
    WHERE ${where}
    ORDER BY t.time DESC, t.mono_tx_id DESC
    LIMIT $${paramIdx}
  `;
  params.push(limit + 1);

  interface TxRow {
    userId: string;
    monoAccountId: string;
    monoTxId: string;
    time: Date | string;
    amount: number;
    operationAmount: number;
    currencyCode: number;
    mcc: number | null;
    originalMcc: number | null;
    hold: boolean | null;
    description: string | null;
    comment: string | null;
    cashbackAmount: number | null;
    commissionRate: number | null;
    balance: number | null;
    receiptId: string | null;
    invoiceId: string | null;
    counterEdrpou: string | null;
    counterIban: string | null;
    counterName: string | null;
    categorySlug: string | null;
    categoryOverridden: boolean;
    source: string;
    receivedAt: Date | string;
  }

  const { rows } = await query<TxRow>(sql, params, {
    op: "mono_transactions_read",
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const result = items.map((r) =>
    normalizeMonoTransaction(r as MonoTransactionRow),
  );

  // Same SSOT validation as `accountsHandler`: ensures `MonoTransactionDto`
  // (after `normalizeMonoTransaction`) really matches the `z.infer<>` type
  // shipped to the api-client.
  if (hasMore) {
    const last = result[result.length - 1];
    const nextCursor = `${last.time}:${last.monoTxId}`;
    res.json(MonoTransactionsPageSchema.parse({ data: result, nextCursor }));
  } else {
    res.json(
      MonoTransactionsPageSchema.parse({ data: result, nextCursor: null }),
    );
  }
}
