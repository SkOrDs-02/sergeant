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
  projectedSpendCapped?: boolean;
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
  projectedSpendCapped = false,
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
  const showForecastNumber =
    showForecastBlock ||
    (showPlanBar && showMonthForecast && projectedSpend > 0);

  return (
    <Card variant="default" radius="lg" padding="lg">
      {/* Заголовок картки, а не мета: він каже, про який період уся картка,
          тож повним кольором на рівні `label`. Слово «Місяць» прибрано — воно
          нічого не додає до «серпень», а займало окремий тир. Лічильник днів
          сюди НЕ повертати: він уже стоїть у HeroCard («День X з Y») і в
          рядку прогнозу нижче — третя копія того самого факту саме й робить
          картку однорідною. */}
      <div className="mb-4">
        <span className="text-style-label font-semibold text-text capitalize">
          {dateLabel}
        </span>
      </div>

      {/* AI-CONTEXT: підпис іде ПІД числом, а не над ним. Число має зустрічати
          око першим, а підпис — пояснювати вже побачене; підпис зверху змушує
          прочитати службове слово, перш ніж дійти до факту, заради якого
          екран відкрили. Разом із цим тут один приглушений сірий на весь
          блок (`text-muted`): до цього підписи були `text-subtle`, а нотатки
          нижче — `text-muted`, тобто два сірі на одній картці. Ієрархію тепер
          несуть розмір і вага, а не третій відтінок. */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <div className="text-hero font-bold leading-tight">
            {showBalance ? <Money amount={spent} /> : "••••"}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-style-label text-muted">
            <span>Витрати</span>
            <Tooltip
              content="Огляд, категорії та бюджети – у гривні (UAH). Інші валюти рахунків у загальному балансі не конвертуються автоматично."
              placement="bottom-center"
            >
              <button
                type="button"
                aria-label="Про валюту в підрахунках"
                className="inline-flex items-center justify-center text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk/60 rounded-full"
              >
                <Icon name="info" size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="text-right">
          {/* `tone="inherit"` замість власного приглушеного зеленого: до П4
              символ тут фарбувався `text-brand-700 dark:text-success/70`, а в
              сусідній колонці — `text-muted`. Та сама роль, два різні кольори. */}
          <div className="text-hero font-bold leading-tight text-success-strong dark:text-success">
            {showBalance ? (
              <Money amount={income} signed tone="inherit" />
            ) : (
              "••••"
            )}
          </div>
          <div className="mt-0.5 text-style-label text-muted">Дохід</div>
        </div>
      </div>

      {showPlanBar && (
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-style-caption text-muted">
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
                "h-full rounded-full transition-[width,background-color] duration-slowest",
                planBarClass,
              )}
              style={{ width: `${planPct}%` }}
            />
          </div>
        </div>
      )}

      {showForecastBlock && (
        <div className="mt-4">
          <p className="text-style-caption text-muted leading-snug">
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

      {showForecastNumber && projectedSpendCapped && showBalance && (
        <p className="text-style-caption text-muted mt-2 leading-snug">
          Прогноз обмежений залишком коштів: витратити більше нема з чого.
        </p>
      )}

      {(recurringOutThisMonth > 0 || recurringInThisMonth > 0) &&
        showBalance && (
          <p className="text-style-caption text-muted mt-3 leading-relaxed">
            Враховано планових: <Money amount={-recurringOutThisMonth} /> /{" "}
            <Money amount={recurringInThisMonth} signed />
            {unknownOutCount > 0 && ` + ${unknownOutCount} без суми`}
          </p>
        )}
    </Card>
  );
};

export const MonthPulseCard = memo(MonthPulseCardImpl);
