// Локальний звіт тижня без AI (фаза 5 спеки аналітики v2, Р23).
//
// Три факти з тих самих селекторів, що й решта аналітики: на що пішло
// найбільше за 7 днів, що виросло найбільше проти попередніх 7 днів
// (відсоток за правилом Р4) і ліміт із найгіршим темпом (Р8). Працює з
// переданим списком, тож і офлайн, і анонімно.
import { toLocalISODate } from "@sergeant/shared";
import { resolveExpenseCategoryMeta, txTimeMs } from "../utils";
import { compareAmounts, computeCategorySpendIndex } from "./selectors";
import { calcLimitUsages, type LimitUsageEntry } from "./budget";
import type {
  AmountDelta,
  Budget,
  Category,
  Transaction,
  TxSplitsMap,
} from "./types";

export const WEEK_DAYS = 7;

export interface WeekCategoryFact {
  categoryId: string;
  label: string;
  spentMinor: number;
}

export interface WeekGrowthFact extends WeekCategoryFact {
  prevMinor: number;
  delta: AmountDelta;
}

export interface WeekReport {
  /** За останні 7 днів є хоч один запис. */
  hasRecords: boolean;
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

function dayKeyShift(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
  // Межі тижня в київських днях: сьогодні і шість попередніх.
  const today = toLocalISODate(now);
  const weekStart = dayKeyShift(today, -(WEEK_DAYS - 1));
  const prevStart = dayKeyShift(weekStart, -WEEK_DAYS);

  const week: Transaction[] = [];
  const prev: Transaction[] = [];
  for (const tx of transactions) {
    const ms = txTimeMs(tx.time);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const key = toLocalISODate(new Date(ms));
    if (key > today || key < prevStart) continue;
    (key >= weekStart ? week : prev).push(tx);
  }

  const index = { txSplits, txCategories, customCategories };
  const curr = computeCategorySpendIndex(week, index).catSpend;
  const before = computeCategorySpendIndex(prev, index).catSpend;
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

  return { hasRecords: week.length > 0, top, growth, limit };
}
