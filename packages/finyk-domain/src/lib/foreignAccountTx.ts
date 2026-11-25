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
 * Гривнева сума операції з чужого рахунку (`operationAmount` при
 * `currencyCode === 980`) свідомо НЕ рахується: сервер взагалі не віддає
 * операцій валютних рахунків (`GET /api/mono/transactions`), баланс цього
 * рахунку в капітал не йде, і порахована лише одна нога дала б розбіжність
 * між поверхнями. Операція лишається видимою, але поза гривневим обліком.
 */

import { CURRENCY } from "../constants";

interface ForeignAccountTxLike {
  amount?: number | undefined;
  operationAmount?: number | undefined;
  currencyCode?: number | undefined;
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
