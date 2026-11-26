/**
 * Last validated: 2026-11-25
 * Status: Active
 *
 * Операції не-гривневих рахунків Monobank (канон finyk, Журнал рішень
 * 2026-11-25; продукт UAH-only без FX, §13).
 *
 * AI-CONTEXT: у Monobank `amount` лежить у валюті РАХУНКУ (центи для
 * USD-картки), `operationAmount` у валюті ОПЕРАЦІЇ, а `currencyCode` — валюта
 * операції. Валюта рахунку в самій операції не приходить, тож її видно лише
 * з порівняння сум:
 * - `amount === operationAmount` → валюта рахунку = `currencyCode`;
 * - `currencyCode === 980` і суми різні → рахунок НЕ гривневий (операція в
 *   гривні, а списано в іншій валюті), точний код невідомий;
 * - `currencyCode !== 980` і суми різні → найчастіше гривневий рахунок із
 *   валютною покупкою (`amount` уже в гривні), тож це НЕ чужий рахунок.
 *
 * Від спеки `finyk-fx-nbu.md` (2026-11-25) сервер віддає валюту рахунку
 * (`accountCurrencyCode`) і гривневу суму за курсом НБУ (`amountUah`), а
 * `normalizeTransaction` ставить її в `amount`. Тоді операція входить у
 * гривневий облік, і «чужою» лишається лише без курсу. Евристика за сумами
 * нижче працює для операцій без цих полів (вебхук у реальному часі, старий
 * сервер): поза обліком, доки читання не принесе курс.
 */

import { CURRENCY } from "../constants";

interface ForeignAccountTxLike {
  amount?: number | undefined;
  operationAmount?: number | undefined;
  currencyCode?: number | undefined;
  accountCurrencyCode?: unknown;
  amountUah?: unknown;
}

const UAH = CURRENCY.UAH as number;

/**
 * Код валюти рахунку, якщо операція належить не-гривневому рахунку:
 * число (ISO-4217) коли його видно з суми, `0` коли рахунок точно не
 * гривневий, але код невідомий, `null` коли операція гривнева або ручна.
 */
export function foreignAccountCurrencyCode(
  tx: ForeignAccountTxLike | null | undefined,
): number | null {
  if (!tx) return null;
  if (
    typeof tx.accountCurrencyCode === "number" &&
    Number.isInteger(tx.accountCurrencyCode)
  ) {
    const converted =
      typeof tx.amountUah === "number" && Number.isFinite(tx.amountUah);
    return tx.accountCurrencyCode === UAH || converted
      ? null
      : tx.accountCurrencyCode;
  }
  const { amount, operationAmount, currencyCode } = tx;
  if (
    typeof amount !== "number" ||
    typeof operationAmount !== "number" ||
    typeof currencyCode !== "number" ||
    !Number.isFinite(currencyCode)
  ) {
    return null;
  }
  if (amount === operationAmount) {
    return currencyCode === UAH ? null : currencyCode;
  }
  return currencyCode === UAH ? 0 : null;
}

/** `true`, якщо `amount` операції не в гривні (поза гривневим обліком). */
export function isForeignAccountTx(
  tx: ForeignAccountTxLike | null | undefined,
): boolean {
  return foreignAccountCurrencyCode(tx) !== null;
}
