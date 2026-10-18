/**
 * Last validated: 2026-10-09
 * Status: Active
 */
import { readRaw } from "./finykStorage";
import { getCachedFinykSqliteState } from "./sqliteReader";

export const HIDDEN_AMOUNT_MASK = "••••";

/**
 * Синхронний читач прапорця «Приховувати суми» для поверхонь поза модулем
 * Фінік (хаб), де React-контексту модуля немає. Канон: SQLite warm cache
 * (`finyk_prefs.show_balance`), поки кеш холодний або рядка нема, то LS-слот
 * `finyk_show_balance_v1` ("0" = приховано), як у `useFinykStorageSlots`.
 */
export function isFinykBalanceHidden(): boolean {
  const cached = getCachedFinykSqliteState().showBalance;
  if (cached !== null) return !cached;
  return readRaw("finyk_show_balance_v1", "1") === "0";
}

/** «Сума або маска» для хабу: єдине місце, де вирішується, що друкувати. */
export function maskAmount(text: string, hidden = isFinykBalanceHidden()) {
  return hidden ? HIDDEN_AMOUNT_MASK : text;
}

// Число з розділювачами розрядів + ₴ (NBSP/вузький NBSP/пробіл), напр.
// «1 835 ₴», «275,50 ₴». Рядки порад збирає пакет insights, тож маскуємо текст.
const AMOUNT_IN_TEXT = /\d[\d\s.,]*₴/g;

/** Замінює суми в готовому тексті на «••••»; решта тексту лишається. */
export function maskAmountsInText(
  text: string,
  hidden = isFinykBalanceHidden(),
): string {
  return hidden ? text.replace(AMOUNT_IN_TEXT, HIDDEN_AMOUNT_MASK) : text;
}
