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

/**
 * Курсор — opaque base64url над JSON-масивом `[purchasedAtIso, receiptId]`:
 * `receipt_id` — зовнішній ключ Сільпо без гарантій формату, тож будь-який
 * текстовий роздільник міг би колізувати з самим id; JSON-масив знімає
 * проблему роздільника як клас. Клієнт курсор не розбирає (opaque
 * pass-through), тому кодування — вільна зміна формату.
 */
function encodeCursor(purchasedAtIso: string, receiptId: string): string {
  return Buffer.from(
    JSON.stringify([purchasedAtIso, receiptId]),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): {
  purchasedAt: string;
  receiptId: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    parsed = null;
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string" ||
    parsed[0].length === 0 ||
    parsed[1].length === 0
  ) {
    throw new AppError("Invalid cursor format", {
      status: 400,
      code: "VALIDATION",
    });
  }
  return { purchasedAt: parsed[0], receiptId: parsed[1] };
}

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
    const { purchasedAt: cursorPurchasedAt, receiptId: cursorReceiptId } =
      decodeCursor(opts.cursor);
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
       LEFT JOIN silpo_tx_receipt_links l
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
      ? encodeCursor(
          normalizeSilpoReceiptSummary(last).purchasedAt,
          last.receiptId,
        )
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
       LEFT JOIN silpo_tx_receipt_links l
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
