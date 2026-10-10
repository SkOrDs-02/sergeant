import { memo } from "react";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n";
import { MonthStrip, MonthStripHint, type MonthStripDay } from "./MonthStrip";
interface HeroCardProps {
  networth: number;
  monoTotal: number;
  totalDebt: number;
  daysInMonth: number;
  daysPassed: number;
  /**
   * `null` коли місячний план витрат не заданий — тоді замість числа
   * рендериться CTA «Постав план». Див. AI-CONTEXT у `useOverviewData`:
   * без плану будь-яке «можна сьогодні» — це похідна від уже витраченого,
   * а не бюджет.
   */
  dayBudget?: number | null;
  /**
   * Головне число hero (спека `finyk-hero-month-strip.md` § Рішення
   * дизайну, п.2) — «Лишилось на сьогодні» = `dayBudget − todaySpent`.
   * `null` РІВНО тоді, коли `dayBudget === null` (плану немає) — без цієї
   * гілки `null − todaySpent` дав би в JS `-todaySpent`, тобто без плану
   * hero показав би бадьоре «−N ₴ понад бюджет дня» замість CTA
   * «Постав план».
   */
  todayRemaining?: number | null;
  todaySpent?: number;
  /** Стрічка місяця — по одному елементу на кожен день (`MonthStrip`). */
  dailySpend?: MonthStripDay[];
  todayKey?: string;
  /** Витрати місяця (футер стрічки) — те саме число, що й у «Місяць». */
  spent?: number;
  planExpense?: number;
  hasExpensePlan?: boolean;
  spendPlanRatio?: number;
  showBalance?: boolean;
  /** Відкриває Планування, щоб задати місячний план. */
  onSetPlan?: (() => void) | undefined;
  /** Тап по клітинці стрічки → `/finyk/transactions?date=YYYY-MM-DD`. */
  onOpenDay?: ((dayKey: string) => void) | undefined;
  /** N-3 (аудит 2026-09-16): один слот навчання на екран - ховає підказку стрічки, поки видимий `FirstInsightBanner`. */
  suppressMonthStripHint?: boolean;
}

const copy = messages.finykRedesign;
const HeroCardImpl = function HeroCard({
  networth,
  monoTotal,
  totalDebt,
  daysInMonth,
  daysPassed,
  dayBudget = null,
  todayRemaining = null,
  todaySpent = 0,
  dailySpend = [],
  todayKey = "",
  spent = 0,
  planExpense = 0,
  hasExpensePlan = false,
  showBalance = true,
  onSetPlan,
  onOpenDay,
  suppressMonthStripHint = false,
}: HeroCardProps) {
  return (
    <Card prominence="hero" tone="finyk" padding="lg" className="text-text">
      <p className="text-style-caption font-semibold uppercase tracking-label text-finyk-tint-label">
        {todayRemaining !== null && todayRemaining < 0
          ? copy.todayDeficit
          : copy.todayAvailable}
      </p>
      {todayRemaining === null ? (
        <div className="mt-2">
          <p className="text-style-headline text-text">{copy.noDayPlan}</p>
          <p className="mt-1 text-style-label text-text">{copy.dayPlanHint}</p>
          {onSetPlan && (
            <Button variant="outline" className="mt-3" onClick={onSetPlan}>
              {copy.setPlan}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-2 text-style-display text-text">
            {showBalance ? (
              <Money amount={todayRemaining} animate tone="inherit" />
            ) : (
              "••••"
            )}
          </div>
          <p
            data-testid="hero-today-subline"
            className="mt-2 text-style-label text-text"
          >
            {copy.spentToday}{" "}
            {showBalance ? (
              <Money amount={todaySpent} tone="inherit" />
            ) : (
              "••••"
            )}{" "}
            · {copy.dayPlan}{" "}
            {showBalance ? (
              <Money amount={dayBudget ?? 0} tone="inherit" />
            ) : (
              "••••"
            )}
          </p>
        </>
      )}
      {dailySpend.length > 0 && (
        <div className="mt-5">
          <MonthStrip
            days={dailySpend}
            todayKey={todayKey}
            dayBudget={dayBudget}
            showBalance={showBalance}
            onOpenDay={(key) => onOpenDay?.(key)}
          />
          <MonthStripHint
            hasPlan={dayBudget !== null}
            suppressed={suppressMonthStripHint}
          />
        </div>
      )}
      <p
        data-testid="hero-strip-footer"
        className="mt-3 text-style-caption text-text tabular-nums"
      >
        {copy.monthSpent}{" "}
        {showBalance ? <Money amount={spent} tone="inherit" /> : "••••"}
        {hasExpensePlan && (
          <>
            {" "}
            · {copy.monthPlan}{" "}
            {showBalance ? (
              <Money amount={planExpense} tone="inherit" />
            ) : (
              "••••"
            )}
          </>
        )}{" "}
        · {daysPassed}/{daysInMonth}
      </p>
      <div className="mt-4 border-t border-line pt-3 text-style-label text-text">
        <p>
          {copy.capital}{" "}
          {showBalance ? <Money amount={networth} tone="inherit" /> : "••••"}
        </p>
        <p className="mt-1 text-style-caption text-text">
          {copy.cards}{" "}
          {showBalance ? <Money amount={monoTotal} tone="inherit" /> : "••••"} ·{" "}
          {copy.debts}{" "}
          {showBalance ? <Money amount={-totalDebt} tone="inherit" /> : "••••"}
        </p>
      </div>
    </Card>
  );
};
export const HeroCard = memo(HeroCardImpl);
