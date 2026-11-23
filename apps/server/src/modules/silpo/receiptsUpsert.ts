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
import { silpoReceiptsSkippedTotal } from "../../obs/metrics/silpo.js";
import { loadReceiptsWipedAtMs } from "./receiptsWipe.js";
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

/** Одинокий сурогат UTF-16 (половина пари без другої половини). */
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Готує значення до запису в Postgres, рекурсивно по рядках і ключах:
 * прибирає U+0000 і міняє одинокі сурогати на U+FFFD.
 *
 * Postgres не приймає NUL ні в TEXT (`invalid byte sequence`), ні в JSONB
 * (`unsupported Unicode escape sequence` на `\u0000`), а JSONB ще й
 * одинокий сурогат, який `JSON.stringify` пише як `\ud800`. Сільпо віддає
 * назви товарів і сирий order як є, тож один такий символ у будь-якому полі
 * валив запис чека (аудит 2026-10-01, rel-32). Чистимо саме значення, а не
 * готовий JSON-рядок: заміна в тексті JSON зламала б екранований зворотний
 * слеш перед літеральним `u0000`.
 */
export function sanitizeForPg<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replaceAll("\u0000", "")
      .replace(LONE_SURROGATE_RE, "\uFFFD") as T;
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeForPg(v)) as T;
  if (
    value !== null &&
    typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[sanitizeForPg(k)] = sanitizeForPg(v);
    }
    return out as T;
  }
  return value;
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
  rawReceipt: ParsedReceipt,
  withTransaction: SilpoTransactionRunner,
): Promise<{ inserted: boolean; itemsInserted: number }> {
  const receipt = sanitizeForPg(rawReceipt);
  return withTransaction(async (queryFn) => {
    // Маркер wipe перечитуємо ТУТ, у транзакції запису: синк, що почався до
    // `POST /api/silpo/wipe`, читав маркер раз на старті і дописував чеки
    // вже після стирання (аудит 2026-10-01, data-47).
    const wipedAtMs = await loadReceiptsWipedAtMs(userId, queryFn);
    if (wipedAtMs !== null && receipt.purchasedAtMs <= wipedAtMs) {
      return { inserted: false, itemsInserted: 0 };
    }
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

/**
 * Пише чеки одного каналу по одному, і збій запису ОДНОГО чека не валить
 * решту синку: чек пропускається з логом і метрикою.
 *
 * До цього цикл у `pullAndSyncReceipts` не мав try/catch, і будь-яка
 * помилка БД на одному чеку виходила з синку як 500: наступні чеки не
 * писались, матчер не біг, а полер щогодини повторював той самий збій
 * (аудит 2026-10-01, rel-32). Кожен чек — окрема транзакція, тож пропуск
 * не лишає напівзаписаних рядків, а наступний синк спробує чек знову.
 *
 * У лог іде лише SQLSTATE і клас помилки: текст і `detail` Postgres можуть
 * нести значення полів покупки (Hard Rule #21).
 *
 * Пропуски повертаються викликачу: без них системний збій (пул вичерпано,
 * БД лягла) пропускав УСІ чеки, а синк однаково писав `last_sync_at` і гасив
 * плашку збою — тобто зламаний синк виглядав успішним. Див.
 * {@link isReceiptWriteDegraded}.
 */
export async function upsertReceiptsIsolated(
  userId: string,
  channel: "online" | "offline",
  receipts: readonly ParsedReceipt[],
  withTransaction: SilpoTransactionRunner,
): Promise<ReceiptsWriteResult> {
  let receiptsInserted = 0;
  let itemsInserted = 0;
  let skipped = 0;
  let systemicSkipped = 0;
  for (const receipt of receipts) {
    try {
      const r = await upsertReceipt(userId, channel, receipt, withTransaction);
      if (r.inserted) receiptsInserted++;
      itemsInserted += r.itemsInserted;
    } catch (err) {
      skipped++;
      silpoReceiptsSkippedTotal.inc({ channel });
      const code = (err as { code?: unknown } | null)?.code;
      const pgCode = typeof code === "string" ? code : null;
      if (!isDataLevelSqlState(pgCode)) systemicSkipped++;
      logger.warn({
        msg: "silpo_receipt_upsert_skipped",
        channel,
        pgCode,
        errName: err instanceof Error ? err.name : typeof err,
      });
    }
  }
  return { receiptsInserted, itemsInserted, skipped, systemicSkipped };
}

/** Підсумок запису чеків одного каналу. */
export interface ReceiptsWriteResult {
  receiptsInserted: number;
  itemsInserted: number;
  /** Чеки, чий запис упав і які пропущено. */
  skipped: number;
  /** З них — ті, що впали НЕ з причини даних (див. {@link isDataLevelSqlState}). */
  systemicSkipped: number;
}

/**
 * SQLSTATE класу 22 (кривий формат значення) або 23 (порушене обмеження) —
 * збій ОДНОГО чека через його дані. Усе інше (немає коду, 08 зʼєднання,
 * 53 ресурси, 57 адмін-зупинка, XX000) — збій бази, а не чека.
 */
function isDataLevelSqlState(code: string | null): boolean {
  return code !== null && /^2[23][0-9A-Z]{3}$/.test(code);
}

/**
 * Чи лишати після синку слід провалу замість успіху: так, лише якщо хоч один
 * чек упав із системної причини (не data-level SQLSTATE). Збій через дані
 * одного чека (клас 22/23, «отруйний» чек із rel-32) провалом НЕ вважається
 * навіть тоді, коли нічого не записано: чеки незмінні, тож синк без нових
 * покупок нормально пише нуль, і один вічно битий чек тримав би плашку
 * збою й гальмував `last_sync_at` (повтор щогодини замість 8 год, ревʼю PR).
 */
export function isReceiptWriteDegraded(
  results: readonly ReceiptsWriteResult[],
): boolean {
  return results.some((r) => r.systemicSkipped > 0);
}
