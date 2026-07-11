/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { memo } from "react";

import { Card } from "@shared/components/ui/Card";
import { CounterReveal } from "@shared/components/ui/CounterReveal";
import { cn } from "@shared/lib/ui/cn";

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
 *
 * Phase 2.1 v2 redesign (C3): chrome тепер через `<Card prominence="hero"
 * module="finyk">` + decorative `--hero-grad-finyk` wash. Статус-акцент
 * (`pulseStyle.color`) тримається на самому числі/підпису — лівий 4px
 * accent border видалено, бо hero-gradient + кольоровий statusText вже
 * несуть pulse-signal без дублювання chrome.
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
  const { color, statusText } = computePulseStyle({
    hasExpensePlan,
    spendPlanRatio,
    dayBudget,
  });

  const daysLeft = Math.max(0, daysInMonth - daysPassed);
  const monthProgressPct = Math.min(
    100,
    Math.max(0, (daysPassed / daysInMonth) * 100),
  );

  // networthDisplay only used for the masked variant; revealed value uses
  // CounterReveal directly for the entrance tween (W1 / Phase 4b).
  const networthMasked = "••••";

  return (
    <Card
      prominence="hero"
      module="finyk"
      radius="r-2xl"
      padding="none"
      className="relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "var(--hero-grad-finyk)",
          opacity: 0.07,
        }}
      />
      <div className="relative px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-style-caption text-hero-ink/60">Нетворс</p>
            <p
              className={cn(
                "text-style-title tabular-nums leading-tight mt-0.5",
                networth < 0
                  ? "text-danger-strong dark:text-danger"
                  : "text-hero-ink",
                !showBalance && "tracking-widest",
              )}
            >
              {showBalance ? (
                <>
                  {networth < 0 ? "−" : ""}
                  {/* CounterReveal handles prefers-reduced-motion internally */}
                  <CounterReveal
                    value={Math.abs(networth)}
                    entranceFrom={0}
                    duration={800}
                    format={(v) =>
                      new Intl.NumberFormat("uk-UA", {
                        maximumFractionDigits: 0,
                      }).format(Math.round(v)) + " ₴"
                    }
                  />
                </>
              ) : (
                networthMasked
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-hero-ink/75 tabular-nums">
              {daysLeft} дн до кінця
            </p>
          </div>
        </div>
        <p className="text-xs text-hero-ink/75 mt-1.5 leading-snug">
          {showBalance ? (
            <>
              <span>На картках </span>
              <span className="font-semibold tabular-nums text-hero-ink">
                +
                {monoTotal.toLocaleString("uk-UA", {
                  maximumFractionDigits: 0,
                })}{" "}
                ₴
              </span>
              <span className="text-hero-ink/60"> · </span>
              <span>Борги </span>
              <span className="font-semibold tabular-nums text-hero-ink">
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

      <div className="relative border-t border-hero-ink/15 px-5 py-4">
        <div
          className={cn(
            "text-style-display-hero",
            color,
            !showBalance && "tracking-widest",
          )}
        >
          {showBalance ? (
            <>
              {dayBudget < 0 ? "−" : ""}
              {/* CounterReveal handles prefers-reduced-motion internally */}
              <CounterReveal
                value={Math.round(Math.abs(dayBudget))}
                entranceFrom={0}
                duration={800}
              />
              <span className="text-style-headline ml-1 opacity-70">
                ₴/день
              </span>
            </>
          ) : (
            "••••"
          )}
        </div>
        <p className="text-sm text-hero-ink/75 mt-1">
          <span>Можна сьогодні</span>
          <span className="text-hero-ink/60"> · </span>
          <span className={color}>{statusText}</span>
        </p>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-hero-ink/75 mb-1">
            <span>
              День {daysPassed} з {daysInMonth}
            </span>
            <span className="tabular-nums">
              {Math.round(monthProgressPct)}%
            </span>
          </div>
          <div className="h-1 rounded-full bg-finyk-soft-border overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-500 transition-[width] duration-500"
              style={{ width: `${monthProgressPct}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
};

export const HeroCard = memo(HeroCardImpl);
