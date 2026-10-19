import { messages } from "@shared/i18n";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { Money } from "@shared/components/ui/Money";
import { NARROW_NBSP } from "@sergeant/shared";
import { AnalyticsSection } from "./AnalyticsSection";

const copy = messages.finyk.analyticsPage;

interface AnalyticsSummaryProps {
  title: string;
  loading: boolean | undefined;
  summary: {
    spent: number;
    income: number;
    balance: number;
    spentMinor: number;
    incomeMinor: number;
  };
  /** `getSavingsRate`: `null` при доході 0. */
  savingsRate: number | null;
  /** План накопичень фінплану; 0, коли план до періоду не стосується. */
  plannedSavings: number;
  showBalance: boolean;
}

/** «Підсумок»: витрати, дохід, баланс і рівень заощаджень (Р15). */
export function AnalyticsSummary({
  title,
  loading,
  summary,
  savingsRate,
  plannedSavings,
  showBalance,
}: AnalyticsSummaryProps) {
  return (
    <AnalyticsSection
      title={title}
      hero={!loading && summary.spent + summary.income > 0}
    >
      {loading ? (
        <Skeleton className="h-8 rounded-lg" />
      ) : (
        <p className="text-style-label text-text tabular-nums">
          {messages.finykRedesign.expenses}{" "}
          {showBalance ? (
            <Money amount={summary.spent} tone="inherit" />
          ) : (
            "••••"
          )}{" "}
          · {messages.finykRedesign.income}{" "}
          {showBalance ? (
            <Money amount={summary.income} tone="inherit" />
          ) : (
            "••••"
          )}{" "}
          · {messages.finykRedesign.balance}{" "}
          {showBalance ? (
            <Money amount={summary.balance} signed tone="inherit" />
          ) : (
            "••••"
          )}
        </p>
      )}
      {/* Р15: при доході 0 рядка немає зовсім, «0 %» було б неправдою. */}
      {!loading && savingsRate !== null && (
        <div className="mt-4 pt-3 border-t border-line text-style-label text-text space-y-0.5">
          <p>
            {savingsRate >= 0
              ? `Відкладено ${Math.round(savingsRate)}${NARROW_NBSP}% доходу`
              : `Витрати перевищили дохід на ${Math.round(-savingsRate)}${NARROW_NBSP}%`}
          </p>
          {plannedSavings > 0 && showBalance && (
            <p>
              {copy.planPrefix} <Money amount={plannedSavings} tone="inherit" />
              , {copy.planFact}{" "}
              <Money
                amount={(summary.incomeMinor - summary.spentMinor) / 100}
                tone="inherit"
              />
            </p>
          )}
        </div>
      )}
    </AnalyticsSection>
  );
}
