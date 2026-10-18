import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n";
import { formatTimeHm } from "@shared/lib/time/formatDate";
import { txEpochMs } from "../../lib/monthWindow";

export function TodayOperations({
  transactions,
  showBalance,
  summary,
  onOpenToday,
}: {
  transactions: Transaction[];
  showBalance: boolean;
  summary: { expense: number; income: number; balance: number };
  onOpenToday: () => void;
}) {
  return (
    <Card as="section" padding="md">
      <SectionHeading
        size="lg"
        variant="text"
        meta={
          <button
            type="button"
            onClick={onOpenToday}
            aria-label={messages.finyk.todaySummary.openAria}
            className="focus-ring touch-target text-style-label text-muted"
          >
            {messages.finyk.todaySummary.operations}
          </button>
        }
      >
        {messages.finykRedesign.today}
      </SectionHeading>
      <p
        data-testid="today-totals"
        className="mt-2 text-style-caption text-text tabular-nums"
      >
        {messages.finykRedesign.expenses}{" "}
        {showBalance ? (
          <Money amount={summary.expense} tone="inherit" />
        ) : (
          "••••"
        )}
        {" · "}
        {messages.finykRedesign.income}{" "}
        {showBalance ? (
          <Money amount={summary.income} tone="inherit" />
        ) : (
          "••••"
        )}
        {" · "}
        {messages.finykRedesign.balance}{" "}
        {showBalance ? (
          <Money amount={summary.balance} tone="inherit" />
        ) : (
          "••••"
        )}
      </p>
      {transactions.length === 0 ? (
        <p className="mt-3 text-style-label text-muted">
          {messages.finykRedesign.noTodayOperations}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {[...transactions]
            .sort((a, b) => (txEpochMs(b) ?? 0) - (txEpochMs(a) ?? 0))
            .slice(0, 3)
            .map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-style-body font-semibold text-text">
                    {tx.description}
                  </p>
                  <time className="text-style-caption text-subtle">
                    {formatTimeHm(new Date(txEpochMs(tx) ?? 0), {
                      timeZone: "Europe/Kyiv",
                    })}
                  </time>
                </div>
                <span className="text-style-body font-medium text-text">
                  {showBalance ? (
                    <Money
                      amount={tx.amount / 100}
                      signed
                      kopecks
                      tone="inherit"
                    />
                  ) : (
                    "••••"
                  )}
                </span>
              </li>
            ))}
        </ul>
      )}
    </Card>
  );
}
