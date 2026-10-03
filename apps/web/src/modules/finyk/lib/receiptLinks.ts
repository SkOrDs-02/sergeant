/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Локальний (device-only) кеш `txRef → receiptId` для розгортки
 * транзакції в позиції чека (спека § Розгортка).
 *
 * ЧОМУ ЦЕ ПОТРІБНО (§6 звіту web-agent-а PR #818): `@sergeant/api-client`
 * не має ендпоінта «список чеків користувача» чи «чек за tx-ref» — єдиний
 * спосіб дізнатись `receiptId` для транзакції — це відповідь
 * `saveReceipt()` У МОМЕНТ сканування (`receipt.id` + `receipt.link.txRef`).
 * Тому індикатор «є чек» видно лише для чеків, зісканованих У ЦЬОМУ
 * браузері/пристрої — LS-only, БЕЗ дротяного sync (як `finyk_tx_filters_v1`
 * / `txNotes`, `useFinykStorageSlots.ts` docstring). Це задокументоване
 * обмеження v1, узгоджене зі спекою § Поза скоупом v1 («Історія "моїх
 * чеків" як окремий екран» — теж не в v1).
 *
 * Написано без `useReadonlyPersist`/dual-write/SQLite-mirror навмисно:
 * це не canonical user-editable дані (нічого не втрачається, якщо кеш
 * порожній чи стертий — просто зникає індикатор розгортки), тож
 * підключення до повного sync-конвеєра було б непропорційним для чистого
 * UI-affordance кешу.
 */
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

/** Exported for `useFinykReceiptLinks.test.tsx` — lets the test read/write
 * through the same storage wrapper this module uses, instead of a
 * hand-duplicated key literal poking `localStorage` directly. */
export const RECEIPT_LINKS_KEY = "finyk_receipt_links_v1";

/** Мʼякий кап розміру кешу — best-effort UI affordance, не canonical
 * дані, тож при переповненні просто ріжемо найстаріші (за порядком
 * вставки) записи, а не намагаємось точний LRU. */
const RECEIPT_LINKS_MAX_ENTRIES = 500;

export type ReceiptLinkMap = Readonly<Record<string, number>>;

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** Читає кеш, відкидаючи биті записи (не рядковий ключ / не додатне ціле). */
export function readReceiptLinks(): ReceiptLinkMap {
  const raw = safeReadLS<Record<string, unknown>>(RECEIPT_LINKS_KEY, {});
  if (!raw || typeof raw !== "object") return {};
  const clean: Record<string, number> = {};
  for (const [txRef, receiptId] of Object.entries(raw)) {
    if (txRef && isPositiveInt(receiptId)) clean[txRef] = receiptId;
  }
  return clean;
}

/**
 * Записує один лінк і повертає оновлену карту (для синхронного React
 * `setState` викликачем — без другого читання).
 *
 * Невалідний `receiptId` (не додатне ціле) НЕ записується — раніше писався
 * і мовчки губився на наступному `readReceiptLinks()` (`isPositiveInt`
 * guard там же), тож викликач бачив "запис ніби пройшов", а мапа тихо не
 * росла.
 */
export function writeReceiptLink(
  txRef: string,
  receiptId: number,
): ReceiptLinkMap {
  const existing = readReceiptLinks();
  if (!isPositiveInt(receiptId)) return existing;
  const current = { ...existing };
  current[txRef] = receiptId;
  const keys = Object.keys(current);
  // Прунимо найстаріші за `Object.keys()`-порядком вставки — навмисно БЕЗ
  // перебудови на точний LRU (див. докстрінг капу вище). Це коректно ЛИШЕ
  // тому, що `txRef` ніколи не виглядає як ціле число (mono-id формату
  // `mono:...` чи `crypto.randomUUID()`): рушії JS (спека ES2015+) віддають
  // integer-index-подібні ключі ("0", "1", …) ПЕРШИМИ, порушуючи порядок
  // вставки — саме той порядок, на який спирається зріз нижче.
  if (keys.length > RECEIPT_LINKS_MAX_ENTRIES) {
    for (const staleKey of keys.slice(
      0,
      keys.length - RECEIPT_LINKS_MAX_ENTRIES,
    )) {
      delete current[staleKey];
    }
  }
  safeWriteLS(RECEIPT_LINKS_KEY, current);
  return current;
}
