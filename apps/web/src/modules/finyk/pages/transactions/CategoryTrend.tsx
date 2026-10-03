/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import { messages } from "@shared/i18n/uk";
import { MonthlyTrendBars } from "../../components/analytics/MonthlyTrendBars";
import {
  useMonthlyTrend,
  type FetchBankRange,
  type MonthlyTrendStorage,
} from "../../hooks/useMonthlyTrend";

interface CategoryTrendProps {
  categoryId: string;
  label: string;
  storage: MonthlyTrendStorage;
  fetchRange?: FetchBankRange | undefined;
  showBalance?: boolean;
}

/**
 * Тренд однієї категорії за 12 місяців (Р13). Окремого екрана категорії
 * немає: клік по кільцю Аналітики ставить фільтр тут, тож графік живе в
 * шапці Записів, поки фільтр активний.
 */
export function CategoryTrend({
  categoryId,
  label,
  storage,
  fetchRange,
  showBalance = true,
}: CategoryTrendProps) {
  const trend = useMonthlyTrend(storage, categoryId, fetchRange);
  if (trend.points.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-3 space-y-2">
      <p className="text-style-caption text-subtle">
        {label} {messages.finyk.monthlyTrend.categorySuffix}
      </p>
      <MonthlyTrendBars
        points={trend.points}
        averageMinor={trend.averageMinor}
        perDayMinor={trend.perDayMinor}
        showBalance={showBalance}
      />
    </div>
  );
}
