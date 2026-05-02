import { memo } from "react";
import { cn } from "@shared/lib/cn";
import { computePulseStyle } from "./pulseStyle";

interface HeroCardProps {
  networth: number;
  monoTotal: number;
  totalDebt: number;
  daysInMonth: number;
  daysPassed: number;
  dayBudget?: number;
  hasExpensePlan?: boolean;
  spendPlanRatio?: number;
  showBalance?: boolean;
}

/**
 * Top hero of the Огляд page. Двоповерхова: компактний рядок з нетворсом
 * та розбивкою (картки/борги) зверху, велике число денного бюджету знизу
 * з акцент-кольором статусу та прогресом місяця.
 *
 * Денний бюджет — єдине джерело правди на сторінці; MonthPulseCard більше
 * не дублює це число у блоці «Фінпульс».
 */
const HeroCardImpl = function HeroCard({
  networth,
  monoTotal,
  totalDebt,
  daysInMonth,
  daysPassed,
  dayBudget = 0,
  hasExpensePlan = false,
  spendPlanRatio = 0,
  showBalance = true,
}: HeroCardProps) {
  const { accentLeft, color, statusText } = computePulseStyle({
    hasExpensePlan,
    spendPlanRatio,
    dayBudget,
  });

  const daysLeft = Math.max(0, daysInMonth - daysPassed);
  const monthProgressPct = Math.min(
    100,
    Math.max(0, (daysPassed / daysInMonth) * 100),
  );

  const networthDisplay = showBalance
    ? `${networth >= 0 ? "" : "−"}${Math.abs(networth).toLocaleString("uk-UA", {
        maximumFractionDigits: 0,
      })} ₴`
    : "••••";

  return (
    <div
      className={cn(
        "rounded-3xl bg-finyk/[.06] dark:bg-finyk-surface-dark/10",
        "border border-finyk/[.14] dark:border-finyk-border-dark/20",
        "border-l-[4px] shadow-card",
        accentLeft,
      )}
    >
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-style-caption text-subtle">Нетворс</p>
            <p
              className={cn(
                "text-base sm:text-style-title tabular-nums leading-tight mt-0.5",
                networth < 0
                  ? "text-danger-strong dark:text-danger"
                  : "text-text",
                !showBalance && "tracking-widest",
              )}
            >
              {networthDisplay}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted tabular-nums">
              {daysLeft} дн до кінця
            </p>
          </div>
        </div>
        <p className="text-xs text-muted mt-1.5 leading-snug">
          {showBalance ? (
            <>
              <span>На картках </span>
              <span className="font-semibold tabular-nums text-text">
                +
                {monoTotal.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })}{" "}
                ₴
              </span>
              <span className="text-subtle"> · </span>
              <span>Борги </span>
              <span className="font-semibold tabular-nums text-text">
                −
                {totalDebt.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })}{" "}
                ₴
              </span>
            </>
          ) : (
            "На картках •••• · Борги ••••"
          )}
        </p>
      </div>

      <div className="border-t border-finyk/20 px-5 py-4">
        <div
          className={cn(
            "text-display-stat",
            color,
            !showBalance && "tracking-widest",
          )}
        >
          {showBalance ? (
            <>
              {Math.round(Math.abs(dayBudget)).toLocaleString("uk-UA", {
                maximumFractionDigits: 0,
              })}
              <span className="text-2xl font-semibold ml-1 opacity-70">
                ₴/день
              </span>
            </>
          ) : (
            "••••"
          )}
        </div>
        <p className="text-sm text-muted mt-1">
          <span>Можна сьогодні</span>
          <span className="text-subtle"> · </span>
          <span className={color}>{statusText}</span>
        </p>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span>
              День {daysPassed} з {daysInMonth}
            </span>
            <span className="tabular-nums">
              {Math.round(monthProgressPct)}%
            </span>
          </div>
          <div className="h-1 rounded-full bg-finyk/[.15] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500 transition-[width] duration-500"
              style={{ width: `${monthProgressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const HeroCard = memo(HeroCardImpl);
