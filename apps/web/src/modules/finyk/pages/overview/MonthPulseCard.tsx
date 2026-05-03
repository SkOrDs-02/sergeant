import { memo } from "react";
import { Card } from "@shared/components/ui/Card";
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
  forecastTrendPct: number;
  forecastBarClass: string;
  recurringOutThisMonth: number;
  recurringInThisMonth: number;
  unknownOutCount: number;
}

/**
 * Картка «Місяць» — пара Витрати/Дохід + опційно один progress-bar
 * (плану або прогнозу) + примітка про планові потоки. Денний бюджет і
 * статус виконання плану живуть у HeroCard, тут не дублюються.
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
  forecastTrendPct,
  forecastBarClass,
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
          <div className="text-hero font-bold tabular-nums mt-1 leading-tight">
            {showBalance
              ? spent.toLocaleString("uk-UA", { maximumFractionDigits: 0 })
              : "••••"}
            {showBalance && (
              <span className="text-base font-medium text-muted ml-1">₴</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-style-caption text-subtle">Дохід</div>
          <div className="text-hero font-bold tabular-nums mt-1 leading-tight text-success">
            {showBalance ? (
              <>
                +
                {income.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })}
                <span className="text-base font-medium text-brand-700 dark:text-success/70 ml-1">
                  ₴
                </span>
              </>
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
              {planPct}% з плану{" "}
              <span className="tabular-nums">
                {planExpense.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })}{" "}
                ₴
              </span>
            </span>
            {showMonthForecast && projectedSpend > 0 && (
              <span className="tabular-nums">
                прогноз{" "}
                {Math.round(projectedSpend).toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })}{" "}
                ₴
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
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted leading-snug">
            За {daysPassed}{" "}
            {daysPassed === 1 ? "день" : daysPassed < 5 ? "дні" : "дн."} · факт{" "}
            <span className="font-semibold text-text tabular-nums">
              {spent.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴
            </span>
            {" · "}до кінця місяця ~{" "}
            <span className="font-semibold text-text tabular-nums">
              {Math.round(projectedSpend).toLocaleString("uk-UA", {
                maximumFractionDigits: 0,
              })}{" "}
              ₴
            </span>
          </p>
          <div className="h-1.5 bg-bg rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-500",
                forecastBarClass,
              )}
              style={{ width: `${forecastTrendPct}%` }}
            />
          </div>
        </div>
      )}

      {(recurringOutThisMonth > 0 || recurringInThisMonth > 0) &&
        showBalance && (
          <p className="text-xs text-muted mt-3 leading-relaxed">
            Враховано планових: −
            {recurringOutThisMonth.toLocaleString("uk-UA", {
              maximumFractionDigits: 0,
            })}{" "}
            / +
            {recurringInThisMonth.toLocaleString("uk-UA", {
              maximumFractionDigits: 0,
            })}{" "}
            ₴{unknownOutCount > 0 && ` + ${unknownOutCount} без суми`}
          </p>
        )}
    </Card>
  );
};

export const MonthPulseCard = memo(MonthPulseCardImpl);
