import { toKyivISODate } from "@sergeant/shared";
import {
  getTxStatAmount,
  txTimeMs,
  type SpendingTxLike,
  type TxSplitsLike,
} from "./transactions.js";

interface Tx extends SpendingTxLike {
  time?: number;
}

export interface DailySpendSeriesWindow {
  /** Київський рік цільового місяця. */
  year: number;
  /** Київський місяць, 1-12 (не 0-based — узгоджено з `getKyivDateParts`). */
  month: number;
  daysInMonth: number;
}

export interface DailySpendSeriesOptions {
  /**
   * Та сама множина, що дає `spent` у `useOverviewData`
   * (`filterStatTransactions`): приховані користувачем записи, підтверджені
   * внутрішні перекази й транзакції, явно позначені «не в статистиці».
   * Селектор навмисно НЕ дублює правило визначення переказу — воно вже
   * застосоване до моменту, коли транзакція потрапляє в `excludedTxIds`.
   */
  excludedTxIds?: Set<string> | string[];
  txSplits?: TxSplitsLike;
}

export interface DailySpendDay {
  dayKey: string;
  /**
   * UAH (ті самі одиниці, що й `spent`/`dayBudget` в Overview — не копійки).
   * Округлено до гривні, як і денні підсумки `calcFinykSpendingByDate`.
   */
  spent: number;
}

/**
 * Витрати ФІНІК по кожному дню місяця, за київським день-ключем.
 *
 * Завжди повертає рівно `daysInMonth` елементів (по одному на кожен день,
 * включно з днями без жодної транзакції — `spent: 0`), у хронологічному
 * порядку. Виключення (`excludedTxIds`) і сплити (`txSplits`) рахуються за
 * тими самими правилами, що вже дають `spent` у `useOverviewData`
 * (`calcFinykSpendingTotal`/`filterStatTransactions`) — той самий
 * предикат, не окрема копія.
 *
 * Межі «сьогодні» селектор не знає і не потребує: майбутні дні виходять з
 * `spent: 0` самі, бо транзакцій у них ще немає. Ділити минуле/майбутнє —
 * робота `MonthStrip`, який має `todayKey`.
 */
export function dailySpendSeries(
  transactions: readonly Tx[] | null | undefined,
  { year, month, daysInMonth }: DailySpendSeriesWindow,
  { excludedTxIds, txSplits = {} }: DailySpendSeriesOptions = {},
): DailySpendDay[] {
  const list = Array.isArray(transactions) ? transactions : [];
  const excluded =
    excludedTxIds instanceof Set
      ? excludedTxIds
      : new Set(Array.isArray(excludedTxIds) ? excludedTxIds : []);

  const byDay = new Map<string, number>();
  for (const t of list) {
    if (!t || excluded.has(t.id)) continue;
    if (!(t.amount < 0)) continue;
    const ms = txTimeMs(t.time);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const amt = getTxStatAmount(t, txSplits);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const dayKey = toKyivISODate(ms);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + amt);
  }

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const days: DailySpendDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayKey = `${monthPrefix}-${String(d).padStart(2, "0")}`;
    days.push({ dayKey, spent: Math.round(byDay.get(dayKey) ?? 0) });
  }
  return days;
}
