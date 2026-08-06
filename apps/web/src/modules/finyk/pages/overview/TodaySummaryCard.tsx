import { memo, type ReactNode } from "react";
import { Card } from "@shared/components/ui/Card";
import { cn } from "@shared/lib/ui/cn";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";

interface TodaySummaryCardProps {
  spent: number;
  income: number;
  dailyPlan: number | null;
  showBalance: boolean;
  onOpen: () => void;
}

function TodaySummaryCardImpl({
  spent,
  income,
  dailyPlan,
  showBalance,
  onOpen,
}: TodaySummaryCardProps) {
  const variance = dailyPlan === null ? null : dailyPlan - spent;
  // Округлення до гривні лишається тут, а не в `Money`: на цій картці
  // копійки дня — шум, і так було до П4. `Money` без `kopecks` показав би
  // те саме, але округлити ЯВНО дешевше, ніж потім гадати, де зникла копійка.
  const amount = (value: number): ReactNode =>
    showBalance ? <Money amount={Math.round(value)} /> : "••••";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring block w-full rounded-2xl text-left"
      aria-label={messages.finyk.todaySummary.openAria}
    >
      <Card
        module="finyk"
        prominence="interactive"
        radius="lg"
        className="space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-style-label text-text">
              {messages.finyk.todaySummary.title}
            </p>
            <p className="text-xs text-muted">
              {messages.finyk.todaySummary.dayScope}
            </p>
          </div>
          <span className="text-style-caption text-finyk-strong dark:text-finyk">
            {messages.finyk.todaySummary.operations}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [messages.finyk.todaySummary.expense, amount(spent)],
              [messages.finyk.todaySummary.income, amount(income)],
              [
                messages.finyk.todaySummary.dailyPlan,
                dailyPlan === null
                  ? messages.finyk.todaySummary.planMissing
                  : amount(dailyPlan),
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-xs text-muted truncate">{label}</p>
              <p
                className={cn(
                  "text-style-label text-text tabular-nums truncate",
                  !showBalance && dailyPlan !== null && "tracking-widest",
                )}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {variance !== null && (
          <p
            className={cn(
              "text-style-caption",
              variance >= 0
                ? "text-success-strong dark:text-success"
                : "text-danger-strong dark:text-danger",
            )}
          >
            {showBalance ? (
              <>
                {/* Сума в реченні лишається сумою: тири й `tabular-nums`
                    їй потрібні так само, як у таблиці. Тон `inherit` —
                    бо абзац уже забарвлений, і сірий символ біля
                    зеленого числа читався б як чужий елемент. */}
                <Money amount={Math.abs(Math.round(variance))} tone="inherit" />{" "}
                {variance >= 0
                  ? messages.finyk.todaySummary.paceAhead
                  : messages.finyk.todaySummary.paceOver}
              </>
            ) : (
              messages.finyk.todaySummary.paceHidden
            )}
          </p>
        )}
      </Card>
    </button>
  );
}

export const TodaySummaryCard = memo(TodaySummaryCardImpl);
