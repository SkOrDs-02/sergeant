/**
 * Розріз витрат за рахунком (Р4 спеки `finyk-analytics-v3.md`): кожен
 * банківський рахунок окремо, «Готівка на руках» і «Без рахунку».
 *
 * Рахується тим самим правилом, що підсумок місяця (`getMonthlySummary`):
 * той самий excluded-set і та сама сума зі сплітами (`getTxStatAmount`),
 * тож сума рядків дорівнює витратам періоду до копійки, а переказ на
 * готівку в жоден рядок не потрапляє.
 */

import { getTxStatAmount, type TxSplitsLike } from "../lib/transactions.js";

/** Ключ рядка для операцій без рахунку (ручні записи «Без рахунку»). */
export const NO_ACCOUNT_KEY = "_none";

export interface AccountTxLike {
  id: string;
  amount: number;
  accountId?: string | null | undefined;
  _accountId?: string | null | undefined;
}

export interface AccountSpendRow {
  accountKey: string;
  spentMinor: number;
}

export function accountKeyOf(tx: AccountTxLike): string {
  return tx.accountId ?? tx._accountId ?? NO_ACCOUNT_KEY;
}

export function aggregateSpendingByAccount(
  transactions: readonly AccountTxLike[] | null | undefined,
  opts: {
    excludedTxIds?: ReadonlySet<string> | Iterable<string> | null | undefined;
    txSplits?: TxSplitsLike | undefined;
  } = {},
): AccountSpendRow[] {
  const excluded =
    opts.excludedTxIds instanceof Set
      ? opts.excludedTxIds
      : new Set(opts.excludedTxIds ?? []);
  const byKey = new Map<string, number>();
  for (const tx of transactions ?? []) {
    if (!tx || tx.amount >= 0 || excluded.has(tx.id)) continue;
    const minor = Math.round(getTxStatAmount(tx, opts.txSplits) * 100);
    if (minor === 0) continue;
    const key = accountKeyOf(tx);
    byKey.set(key, (byKey.get(key) ?? 0) + minor);
  }
  return [...byKey.entries()]
    .map(([accountKey, spentMinor]) => ({ accountKey, spentMinor }))
    .sort((a, b) => b.spentMinor - a.spentMinor);
}

/** Фільтр Аналітики за рахунком; `null` означає «усі рахунки». */
export function filterByAccountKey<T extends AccountTxLike>(
  transactions: readonly T[],
  accountKey: string | null,
): readonly T[] {
  if (accountKey === null) return transactions;
  return transactions.filter((tx) => accountKeyOf(tx) === accountKey);
}
