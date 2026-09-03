/**
 * Last validated: 2026-09-02
 * Status: Active
 */
import { memo } from "react";

import { Card } from "@shared/components/ui/Card";
import { Money } from "@shared/components/ui/Money";
import { cn } from "@shared/lib/ui/cn";

import { computePulseStyle } from "./pulseStyle";
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
}

/**
 * Top hero of the Огляд page. Двоповерхова: компактний рядок з нетворсом
 * та розбивкою (картки/борги) зверху, стрічка місяця знизу з головним
 * числом «Лишилось на сьогодні».
 *
 * Денний бюджет — єдине джерело правди на сторінці; `TodaySummaryCard` і
 * `MonthPulseCard` прибрані (спека `finyk-hero-month-strip.md`, F1
 * анти-слоп-аудиту) — їхні незамінні рядки живуть тепер в
 * `OverviewTextRows` під hero, без власного боксу.
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
  dayBudget = null,
  todayRemaining = null,
  todaySpent = 0,
  dailySpend = [],
  todayKey = "",
  spent = 0,
  planExpense = 0,
  hasExpensePlan = false,
  spendPlanRatio = 0,
  showBalance = true,
  onSetPlan,
  onOpenDay,
}: HeroCardProps) {
  const { statusText } = computePulseStyle({
    hasExpensePlan,
    spendPlanRatio,
    dayBudget,
  });

  const daysLeft = Math.max(0, daysInMonth - daysPassed);
  const isOverBudget = todayRemaining !== null && todayRemaining < 0;
  const planPct = hasExpensePlan ? Math.round(spendPlanRatio * 100) : 0;

  // Лише для замаскованого варіанта: відкрите число набирає `Money`, який
  // сам тримає і тири (П4), і вхідний tween.
  const networthMasked = "••••";

  return (
    <Card
      prominence="hero"
      module="finyk"
      edge="rule"
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
          {/* AI-CONTEXT: підпис «Капітал» іде ПІД числом. Число має зустрічати
              око першим, а підпис — пояснювати вже побачене. Зверху він
              змушував прочитати службове слово, перш ніж дійти до факту,
              заради якого екран відкрили. */}
          <div className="min-w-0">
            <p
              // Завжди чорнильний тон hero, і за мінуса теж: червоне число
              // на тонованому зеленому тлі читалось найгірше з усього
              // екрана (звіт власника 2026-09-03). Знак мінус несе Money,
              // а «Борги −N ₴» рядком нижче й так каже, звідки мінус.
              className={cn(
                "text-style-title tabular-nums leading-tight text-hero-ink",
                !showBalance && "tracking-widest",
              )}
            >
              {showBalance ? (
                /* Money несе знак, розряди й символ окремими тирами
                   (анти-слоп П4) і сам тримає CounterReveal усередині. */
                <Money amount={networth} animate tone="inherit" />
              ) : (
                networthMasked
              )}
            </p>
            <p className="text-style-caption text-hero-ink mt-0.5">Капітал</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-style-caption text-hero-ink tabular-nums">
              {daysLeft} дн до кінця
            </p>
          </div>
        </div>
        {/* mt-3, а не mt-1.5: підпис «Капітал» тепер стоїть ПІД числом, тож
            цей рядок опинився впритул до нього — той самий кегль, той самий
            колір, і два різні за роллю рядки читались як один блок. Відступ
            і є тим, що відділяє підпис числа від сусіднього факту. */}
        <p className="text-style-caption text-hero-ink mt-3 leading-snug">
          {showBalance ? (
            <>
              <span>На картках </span>
              <Money
                amount={monoTotal}
                signed
                tone="inherit"
                className="font-semibold text-hero-ink"
              />
              <span className="text-hero-ink"> · </span>
              <span>Борги </span>
              {/* Борг подається відʼємним, а не мінусом у розмітці: знак —
                  властивість суми, і Money набирає його окремим тиром. */}
              <Money
                amount={-totalDebt}
                tone="inherit"
                className="font-semibold text-hero-ink"
              />
            </>
          ) : (
            "На картках •••• · Борги ••••"
          )}
        </p>
      </div>

      <div className="relative border-t border-hero-ink/15 px-5 py-4">
        {todayRemaining === null ? (
          /* Без місячного плану «лишилось на сьогодні» неможливо порахувати
             чесно (див. AI-CONTEXT у `useOverviewData`), тому замість
             вигаданого числа — прямий шлях задати план. */
          <div>
            <p className="text-style-headline text-hero-ink leading-tight">
              Скільки можна витрачати на день?
            </p>
            <p className="text-style-label text-hero-ink mt-1 leading-snug">
              Задай місячний план витрат, і я рахуватиму денний бюджет із
              урахуванням підписок і боргів.
            </p>
            {onSetPlan ? (
              <button
                type="button"
                onClick={onSetPlan}
                className="mt-3 touch-target inline-flex items-center rounded-xl border border-hero-ink/25 bg-hero-ink/10 px-4 text-style-label font-semibold text-hero-ink transition-colors hover:bg-hero-ink/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                Задати план
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "text-style-display text-hero-ink",
                !showBalance && "tracking-widest",
              )}
            >
              {showBalance ? (
                isOverBudget ? (
                  <Money
                    amount={Math.abs(todayRemaining)}
                    animate
                    tone="inherit"
                    symbol="₴ понад бюджет дня"
                    className="text-chart-finyk"
                  />
                ) : (
                  <Money amount={todayRemaining} animate tone="inherit" />
                )
              ) : (
                "••••"
              )}
            </div>
            <p className="text-style-label text-hero-ink mt-1">
              <span>Лишилось на сьогодні</span>
              <span className="text-hero-ink"> · </span>
              <span className="text-hero-ink font-semibold">{statusText}</span>
            </p>
            <p
              data-testid="hero-today-subline"
              className="text-style-caption text-hero-ink/80 mt-0.5"
            >
              {showBalance ? (
                <>
                  витрачено <Money amount={todaySpent} tone="inherit" /> із{" "}
                  <Money amount={dayBudget ?? 0} tone="inherit" />
                </>
              ) : (
                "витрачено ••••"
              )}
            </p>
          </>
        )}

        {dailySpend.length > 0 && (
          <div className="mt-4">
            <MonthStrip
              days={dailySpend}
              todayKey={todayKey}
              dayBudget={dayBudget}
              showBalance={showBalance}
              onOpenDay={(dayKey) => onOpenDay?.(dayKey)}
            />
            <MonthStripHint hasPlan={dayBudget !== null} />
          </div>
        )}

        <p
          data-testid="hero-strip-footer"
          className="mt-3 text-style-caption text-hero-ink tabular-nums"
        >
          {!showBalance ? (
            <>
              •••• за місяць · день {daysPassed} із {daysInMonth}
            </>
          ) : hasExpensePlan ? (
            <>
              <Money amount={spent} tone="inherit" /> із{" "}
              <Money amount={planExpense} tone="inherit" />
              {" · "}
              {planPct}% плану · день {daysPassed} із {daysInMonth}
            </>
          ) : (
            <>
              <Money amount={spent} tone="inherit" /> за місяць · день{" "}
              {daysPassed} із {daysInMonth}
            </>
          )}
        </p>
      </div>
    </Card>
  );
};

export const HeroCard = memo(HeroCardImpl);
