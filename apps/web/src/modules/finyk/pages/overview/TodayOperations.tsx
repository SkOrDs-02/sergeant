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
  onOpenToday,
}: {
  transactions: Transaction[];
  showBalance: boolean;
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
      {transactions.length === 0 ? (
        <p className="mt-3 text-style-label text-muted">
          {messages.finykRedesign.noTodayOperations}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {transactions.slice(0, 3).map((tx) => (
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
