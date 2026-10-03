// Локальний звіт тижня без AI (фаза 5 спеки аналітики v2, Р23).
//
// Факти з тих самих селекторів, що й решта аналітики: скільки витрачено за
// тиждень проти того самого відрізка минулого, на що пішло найбільше, що
// виросло найбільше (відсоток за правилом Р4) і ліміт із найгіршим темпом
// (Р8). «Тиждень» — календарний пн–нд за Києвом, і порівнюються однакові
// відрізки (`weekSliceWindows`, рішення власника 2026-10-01): це те саме
// вікно, що читає картка «Витрати на N% вище ніж минулого тижня», тож числа
// картки й звіту збігаються. Працює з переданим списком, тож і офлайн, і
// анонімно.
import { resolveExpenseCategoryMeta, txTimeMs } from "../utils";
import { compareAmounts, computeCategorySpendIndex } from "./selectors";
import { calcLimitUsages, type LimitUsageEntry } from "./budget";
import { weekSliceWindows } from "./weekSlices";
import type {
  AmountDelta,
  Budget,
  Category,
  Transaction,
  TxSplitsMap,
} from "./types";

export interface WeekCategoryFact {
  categoryId: string;
  label: string;
  spentMinor: number;
}

export interface WeekGrowthFact extends WeekCategoryFact {
  prevMinor: number;
  delta: AmountDelta;
}

export interface WeekTotalFact {
  /** Витрати цього тижня від понеділка до сьогодні, копійки. */
  spentMinor: number;
  /** Витрати за ті самі дні минулого тижня, копійки. */
  prevMinor: number;
  /** Відсоток — лише коли попередня сума є базою (Р4). */
  delta: AmountDelta;
}

export interface WeekReport {
  /** На цьому календарному тижні (від понеділка до сьогодні) є хоч один запис. */
  hasRecords: boolean;
  /** Підсумок тижня проти того самого відрізка минулого; `null`, коли витрат за тиждень ще немає. */
  total: WeekTotalFact | null;
  top: WeekCategoryFact | null;
  growth: WeekGrowthFact | null;
  /** Ліміт із найбільшим відношенням прогнозу (або факту) до ліміту. */
  limit: LimitUsageEntry | null;
}

export interface WeekReportOptions {
  budgets?: readonly Budget[] | null | undefined;
  txCategories?: Record<string, string | undefined> | undefined;
  txSplits?: TxSplitsMap | undefined;
  customCategories?: Category[] | undefined;
  now?: Date | undefined;
}

/**
 * `transactions` вже без прихованих і виключених зі статистики: це той самий
 * всесвіт, що читають хаб-інсайти (`filterStatTransactions`).
 */
export function buildWeekReport(
  transactions: readonly Transaction[],
  opts: WeekReportOptions = {},
): WeekReport {
  const {
    budgets,
    txCategories = {},
    txSplits = {},
    customCategories = [],
    now = new Date(),
  } = opts;
  // Календарний тиждень за Києвом: від понеділка до кінця сьогодні проти
  // тих самих днів минулого тижня.
  const { current, previous } = weekSliceWindows(now);

  const week: Transaction[] = [];
  const prev: Transaction[] = [];
  for (const tx of transactions) {
    const ms = txTimeMs(tx.time);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    if (ms >= current.startMs && ms < current.endMs) week.push(tx);
    else if (ms >= previous.startMs && ms < previous.endMs) prev.push(tx);
  }

  const index = { txSplits, txCategories, customCategories };
  const weekIndex = computeCategorySpendIndex(week, index);
  const prevIndex = computeCategorySpendIndex(prev, index);
  const curr = weekIndex.catSpend;
  const before = prevIndex.catSpend;
  const label = (id: string) =>
    resolveExpenseCategoryMeta(id, customCategories)?.label ?? "Інше";

  let top: WeekCategoryFact | null = null;
  let growth: WeekGrowthFact | null = null;
  for (const [categoryId, spent] of Object.entries(curr)) {
    const spentMinor = Math.round(spent * 100);
    if (spentMinor <= 0) continue;
    if (!top || spentMinor > top.spentMinor) {
      top = { categoryId, label: label(categoryId), spentMinor };
    }
    const prevMinor = Math.round((before[categoryId] ?? 0) * 100);
    const delta = compareAmounts(spentMinor, prevMinor);
    // Зростання має сенс лише проти тижня, де категорія вже була: нова
    // категорія не «виросла», а «зʼявилась».
    if (prevMinor > 0 && delta.diffMinor > 0) {
      if (!growth || delta.diffMinor > growth.delta.diffMinor) {
        growth = {
          categoryId,
          label: label(categoryId),
          spentMinor,
          prevMinor,
          delta,
        };
      }
    }
  }

  let limit: LimitUsageEntry | null = null;
  let worst = -1;
  for (const usage of calcLimitUsages(budgets, transactions, {
    txCategories,
    txSplits,
    customCategories,
    now,
  })) {
    const ratio = (usage.forecast ?? usage.spent) / usage.limit;
    if (usage.spent > 0 && ratio > worst) {
      worst = ratio;
      limit = usage;
    }
  }

  const hasRecords = week.length > 0;
  const spentMinor = Math.round(weekIndex.totalSpent * 100);
  const prevMinor = Math.round(prevIndex.totalSpent * 100);
  return {
    hasRecords,
    total:
      spentMinor > 0
        ? {
            spentMinor,
            prevMinor,
            delta: compareAmounts(spentMinor, prevMinor),
          }
        : null,
    top,
    growth,
    limit,
  };
}
