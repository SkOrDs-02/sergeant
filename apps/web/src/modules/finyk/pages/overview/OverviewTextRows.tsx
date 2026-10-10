import { memo } from "react";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { messages } from "@shared/i18n/uk";

export interface OverviewTextRowsProps {
  /** Дохід МІСЯЦЯ (не сьогоднішній) — рядок «Місяць». */
  income: number;
  /**
   * Приходить уже поєднаним з `showBalance` на виклику (`Overview.tsx`),
   * як і в колишньому `MonthPulseCard` — маскування вирішується на цьому
   * пропі, а не окремим тернарником тут.
   */
  showMonthForecast: boolean;
  projectedSpend: number;
  projectedSpendCapped?: boolean;
  hasExpensePlan: boolean;
  recurringOutThisMonth: number;
  recurringInThisMonth: number;
  unknownOutCount: number;
  showBalance: boolean;
}

/** Month income, forecast and scheduled cash flows on one neutral panel.
 * Daily operations live in TodayOperations; month expenses live in HeroCard.
 */
const OverviewTextRowsImpl = function OverviewTextRows({
  income,
  showMonthForecast,
  projectedSpend,
  projectedSpendCapped = false,
  hasExpensePlan,
  recurringOutThisMonth,
  recurringInThisMonth,
  unknownOutCount,
  showBalance,
}: OverviewTextRowsProps) {
  // Той самий контракт, що й колишній `MonthPulseCard.showForecastBlock` /
  // `showForecastNumber` — переносимо ОБИДВІ умови, інакше прогноз зникає
  // саме для користувачів без плану (спека § Ризики).
  const showForecastBlock =
    showMonthForecast && !hasExpensePlan && projectedSpend > 0;
  const showForecastNumber =
    showForecastBlock ||
    (hasExpensePlan && showBalance && showMonthForecast && projectedSpend > 0);

  return (
    <Card variant="default" radius="lg" padding="md" className="space-y-3">
      <div>
        <div className="flex items-center gap-1">
          <p className="text-style-caption text-muted">
            {messages.finyk.monthRow.label}
          </p>
          <Tooltip
            content={messages.finyk.monthRow.currencyTooltip}
            placement="bottom-center"
          >
            <button
              type="button"
              aria-label={messages.finyk.monthRow.currencyInfoAria}
              // 24px на fine-pointer (WCAG 2.5.8): голий 16px-гліф був
              // нижче мінімуму; coarse підхоплює глобальна сітка 44px.
              className="inline-flex min-h-6 min-w-6 items-center justify-center text-muted hover:text-text focus-ring rounded-lg"
            >
              <Icon name="info" size="sm" />
            </button>
          </Tooltip>
        </div>
        <p className="text-style-label text-text tabular-nums">
          {showBalance ? (
            <>
              <span>{messages.finyk.monthRow.incomePrefix} </span>
              <Money amount={income} signed />
              {showForecastNumber && (
                <>
                  <span> · {messages.finyk.monthRow.forecastPrefix}</span>
                  <Money amount={projectedSpend} />
                </>
              )}
            </>
          ) : (
            "••••"
          )}
        </p>
        {showForecastNumber && projectedSpendCapped && showBalance && (
          <p className="text-style-caption text-muted mt-0.5 leading-snug">
            {messages.finyk.monthRow.forecastCapped}
          </p>
        )}
        {(recurringOutThisMonth > 0 || recurringInThisMonth > 0) &&
          showBalance && (
            <p className="text-style-caption text-muted mt-0.5 leading-relaxed">
              {messages.finyk.monthRow.recurringPrefix}{" "}
              <Money amount={-recurringOutThisMonth} /> /{" "}
              <Money amount={recurringInThisMonth} signed />
              {unknownOutCount > 0 &&
                ` + ${unknownOutCount} ${messages.finyk.monthRow.recurringSuffixNoSum}`}
            </p>
          )}
      </div>
    </Card>
  );
};

export const OverviewTextRows = memo(OverviewTextRowsImpl);
