import { memo } from "react";
import { pluralDays } from "@sergeant/shared";
import { Card } from "@shared/components/ui/Card";
import { Money } from "@shared/components/ui/Money";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";

interface MonthPulseCardProps {
  dateLabel: string;
  daysPassed: number;
  spent: number;
  income: number;
  showBalance: boolean;
  showMonthForecast: boolean;
  projectedSpend: number;
  hasExpensePlan: boolean;
  spendPlanRatio: number;
  planExpense: number;
  recurringOutThisMonth: number;
  recurringInThisMonth: number;
  unknownOutCount: number;
}

/**
 * Картка «Місяць» — пара Витрати/Дохід + progress-bar плану (лише коли план
 * заданий) + примітка про планові потоки. Денний бюджет і статус виконання
 * плану живуть у HeroCard, тут не дублюються.
 *
 * Без плану показуємо тільки текстовий прогноз, без бару: прогноз — лінійна
 * екстраполяція факту, тож будь-яке його відношення до факту згортається в
 * «скільки днів минуло» і нічого не повідомляє про витрати.
 */
const MonthPulseCardImpl = function MonthPulseCard({
  dateLabel,
  daysPassed,
  spent,
  income,
  showBalance,
  showMonthForecast,
  projectedSpend,
  hasExpensePlan,
  spendPlanRatio,
  planExpense,
  recurringOutThisMonth,
  recurringInThisMonth,
  unknownOutCount,
}: MonthPulseCardProps) {
  const planPct = Math.min(100, Math.max(0, Math.round(spendPlanRatio * 100)));
  const planBarClass =
    spendPlanRatio > 0.75
      ? "bg-danger"
      : spendPlanRatio > 0.5
        ? "bg-warning"
        : "bg-success";

  const showPlanBar = hasExpensePlan && showBalance;
  const showForecastBlock =
    showMonthForecast && !hasExpensePlan && projectedSpend > 0;

  return (
    <Card variant="default" radius="lg" padding="lg">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-style-caption text-subtle">Місяць</span>
          <span className="text-xs text-muted capitalize truncate">
            {dateLabel}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-1 text-style-caption text-subtle">
            <span>Витрати</span>
            <Tooltip
              content="Огляд, категорії та бюджети — у гривні (UAH). Інші валюти рахунків у загальному балансі не конвертуються автоматично."
              placement="bottom-center"
            >
              <button
                type="button"
                aria-label="Про валюту в підрахунках"
                className="inline-flex items-center justify-center text-subtle hover:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk/60 rounded-full"
              >
                <Icon name="info" size={14} />
              </button>
            </Tooltip>
          </div>
          <div className="text-hero font-bold mt-1 leading-tight">
            {showBalance ? <Money amount={spent} /> : "••••"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-style-caption text-subtle">Дохід</div>
          {/* `tone="inherit"` замість власного приглушеного зеленого: до П4
              символ тут фарбувався `text-brand-700 dark:text-success/70`, а в
              сусідній колонці — `text-muted`. Та сама роль, два різні кольори. */}
          <div className="text-hero font-bold mt-1 leading-tight text-success-strong dark:text-success">
            {showBalance ? (
              <Money amount={income} signed tone="inherit" />
            ) : (
              "••••"
            )}
          </div>
        </div>
      </div>

      {showPlanBar && (
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-xs text-muted">
            <span>
              {planPct}% з плану <Money amount={planExpense} />
            </span>
            {showMonthForecast && projectedSpend > 0 && (
              <span>
                прогноз <Money amount={projectedSpend} />
              </span>
            )}
          </div>
          <div className="h-1.5 bg-bg rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-700",
                planBarClass,
              )}
              style={{ width: `${planPct}%` }}
            />
          </div>
        </div>
      )}

      {showForecastBlock && (
        <div className="mt-4">
          <p className="text-xs text-muted leading-snug">
            За {daysPassed} {pluralDays(daysPassed)} · факт{" "}
            <Money amount={spent} className="font-semibold text-text" />
            {" · "}до кінця місяця ~{" "}
            <Money
              amount={projectedSpend}
              className="font-semibold text-text"
            />
          </p>
        </div>
      )}

      {(recurringOutThisMonth > 0 || recurringInThisMonth > 0) &&
        showBalance && (
          <p className="text-xs text-muted mt-3 leading-relaxed">
            Враховано планових: <Money amount={-recurringOutThisMonth} /> /{" "}
            <Money amount={recurringInThisMonth} signed />
            {unknownOutCount > 0 && ` + ${unknownOutCount} без суми`}
          </p>
        )}
    </Card>
  );
};

export const MonthPulseCard = memo(MonthPulseCardImpl);
