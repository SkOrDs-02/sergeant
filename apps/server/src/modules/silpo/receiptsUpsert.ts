/**
 * Last validated: 2026-09-17
 * Status: Active
 *
 * Write-side (DB) крок синку Сільпо — винесено з `receipts.ts`
 * (Hard Rule #18: після доливки позицій той файл знову переріс 600
 * рядків, як уже було з read-шляхом → `receiptsRead.ts` і матчером →
 * `receiptsMatch.ts`).
 *
 * Тут живе рівно одна відповідальність: покласти розібраний чек і його
 * позиції в Postgres однією транзакцією. Нормалізація сирих відповідей
 * Сільпо лишається в `receipts.ts`, і залежність ОДНОСПРЯМОВАНА
 * (`receipts.ts` → цей модуль): форми `ParsedItem`/`ParsedReceipt` живуть
 * тут, тож зворотного імпорту — а з ним і TDZ-циклу, який уже ловили на
 * `orderLimits.ts`, — не виникає.
 */
import type { PoolClient } from "pg";
import { pool } from "../../db.js";
import { logger } from "../../obs/logger.js";
import type { QueryFn } from "./tokenStore.js";

/** Позиція чека, уже нормалізована з сирої відповіді Сільпо. */
export interface ParsedItem {
  name: string;
  qty: number | null;
  unit: string | null;
  priceKop: number;
  categorySlug: string | null;
  barcode: string | null;
}

/** Чек, уже нормалізований з сирої відповіді Сільпо. */
export interface ParsedReceipt {
  receiptId: string;
  purchasedAtMs: number;
  storeId: string | null;
  paymentHint: string | null;
  totalKop: number;
  items: ParsedItem[];
  raw: unknown;
}

/**
 * Runs `fn` inside `BEGIN…COMMIT` on ONE dedicated `pool` client — mirrors
 * `modules/mono/webhook.ts` (raw `pool.connect()` +
 * `client.query("BEGIN"/"COMMIT"/"ROLLBACK")`), NOT a sequence of
 * independent `pool.query()` calls, which may each grab a different
 * physical connection and silently not be transactional at all.
 */
export type SilpoTransactionRunner = <T>(
  fn: (queryFn: QueryFn) => Promise<T>,
) => Promise<T>;

/** Adapts a `PoolClient` to the `QueryFn` shape this module's SQL helpers already use (`meta` is accepted + ignored — `PoolClient.query` has no such concept). */
const clientAsQueryFn: (client: PoolClient) => QueryFn = (client) =>
  (async (text, values) => {
    const sql = typeof text === "string" ? text : text.text;
    return client.query(sql, values);
  }) satisfies QueryFn;

export async function defaultWithTransaction<T>(
  fn: (queryFn: QueryFn) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(clientAsQueryFn(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Best-effort — original error matters more than a rollback failure.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Inserts a receipt (+ its items). Both statements run inside ONE
 * transaction: before this fix they were independent, so a failed items
 * INSERT left an item-less receipt behind FOREVER (`ON CONFLICT DO
 * NOTHING` on the receipt insert blocks a retried sync from self-healing
 * it). A rolled-back receipt insert means the next sync retries cleanly.
 *
 * **Позиції доливаються і в уже збережений чек, якщо їх там НУЛЬ.** Чек —
 * незмінний снапшот, тож наявні позиції ніколи не перезаписуються; але
 * «немає жодної» — це не снапшот, а діра, і закривати її має найближчий
 * синк, а не ніхто.
 *
 * Навіщо. Офлайн-чек Сільпо зʼявляється у `silpo_get_my_offline_orders`
 * раніше, ніж до нього доїжджають `products[]` — тобто синк, який
 * приземлився в цю щілину (а ввечері, одразу після покупки, він у неї й
 * приземляється), зберігав ГОЛОВУ чека без жодної позиції. Далі
 * `ON CONFLICT DO NOTHING` + `if (!inserted) return` замикали це
 * НАЗАВЖДИ: наступні синки бачили рядок на місці й не чіпали його, а в
 * інтерфейсі чек лишався вічним «Знайдено чек, але позиції ще не
 * завантажились» — гірше за відсутній, бо виглядає як робочий.
 *
 * Гонки тут немає: обидва шляхи (перша вставка й доливка) ідуть в одній
 * транзакції з тим самим `ON CONFLICT`-ключем, а порожній набір позицій
 * нікуди не пише.
 */
export async function upsertReceipt(
  userId: string,
  channel: "online" | "offline",
  receipt: ParsedReceipt,
  withTransaction: SilpoTransactionRunner,
): Promise<{ inserted: boolean; itemsInserted: number }> {
  return withTransaction(async (queryFn) => {
    const res = await queryFn(
      `INSERT INTO silpo_receipts
         (user_id, receipt_id, purchased_at, store_id, channel, payment_hint, total_kop, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, receipt_id) DO NOTHING`,
      [
        userId,
        receipt.receiptId,
        new Date(receipt.purchasedAtMs),
        receipt.storeId,
        channel,
        receipt.paymentHint,
        receipt.totalKop,
        JSON.stringify(receipt.raw),
      ],
      { op: "silpo_receipt_upsert" },
    );
    const inserted = (res.rowCount ?? 0) > 0;
    if (receipt.items.length === 0) return { inserted, itemsInserted: 0 };
    if (!inserted) {
      // Чек уже лежав. Доливаємо позиції РІВНО якщо їх нуль — інакше це
      // був би перезапис незмінного снапшоту.
      const { rows: itemCountRows } = await queryFn<{ n: number }>(
        `SELECT COUNT(*)::int AS n
           FROM silpo_receipt_items
          WHERE user_id = $1 AND receipt_id = $2`,
        [userId, receipt.receiptId],
        { op: "silpo_receipt_items_count" },
      );
      if (Number(itemCountRows[0]?.n ?? 0) > 0) {
        return { inserted, itemsInserted: 0 };
      }
    }

    // Multi-row VALUES insert — receipt.items.length is bounded by a single
    // Silpo order (tens, not thousands), so one round-trip is fine.
    const values: unknown[] = [];
    const rows: string[] = [];
    let i = 1;
    for (const item of receipt.items) {
      rows.push(
        `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
      );
      values.push(
        userId,
        receipt.receiptId,
        item.name,
        item.qty,
        item.unit,
        item.priceKop,
        item.categorySlug,
        item.barcode,
      );
    }
    await queryFn(
      `INSERT INTO silpo_receipt_items
         (user_id, receipt_id, name, qty, unit, price_kop, category_slug, barcode)
       VALUES ${rows.join(", ")}`,
      values,
      { op: "silpo_receipt_items_insert" },
    );
    if (!inserted) {
      // Доливка, а не перша вставка — окремий рядок у лозі, бо це сигнал
      // про щілину «голова чека вже є, позицій ще не було», а не про
      // звичайний новий чек.
      logger.info({
        msg: "silpo_receipt_items_backfilled",
        channel,
        items: receipt.items.length,
      });
    }
    return { inserted, itemsInserted: receipt.items.length };
  });
}
