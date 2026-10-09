/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import { useMemo } from "react";
import { formatNumberUk, NARROW_NBSP, pluralDays } from "@sergeant/shared";
import { formatLimitBudgetLabel } from "@sergeant/finyk-domain/domain/budget";
import { buildWeekReport } from "@sergeant/finyk-domain/domain/weekReport";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/utils";
import { messages } from "@shared/i18n/uk";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { isFinykBalanceHidden, maskAmount } from "../lib/balanceVisibility";
import { useFinykStatTransactions } from "./useFinykStatTransactions";

const copy = messages.finyk.weekReport;
const money = (hryvnias: number, hidden: boolean) =>
  maskAmount(`${formatNumberUk(Math.round(hryvnias))}${NARROW_NBSP}₴`, hidden);
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/**
 * Рядки звіту тижня з локальних даних (Р23): підсумок календарного тижня
 * (пн–нд за Києвом) проти того самого відрізка минулого, найбільша категорія,
 * найбільше зростання проти тих самих днів минулого тижня, ліміт із
 * найгіршим темпом. Без записів за тиждень повертає один рядок про це. Коли
 * Фінік вимкнено, звіту немає зовсім: рядок «записів немає» людині, яка веде
 * лише тренування, був би неправдою.
 */
export function useFinykWeekReport(enabled = true): string[] {
  const { statTransactions, slots } = useFinykStatTransactions();
  const { budgets, txCategories, txSplits, customCategories } = slots;
  // Денний ключ у залежностях: вкладка хабу, відкрита через північ,
  // зсуває вікно тижня на першому ж рендері, а не лише зі зміною даних.
  const dayKey = getKyivDayKey();
  const hidden = isFinykBalanceHidden();
  return useMemo(() => {
    void dayKey;
    if (!enabled) return [];
    const report = buildWeekReport(statTransactions, {
      budgets,
      txCategories,
      txSplits,
      customCategories,
    });
    if (!report.hasRecords) return [copy.empty];

    const lines: string[] = [];
    if (report.total) {
      const { spentMinor, prevMinor, delta } = report.total;
      const vars = {
        spent: money(spentMinor / 100, hidden),
        prev: money(prevMinor / 100, hidden),
        change:
          delta.pct === null
            ? ""
            : `${Math.round(Math.abs(delta.pct))}${NARROW_NBSP}%`,
      };
      lines.push(
        fill(
          prevMinor <= 0
            ? copy.totalNew
            : delta.diffMinor === 0
              ? copy.totalSame
              : delta.pct === null
                ? copy.totalAbs
                : delta.diffMinor > 0
                  ? copy.totalMore
                  : copy.totalLess,
          vars,
        ),
      );
    }
    if (report.top) {
      lines.push(
        fill(copy.top, {
          category: report.top.label,
          amount: money(report.top.spentMinor / 100, hidden),
        }),
      );
    }
    if (report.growth) {
      const { delta, label } = report.growth;
      lines.push(
        fill(copy.growth, {
          category: label,
          change:
            delta.pct === null
              ? `+${money(delta.diffMinor / 100, hidden)}`
              : `+${Math.round(delta.pct)}${NARROW_NBSP}%`,
        }),
      );
    }
    if (report.limit) {
      const { budget, spent, limit, overLimit, forecast, daysUntilOver } =
        report.limit;
      const category =
        formatLimitBudgetLabel(
          budget,
          (id) => resolveExpenseCategoryMeta(id, customCategories)?.label,
        ) || budget.categoryId;
      const vars = {
        category,
        spent: money(spent, hidden),
        limit: money(limit, hidden),
        forecast: money(forecast ?? spent, hidden),
        days: daysUntilOver ?? 0,
        unit: pluralDays(daysUntilOver ?? 0),
      };
      lines.push(
        fill(
          overLimit
            ? copy.limitOver
            : daysUntilOver !== null
              ? copy.limitPace
              : copy.limitOk,
          vars,
        ),
      );
    }
    return lines;
  }, [
    dayKey,
    hidden,
    enabled,
    statTransactions,
    budgets,
    txCategories,
    txSplits,
    customCategories,
  ]);
}
