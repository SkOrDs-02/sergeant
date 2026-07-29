import { memo } from "react";
import { Card } from "@shared/components/ui/Card";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

interface TodaySummaryCardProps {
  spent: number;
  income: number;
  dailyPlan: number | null;
  showBalance: boolean;
  onOpen: () => void;
}

function formatUah(value: number): string {
  return `${Math.round(value).toLocaleString("uk-UA")} ₴`;
}

function TodaySummaryCardImpl({
  spent,
  income,
  dailyPlan,
  showBalance,
  onOpen,
}: TodaySummaryCardProps) {
  const variance = dailyPlan === null ? null : dailyPlan - spent;
  const amount = (value: number) => (showBalance ? formatUah(value) : "••••");

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
          {[
            [messages.finyk.todaySummary.expense, amount(spent)],
            [messages.finyk.todaySummary.income, amount(income)],
            [
              messages.finyk.todaySummary.dailyPlan,
              dailyPlan === null
                ? messages.finyk.todaySummary.planMissing
                : amount(dailyPlan),
            ],
          ].map(([label, value]) => (
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
            {showBalance
              ? variance >= 0
                ? `${formatUah(variance)} до темпу`
                : `${formatUah(Math.abs(variance))} понад темп`
              : messages.finyk.todaySummary.paceHidden}
          </p>
        )}
      </Card>
    </button>
  );
}

export const TodaySummaryCard = memo(TodaySummaryCardImpl);
