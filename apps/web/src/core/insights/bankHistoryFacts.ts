/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Три факти з історії банку для хаба новачка (С-4 (б), П-21 (А), спека
 * `docs/work/specs/hub-newcomer-card-and-insights.md`). Рахує код, не модель,
 * тож усе тут рівня «факт» (канон hub-coach § 6.2). Нових порогів немає:
 *
 * - найбільша категорія — `getTopCategories` (той самий селектор, що в
 *   Аналітиці Фініка);
 * - регулярні платежі — `detectRecurring` з його вікнами за замовчуванням
 *   (той самий рушій, що в «Регулярних платежах» Фініка);
 * - третій факт — «найдорожчий день тижня», коли історії три місяці
 *   (число назвав founder, П-21), до того «найбільша разова операція».
 *
 * AI-NOTE: «три місяці історії» рахуються за найранішою операцією у вході,
 * бо Фінік ще не віддає селектора глибини історії (спека, В-3). Коли він
 * зʼявиться, підстав його в `historyStartKey`.
 */
import { getTopCategories } from "@sergeant/finyk-domain/domain/selectors";
import type {
  Category,
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import { detectRecurring } from "@sergeant/finyk-domain/lib/recurringDetect";
import { getKyivDayKey, getKyivMondayIndex } from "@shared/lib/time/kyivTime";

/** П-21 (А), відповідь founder-а 2026-11-18. */
export const WEEKDAY_FACT_MIN_HISTORY_MONTHS = 3;

export interface BankTopCategoryFact {
  label: string;
  /** Гривні, округлені (як у `getTopCategories`). */
  spent: number;
  /** Частка від усіх витрат, відсотки. */
  pct: number;
}

export interface BankRecurringFact {
  count: number;
  biggestName: string;
  /** Середня сума найбільшого платежу в одиницях валюти (не копійках). */
  biggestAmount: number;
  currency: "UAH" | "USD";
}

export type BankThirdFact =
  | {
      kind: "weekday";
      /** 0 = понеділок … 6 = неділя (київська доба). */
      mondayIndex: number;
      /** Середня витрата на один такий день у вікні, копійки. */
      avgMinor: number;
    }
  | {
      kind: "largest";
      /** Модуль суми найбільшої витрати, копійки. */
      amountMinor: number;
      description: string;
      /** Unix seconds. */
      time: number;
    };

export interface BankHistoryFacts {
  topCategory: BankTopCategoryFact | null;
  recurring: BankRecurringFact | null;
  third: BankThirdFact | null;
}

export interface BankHistoryFactsOptions {
  txCategories?: TxCategoriesMap | undefined;
  txSplits?: TxSplitsMap | undefined;
  customCategories?: Category[] | undefined;
  /** «Зараз», мс. За замовчуванням `Date.now()`. */
  nowMs?: number | undefined;
}

const DAY_MS = 86_400_000;

function dayKeyToUtcMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Той самий календарний день `months` місяців тому (кінець місяця обрізається). */
export function shiftDayKeyMonths(key: string, months: number): string {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Чи покриває історія від `historyStartKey` до `todayKey` три місяці. */
export function hasWeekdayFactHistory(
  historyStartKey: string,
  todayKey: string,
): boolean {
  return (
    historyStartKey <=
    shiftDayKeyMonths(todayKey, WEEKDAY_FACT_MIN_HISTORY_MONTHS)
  );
}

function isExpense(tx: Transaction): boolean {
  return Number.isFinite(tx.amount) && tx.amount < 0;
}

function weekdayFact(
  expenses: readonly Transaction[],
  startKey: string,
  todayKey: string,
): BankThirdFact | null {
  const sums = new Array<number>(7).fill(0);
  for (const tx of expenses) {
    const idx = getKyivMondayIndex(tx.time * 1000);
    sums[idx] = (sums[idx] ?? 0) + Math.abs(tx.amount);
  }
  // Знаменник — кількість таких днів тижня у вікні, а не днів з операціями:
  // день, що трапився у вікні на раз більше, не має вигравати кількістю.
  const counts = new Array<number>(7).fill(0);
  const end = dayKeyToUtcMs(todayKey);
  for (let t = dayKeyToUtcMs(startKey); t <= end; t += DAY_MS) {
    const idx = (new Date(t).getUTCDay() + 6) % 7;
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  let best: BankThirdFact | null = null;
  for (let i = 0; i < 7; i++) {
    const count = counts[i] ?? 0;
    if (count === 0) continue;
    const avgMinor = Math.round((sums[i] ?? 0) / count);
    if (avgMinor <= 0) continue;
    if (!best || (best.kind === "weekday" && avgMinor > best.avgMinor)) {
      best = { kind: "weekday", mondayIndex: i, avgMinor };
    }
  }
  return best;
}

function largestFact(expenses: readonly Transaction[]): BankThirdFact | null {
  let top: Transaction | null = null;
  for (const tx of expenses) {
    if (!top || tx.amount < top.amount) top = tx;
  }
  if (!top) return null;
  return {
    kind: "largest",
    amountMinor: Math.abs(top.amount),
    description: String(top.description ?? "").trim(),
    time: top.time,
  };
}

export function buildBankHistoryFacts(
  transactions: readonly Transaction[],
  options: BankHistoryFactsOptions = {},
): BankHistoryFacts {
  const nowMs = options.nowMs ?? Date.now();
  const expenses = transactions.filter(isExpense);

  const top = getTopCategories(
    transactions,
    {
      txCategories: options.txCategories,
      txSplits: options.txSplits,
      customCategories: options.customCategories,
    },
    1,
  )[0];
  const topCategory: BankTopCategoryFact | null =
    top && top.spent > 0
      ? { label: top.label, spent: top.spent, pct: top.pct }
      : null;

  const candidates = detectRecurring(
    transactions as Parameters<typeof detectRecurring>[0],
    { nowSec: Math.floor(nowMs / 1000) },
  );
  let recurring: BankRecurringFact | null = null;
  if (candidates.length > 0) {
    const biggest = candidates.reduce((a, b) =>
      b.avgAmount > a.avgAmount ? b : a,
    );
    recurring = {
      count: candidates.length,
      biggestName: biggest.displayName || biggest.key,
      biggestAmount: biggest.avgAmount,
      currency: biggest.currency,
    };
  }

  let third: BankThirdFact | null = null;
  if (expenses.length > 0) {
    const todayKey = getKyivDayKey(nowMs);
    // Глибина історії — від найранішої операції будь-якого знака: місяць
    // лише з надходженнями теж є історією банку.
    const earliest = transactions.reduce(
      (min, tx) => (Number.isFinite(tx.time) && tx.time < min ? tx.time : min),
      Number.POSITIVE_INFINITY,
    );
    const historyStartKey = getKyivDayKey(earliest * 1000);
    third = hasWeekdayFactHistory(historyStartKey, todayKey)
      ? weekdayFact(expenses, historyStartKey, todayKey)
      : largestFact(expenses);
  }

  return { topCategory, recurring, third };
}

export function hasAnyBankHistoryFact(facts: BankHistoryFacts): boolean {
  return Boolean(facts.topCategory || facts.recurring || facts.third);
}
