/**
 * Борг по кредитній картці Monobank — окрема математика від ручного пасиву.
 *
 * AI-CONTEXT: тут НЕМАЄ ролей привʼязки (`debtEngine.LinkedTxRole`) і це
 * навмисно. Залишок боргу приходить з банку (`getMonoDebt(account)`), а не
 * з введеної вручну суми, тож подвійного обліку «джерела боргу» — проблеми,
 * заради якої ролі й зʼявились, — тут не існує. Привʼязка відповідає лише на
 * одне питання: чи ця операція погашає борг.
 */

export interface MonoCardTx {
  id: string;
  amount: number;
  /** Рахунок операції; `null` — ручний запис (готівка). */
  _accountId?: string | null | undefined;
}

/**
 * Чи є операція погашенням боргу по картці `cardAccountId`.
 *
 * Погашення — рівно два випадки:
 *  - **надходження на саму картку** (поповнення, `amount > 0`);
 *  - **витрата з іншого рахунку** (переказ на картку, `amount < 0`).
 *
 * Дзеркально, погашенням НЕ є:
 *  - витрата по самій картці — це покупка, вона борг збільшує;
 *  - надходження на інший рахунок — зарплата на дебетку картки не торкалась.
 *
 * До 2026-08 друга пара не перевірялася: правило відсіювало лише покупку по
 * картці, тож привʼязане надходження на будь-який інший рахунок мовчки
 * рахувалось погашенням.
 */
export function isMonoCardRepayment(
  tx: MonoCardTx,
  cardAccountId: string,
): boolean {
  const amount = tx?.amount || 0;
  if (amount === 0) return false;
  const onCard = tx?._accountId === cardAccountId;
  return onCard ? amount > 0 : amount < 0;
}

/**
 * Сума погашеного по картці, у **гривнях**.
 *
 * `transactions` має бути ПОВНИМ набором, а не звуженим пошуком чи вибором
 * періоду: інакше сума погашеного стрибає від того, який фільтр відкритий.
 */
export function sumMonoCardPaid(
  transactions: readonly MonoCardTx[] = [],
  linkedTxIds: readonly string[] = [],
  cardAccountId: string,
): number {
  const linked = new Set(linkedTxIds);
  return transactions
    .filter((tx) => linked.has(tx.id) && isMonoCardRepayment(tx, cardAccountId))
    .reduce((sum, tx) => sum + Math.abs((tx.amount || 0) / 100), 0);
}

/**
 * Чи варто підсвітити операцію як ймовірне погашення ще до привʼязки.
 * Вужче за `isMonoCardRepayment`: підказуємо лише очевидне поповнення самої
 * картки, щоб не радити користувачу кожну витрату з дебетки.
 */
export function isSuggestedMonoCardRepayment(
  tx: MonoCardTx,
  cardAccountId: string,
): boolean {
  return tx?._accountId === cardAccountId && (tx?.amount || 0) > 0;
}
