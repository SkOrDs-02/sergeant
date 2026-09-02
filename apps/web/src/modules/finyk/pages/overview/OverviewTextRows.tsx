import { memo } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { messages } from "@shared/i18n/uk";

export interface OverviewTextRowsProps {
  todaySpent: number;
  todayIncome: number;
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
  onOpenToday: () => void;
}

/**
 * Два текстові рядки під hero — усе, що лишилось від `TodaySummaryCard` і
 * `MonthPulseCard` після їх видалення (спека `finyk-hero-month-strip.md`
 * § Рішення дизайну, п.3 — F1 анти-слоп-аудиту). Без власного боксу:
 * `text-style-label`/`text-style-caption` + `tabular-nums`, `text-muted`.
 *
 * Витрати місяця й відсоток плану сюди НЕ повертаються — вони живуть у
 * футері стрічки hero (`HeroCard`), щоб те саме число не дублювалось у
 * двох контейнерах.
 */
const OverviewTextRowsImpl = function OverviewTextRows({
  todaySpent,
  todayIncome,
  income,
  showMonthForecast,
  projectedSpend,
  projectedSpendCapped = false,
  hasExpensePlan,
  recurringOutThisMonth,
  recurringInThisMonth,
  unknownOutCount,
  showBalance,
  onOpenToday,
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
    <div className="space-y-2 px-1">
      <button
        type="button"
        onClick={onOpenToday}
        className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg text-left"
        aria-label={messages.finyk.todaySummary.openAria}
      >
        <div className="min-w-0">
          <p className="text-style-caption text-muted">
            {messages.finyk.todaySummary.title}
          </p>
          <p className="text-style-label text-text tabular-nums">
            {showBalance ? (
              <>
                <Money amount={-todaySpent} />
                <span> · </span>
                <Money amount={todayIncome} signed />
              </>
            ) : (
              "••••"
            )}
          </p>
        </div>
        <span className="text-style-caption text-finyk-strong dark:text-finyk inline-flex shrink-0 items-center gap-0.5">
          {messages.finyk.todaySummary.operations}
          <Icon name="chevron-right" size="xs" />
        </span>
      </button>

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
              className="inline-flex items-center justify-center text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk/60 rounded-full"
            >
              <Icon name="info" size={14} />
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
    </div>
  );
};

export const OverviewTextRows = memo(OverviewTextRowsImpl);
