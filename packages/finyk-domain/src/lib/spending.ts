import {
  getTxStatAmount,
  type TxSplitsLike,
  type SpendingTxLike,
} from "./transactions.js";

interface Tx extends SpendingTxLike {
  time?: number;
}

interface SpendingOptions {
  excludedTxIds?: Set<string> | string[];
  txSplits?: TxSplitsLike;
}

interface SpendingByDateOptions extends SpendingOptions {
  dateSet: Set<string>;
  localDateKeyFn: (date: Date) => string;
}

/**
 * Сумарні витрати ФІНІК за списком транзакцій, з урахуванням excludedTxIds та
 * txSplits (через getTxStatAmount). Ця функція — єдине джерело правди для
 * підрахунку spent у Overview, Звітах та інших місцях. Повертає float — округлення
 * виконується викликачем при виводі.
 */
export function calcFinykSpendingTotal(
  transactions: Tx[] | null | undefined,
  { excludedTxIds, txSplits = {} }: SpendingOptions = {},
): number {
  const list = Array.isArray(transactions) ? transactions : [];
  const excluded =
    excludedTxIds instanceof Set
      ? excludedTxIds
      : new Set(Array.isArray(excludedTxIds) ? excludedTxIds : []);
  let total = 0;
  for (const tx of list) {
    if (!tx || excluded.has(tx.id)) continue;
    if (!(tx.amount < 0)) continue;
    const amt = getTxStatAmount(tx, txSplits);
    if (Number.isFinite(amt) && amt > 0) total += amt;
  }
  return total;
}

/**
 * Підсумовує витрати ФІНІК у заданому діапазоні дат за тими ж правилами, що й
 * Overview. Повертає {total, daily}, причому total = сума округлених daily —
 * це гарантує, що сума стовпчиків на графіку дорівнює числу в картці.
 */
export function calcFinykSpendingByDate(
  transactions: Tx[],
  {
    excludedTxIds,
    txSplits = {},
    dateSet,
    localDateKeyFn,
  }: SpendingByDateOptions,
): { total: number; daily: Record<string, number> } {
  const daily: Record<string, number> = {};
  const list = Array.isArray(transactions) ? transactions : [];
  const excluded =
    excludedTxIds instanceof Set
      ? excludedTxIds
      : new Set(Array.isArray(excludedTxIds) ? excludedTxIds : []);

  for (const tx of list) {
    if (!tx || excluded.has(tx.id)) continue;
    if (!(tx.amount < 0)) continue;
    const ts = (tx.time ?? 0) > 1e10 ? (tx.time ?? 0) : (tx.time ?? 0) * 1000;
    const dk = localDateKeyFn(new Date(ts));
    if (!dateSet.has(dk)) continue;
    const amt = getTxStatAmount(tx, txSplits);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    daily[dk] = (daily[dk] || 0) + amt;
  }

  const dailyRounded: Record<string, number> = {};
  let total = 0;
  for (const k of Object.keys(daily)) {
    // `Object.keys` гарантує, що `daily[k]` визначено, але strict
    // noUncheckedIndexedAccess повертає `T | undefined` — `?? 0` тут
    // safe-fallback для типового задоволення.
    const r = Math.round(daily[k] ?? 0);
    dailyRounded[k] = r;
    total += r;
  }
  return { total, daily: dailyRounded };
}

export interface FinykPeriodAggregate {
  /** Сума витрат у періоді (positive, кругле UAH). */
  totalSpent: number;
  /** Сума надходжень у періоді (positive, кругле UAH). */
  totalIncome: number;
  /** Кількість не виключених транзакцій у періоді (доходи + витрати). */
  txCount: number;
  /**
   * Сума витрат, згрупована за ключем категорії, який повертає
   * `categoryKey`. Якщо `categoryKey` не задано — усі витрати збираються
   * під ключем `"other"`. Значення округлені.
   */
  byCategory: Record<string, number>;
}

export interface FinykPeriodAggregateOptions extends SpendingOptions {
  /** Нижня межа діапазону (мс), включно. */
  start: number;
  /** Верхня межа діапазону (мс), виключно. За замовчуванням +∞. */
  end?: number;
  /**
   * Бакет для транзакції-витрати (amount < 0). Викликається тільки на
   * не виключених expense-транзакціях. Якщо не задано, усі витрати
   * потрапляють у бакет `"other"`.
   */
  categoryKey?: (tx: Tx) => string;
}

/**
 * Зведення Фінік-транзакцій за період: сумарні витрати/доходи, кількість
 * транзакцій та розподіл витрат за категоріями. Єдиний агрегатор, який
 * мають викликати дашборд-споживачі (`useWeeklyDigest`, `useCoachInsight`,
 * Hub-Reports тощо), щоб не дублювати правила фільтрації (excluded ids,
 * splits, sign-aware sum) у власних реалізаціях.
 */
export function calcFinykPeriodAggregate(
  transactions: Tx[] | null | undefined,
  options: FinykPeriodAggregateOptions,
): FinykPeriodAggregate {
  const {
    start,
    end = Number.POSITIVE_INFINITY,
    excludedTxIds,
    txSplits = {},
    categoryKey,
  } = options;

  const list = Array.isArray(transactions) ? transactions : [];
  const excluded =
    excludedTxIds instanceof Set
      ? excludedTxIds
      : new Set(Array.isArray(excludedTxIds) ? excludedTxIds : []);

  let totalSpent = 0;
  let totalIncome = 0;
  let txCount = 0;
  const byCategory: Record<string, number> = {};

  for (const tx of list) {
    if (!tx) continue;
    if (excluded.has(tx.id)) continue;
    const rawTime = tx.time ?? 0;
    const ms = rawTime > 1e10 ? rawTime : rawTime * 1000;
    if (!Number.isFinite(ms) || ms < start || ms >= end) continue;
    txCount++;
    const raw = tx.amount ?? 0;
    if (raw < 0) {
      const amt = getTxStatAmount(tx, txSplits);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      totalSpent += amt;
      const key = categoryKey ? categoryKey(tx) : "other";
      byCategory[key] = (byCategory[key] ?? 0) + amt;
    } else if (raw > 0) {
      totalIncome += raw / 100;
    }
  }

  const byCategoryRounded: Record<string, number> = {};
  for (const k of Object.keys(byCategory)) {
    byCategoryRounded[k] = Math.round(byCategory[k] ?? 0);
  }

  return {
    totalSpent: Math.round(totalSpent),
    totalIncome: Math.round(totalIncome),
    txCount,
    byCategory: byCategoryRounded,
  };
}
