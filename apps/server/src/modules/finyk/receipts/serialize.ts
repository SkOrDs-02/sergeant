/**
 * DB-row → wire-shape серіалізатори для чек-скану (Hard Rule #1).
 *
 * `pg` повертає `bigint`-колонки як **рядки** (`receipts.id`,
 * `receipts.total_kopiykas`, `receipt_items.id`, `receipt_items.receipt_id`,
 * `receipt_items.price_kopiykas`, `receipt_items.sum_kopiykas` — усі
 * зафіксовані в звіті migration-agent-а) — `Number()` тут явний, попри те,
 * що `db.ts#installInt8Parser()` уже коерсить int8 глобально на рівні
 * драйвера: серіалізатор лишається другим рубежем (Hard Rule #1 вимагає
 * явну коерсію САМЕ тут, незалежно від driver-рівня). `receipt_items.qty
 * NUMERIC(12,3)` — окремий OID (не int8), глобальний парсер його НЕ
 * покриває, тож це поле рядком з `pg` **завжди**, а не лише теоретично.
 */

export interface ReceiptRow {
  id: unknown;
  user_id: string;
  source: string;
  fiscal_num: string | null;
  store_name: string;
  store_tax_id: string | null;
  purchased_at: Date | string;
  total_kopiykas: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ReceiptItemRow {
  id: unknown;
  receipt_id: unknown;
  position: number;
  name: string;
  qty: unknown;
  price_kopiykas: unknown;
  sum_kopiykas: unknown;
}

export interface ReceiptLinkRow {
  tx_kind: string;
  tx_ref: string;
}

export interface SerializedReceiptItem {
  id: number;
  receiptId: number;
  position: number;
  name: string;
  qty: number;
  priceKopiykas: number;
  sumKopiykas: number;
}

export interface SerializedReceiptLink {
  txKind: string;
  txRef: string;
}

export interface SerializedReceipt {
  id: number;
  source: string;
  fiscalNum: string | null;
  store: string;
  storeTaxId: string | null;
  purchasedAt: string;
  totalKopiykas: number;
  items: SerializedReceiptItem[];
  link: SerializedReceiptLink | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Коерсить довільне DB-поле (bigint-рядок, numeric-рядок, або вже
 * `number`, якщо драйверний парсер випередив) у `number`. Кидає, а не
 * тихо повертає `0`/`NaN` — biint/numeric-поле, що не коерситься, це
 * driver-аномалія (issue #708 у Hard Rule #1: мовчазний `NaN`/string leak
 * ламає арифметику клієнта непомітно, тому тут — fail loud, не fail
 * silent).
 *
 * Використовуй ЛИШЕ для полів, що можуть бути легітимно дробовими (`qty
 * NUMERIC(12,3)`) — для цілочисельних bigint-полів (`id`, `receipt_id`,
 * `*_kopiykas`) використовуй `toSafeIntegerOrThrow` нижче.
 */
function toNumberOrThrow(v: unknown, field: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(
      `serializeReceipt: не вдалось коерсити поле "${field}" (${String(v)}) у number`,
    );
  }
  return n;
}

/**
 * Той самий коерсійний рубіж, що `toNumberOrThrow`, але для ЦІЛОЧИСЕЛЬНИХ
 * bigint-полів (`id`, `receipt_id`, `price_kopiykas`, `sum_kopiykas`,
 * `total_kopiykas`) — вимагає `Number.isSafeInteger`, не лише
 * `Number.isFinite` (review-фікс MAJOR). `Number.isFinite` пропускає
 * значення поза `Number.MAX_SAFE_INTEGER` (2^53-1): рядок
 * `"9007199254740993"` конвертується в `Number(...)` у
 * `9007199254740992` — ТИХЕ округлення bigint, не помічене
 * `Number.isFinite`, яке ламає арифметику клієнта непомітно (той самий
 * клас бага, що і string-leak issue #708, лише на іншому краю). `qty`
 * ЛИШАЄТЬСЯ на `toNumberOrThrow` — воно легітимно дробове
 * (`NUMERIC(12,3)`), вимагати ціле там некоректно.
 */
function toSafeIntegerOrThrow(v: unknown, field: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isSafeInteger(n)) {
    throw new Error(
      `serializeReceipt: поле "${field}" (${String(v)}) поза Number.MAX_SAFE_INTEGER — bigint мовчки округлився б`,
    );
  }
  return n;
}

function isoOf(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

export function serializeReceiptItem(
  row: ReceiptItemRow,
): SerializedReceiptItem {
  return {
    id: toSafeIntegerOrThrow(row.id, "id"),
    receiptId: toSafeIntegerOrThrow(row.receipt_id, "receipt_id"),
    position: row.position,
    name: row.name,
    qty: toNumberOrThrow(row.qty, "qty"),
    priceKopiykas: toSafeIntegerOrThrow(row.price_kopiykas, "price_kopiykas"),
    sumKopiykas: toSafeIntegerOrThrow(row.sum_kopiykas, "sum_kopiykas"),
  };
}

export function serializeReceipt(
  row: ReceiptRow,
  items: ReceiptItemRow[],
  link: ReceiptLinkRow | null,
): SerializedReceipt {
  return {
    id: toSafeIntegerOrThrow(row.id, "id"),
    source: row.source,
    fiscalNum: row.fiscal_num,
    store: row.store_name,
    storeTaxId: row.store_tax_id,
    purchasedAt: isoOf(row.purchased_at),
    totalKopiykas: toSafeIntegerOrThrow(row.total_kopiykas, "total_kopiykas"),
    items: items.map(serializeReceiptItem),
    link: link ? { txKind: link.tx_kind, txRef: link.tx_ref } : null,
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  };
}
