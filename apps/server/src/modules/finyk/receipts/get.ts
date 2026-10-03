import type { Request, Response } from "express";
import pool from "../../../db.js";
import { NotFoundError, ValidationError } from "../../../obs/errors.js";
import { ReceiptGetResponseSchema } from "../../../http/schemas.js";
import { serializeReceipt } from "./serialize.js";
import type {
  ReceiptItemRow,
  ReceiptLinkRow,
  ReceiptRow,
} from "./serialize.js";

type WithSessionUser = Request & { user?: { id: string } };

/**
 * GET /api/finyk/receipts/:id — чек з позиціями для розгортки транзакції
 * (спека § API-контракт). Скоуп `WHERE id = $1 AND user_id = $2` НАПРЯМУ
 * в SELECT (не окрема ownership-перевірка після fetch): чужий чек і
 * неіснуючий id обидва дають 404, не 403 — не витікає, чи id взагалі
 * існує в іншого користувача.
 */
export default async function getReceiptHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user!.id;
  const idParam = req.params["id"];
  const receiptId = Number(idParam);
  if (!idParam || !Number.isInteger(receiptId) || receiptId <= 0) {
    throw new ValidationError("Некоректний id чека");
  }

  const { rows } = await pool.query<ReceiptRow>(
    `SELECT id, user_id, source, fiscal_num, store_name, store_tax_id,
            purchased_at, total_kopiykas, created_at, updated_at
       FROM receipts
      WHERE id = $1 AND user_id = $2`,
    [receiptId, userId],
  );
  const receiptRow = rows[0];
  if (!receiptRow) {
    throw new NotFoundError("Чек не знайдено");
  }

  const [itemsResult, linkResult] = await Promise.all([
    pool.query<ReceiptItemRow>(
      `SELECT id, receipt_id, position, name, qty, price_kopiykas, sum_kopiykas
         FROM receipt_items WHERE receipt_id = $1 ORDER BY position ASC`,
      [receiptId],
    ),
    pool.query<ReceiptLinkRow>(
      `SELECT tx_kind, tx_ref FROM finyk_tx_receipt_links WHERE receipt_id = $1`,
      [receiptId],
    ),
  ]);

  res.status(200).json(
    ReceiptGetResponseSchema.parse({
      receipt: serializeReceipt(
        receiptRow,
        itemsResult.rows,
        linkResult.rows[0] ?? null,
      ),
    }),
  );
}
