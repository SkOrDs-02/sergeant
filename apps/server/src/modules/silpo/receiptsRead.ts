import { query as defaultQuery } from "../../db.js";
import { AppError } from "../../obs/errors.js";
import type { QueryFn } from "./tokenStore.js";
import {
  normalizeSilpoReceiptDetail,
  normalizeSilpoReceiptSummary,
  type NormalizedSilpoReceiptDetail,
  type NormalizedSilpoReceiptSummary,
} from "../../lib/normalizers/silpo.js";

/**
 * Read-side of the Silpo receipts module — split out of `receipts.ts`
 * (Hard Rule #18, module-size discipline: `receipts.ts` grew past 600
 * lines after the review-round fixes for per-order MCP parsing and the
 * receipt+items transaction). Pure re-export from `receipts.ts` keeps the
 * public import path (`./receipts.js`) unchanged for `routes/silpo.ts` and
 * existing tests.
 */

export interface ReceiptsPage {
  data: NormalizedSilpoReceiptSummary[];
  nextCursor: string | null;
}

export type ReceiptSummaryRow = {
  receiptId: string;
  purchasedAt: Date | string;
  storeId: string | null;
  channel: "online" | "offline";
  paymentHint: string | null;
  totalKop: unknown;
  transactionId: string | null;
};

/** `GET /api/silpo/receipts` — cursor-paginated, newest first. */
export async function listReceipts(
  userId: string,
  opts: { limit: number; cursor?: string | undefined },
  queryFn: QueryFn = defaultQuery,
): Promise<ReceiptsPage> {
  const conditions = ["r.user_id = $1"];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (opts.cursor) {
    const lastColon = opts.cursor.lastIndexOf(":");
    if (lastColon <= 0) {
      throw new AppError("Invalid cursor format", {
        status: 400,
        code: "VALIDATION",
      });
    }
    const cursorPurchasedAt = opts.cursor.slice(0, lastColon);
    const cursorReceiptId = opts.cursor.slice(lastColon + 1);
    conditions.push(
      `(r.purchased_at < $${paramIdx} OR (r.purchased_at = $${paramIdx} AND r.receipt_id < $${paramIdx + 1}))`,
    );
    params.push(cursorPurchasedAt, cursorReceiptId);
    paramIdx += 2;
  }

  params.push(opts.limit + 1);
  const { rows } = await queryFn<ReceiptSummaryRow>(
    `SELECT r.receipt_id AS "receiptId",
            r.purchased_at AS "purchasedAt",
            r.store_id AS "storeId",
            r.channel,
            r.payment_hint AS "paymentHint",
            r.total_kop AS "totalKop",
            l.transaction_id AS "transactionId"
       FROM silpo_receipts r
       LEFT JOIN finyk_tx_receipt_links l
              ON l.user_id = r.user_id AND l.receipt_id = r.receipt_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY r.purchased_at DESC, r.receipt_id DESC
      LIMIT $${paramIdx}`,
    params,
    { op: "silpo_receipts_list" },
  );

  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;
  const data = items.map((r) => normalizeSilpoReceiptSummary(r));
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? `${normalizeSilpoReceiptSummary(last).purchasedAt}:${last.receiptId}`
      : null;

  return { data, nextCursor };
}

/** `GET /api/silpo/receipts/:id` — summary + line items, or `null` when not found / not owned by `userId`. */
export async function getReceiptDetail(
  userId: string,
  receiptId: string,
  queryFn: QueryFn = defaultQuery,
): Promise<NormalizedSilpoReceiptDetail | null> {
  const { rows: receiptRows } = await queryFn<ReceiptSummaryRow>(
    `SELECT r.receipt_id AS "receiptId",
            r.purchased_at AS "purchasedAt",
            r.store_id AS "storeId",
            r.channel,
            r.payment_hint AS "paymentHint",
            r.total_kop AS "totalKop",
            l.transaction_id AS "transactionId"
       FROM silpo_receipts r
       LEFT JOIN finyk_tx_receipt_links l
              ON l.user_id = r.user_id AND l.receipt_id = r.receipt_id
      WHERE r.user_id = $1 AND r.receipt_id = $2`,
    [userId, receiptId],
    { op: "silpo_receipt_detail_select" },
  );
  const receiptRow = receiptRows[0];
  if (!receiptRow) return null;

  const { rows: itemRows } = await queryFn<{
    id: unknown;
    name: string;
    qty: unknown;
    unit: string | null;
    priceKop: unknown;
    categorySlug: string | null;
    barcode: string | null;
  }>(
    `SELECT id, name, qty, unit, price_kop AS "priceKop",
            category_slug AS "categorySlug", barcode
       FROM silpo_receipt_items
      WHERE user_id = $1 AND receipt_id = $2
      ORDER BY id ASC`,
    [userId, receiptId],
    { op: "silpo_receipt_items_select" },
  );

  return normalizeSilpoReceiptDetail(receiptRow, itemRows);
}
