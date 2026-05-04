import { getCategory } from "../utils";
import { toLocalISODate } from "@sergeant/shared";
import type { Category, TxCategoriesMap, TxSplitsMap } from "../domain/types";

/** Мінімальний набір полів транзакції, потрібних прогнозу. */
export interface ForecastTransaction {
  id: string;
  time: number;
  amount: number;
  description?: string;
  mcc?: number;
}

export interface ForecastBudget {
  categoryId: string;
  limit: number;
}

export interface ForecastDailyPoint {
  day: number;
  dayKey: string;
  actual: number | null;
  forecast: number | null;
}

export interface ForecastResult {
  categoryId: string;
  limit: number;
  spent: number;
  forecast: number;
  overLimit: boolean;
  overPercent: number;
  avgPerDay: number;
  daysRemaining: number;
  dailyData: ForecastDailyPoint[];
}

type DailySpendingMap = Record<string, Record<string, number>>;

/**
 * Calculates daily spending per category for the current month.
 * Returns an array of { day: Date, amounts: { [categoryId]: number } }.
 */
function buildDailySpending(
  transactions: ForecastTransaction[],
  txCategories: TxCategoriesMap,
  txSplits: TxSplitsMap,
  customCategories: Category[],
  monthStart: Date,
  today: Date,
): DailySpendingMap {
  const dayMap: DailySpendingMap = {};

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const txDate = new Date(tx.time * 1000);
    if (txDate < monthStart || txDate > today) continue;

    const dayKey = toLocalISODate(txDate);
    if (!dayMap[dayKey]) dayMap[dayKey] = {};

    const splits = txSplits[tx.id];
    if (splits && splits.length > 0) {
      for (const s of splits) {
        if (!s.categoryId || s.categoryId === "internal_transfer") continue;
        dayMap[dayKey][s.categoryId] =
          (dayMap[dayKey][s.categoryId] || 0) + (s.amount || 0);
      }
    } else {
      const cat = getCategory(
        tx.description,
        tx.mcc,
        txCategories[tx.id],
        customCategories,
      );
      if (cat.id === "internal_transfer") continue;
      const amt = Math.abs(tx.amount / 100);
      dayMap[dayKey][cat.id] = (dayMap[dayKey][cat.id] || 0) + amt;
    }
  }

  return dayMap;
}

/**
 * calcForecast(transactions, categoryLimits, today, txCategories, txSplits, customCategories)
 *
 * Returns an array of forecast results per category.
 */
export function calcForecast(
  transactions: ForecastTransaction[],
  categoryLimits: ForecastBudget[],
  today?: Date,
  txCategories: TxCategoriesMap = {},
  txSplits: TxSplitsMap = {},
  customCategories: Category[] = [],
): ForecastResult[] {
  const now = today || new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const dayOfMonth = now.getDate();
  const daysElapsed = Math.max(1, dayOfMonth);
  const daysRemaining = daysInMonth - dayOfMonth;

  const dailySpending = buildDailySpending(
    transactions,
    txCategories,
    txSplits,
    customCategories,
    monthStart,
    now,
  );

  return categoryLimits.map((budget) => {
    const { categoryId, limit } = budget;

    // Sum actual spent per day for this category
    let spent = 0;
    const dailyActuals: Record<string, number> = {};
    for (const [dayKey, cats] of Object.entries(dailySpending)) {
      const amt = cats[categoryId] || 0;
      dailyActuals[dayKey] = amt;
      spent += amt;
    }
    spent = Math.round(spent);

    const avgPerDay = spent / daysElapsed;
    const forecast = Math.round(spent + avgPerDay * daysRemaining);

    const overLimit = limit > 0 && forecast > limit;
    const overPercent = overLimit
      ? Math.round(((forecast - limit) / limit) * 100)
      : 0;

    // Build day-by-day chart data for the full month
    const dailyData: ForecastDailyPoint[] = [];
    // Running cumulative for actual
    let cumActual = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(now.getFullYear(), now.getMonth(), d);
      const dayKey = toLocalISODate(dateObj);
      const isPast = d <= dayOfMonth;

      if (isPast) {
        cumActual += dailyActuals[dayKey] || 0;
        dailyData.push({
          day: d,
          dayKey,
          actual: Math.round(cumActual),
          forecast: null,
        });
      } else {
        const projectedCum = Math.round(spent + avgPerDay * (d - dayOfMonth));
        dailyData.push({
          day: d,
          dayKey,
          actual: null,
          forecast: projectedCum,
        });
      }
    }

    // Add a bridge point at today connecting actual to forecast.
    // `dailyData[dayOfMonth - 1]` гарантовано існує: умова `0 < dayOfMonth
    // < daysInMonth` + цикл вище вже наповнив усі дні місяця.
    if (dayOfMonth > 0 && dayOfMonth < daysInMonth) {
      const bridge = dailyData[dayOfMonth - 1];
      if (bridge) bridge.forecast = Math.round(cumActual);
    }

    return {
      categoryId,
      limit,
      spent,
      forecast,
      overLimit,
      overPercent,
      avgPerDay: Math.round(avgPerDay),
      daysRemaining,
      dailyData,
    };
  });
}
