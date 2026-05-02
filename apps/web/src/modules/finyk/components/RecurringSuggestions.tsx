import { useMemo, useState } from "react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { cn } from "@shared/lib/cn";
import { Button } from "@shared/components/ui/Button";
import { detectRecurring } from "@sergeant/finyk-domain/lib/recurringDetect";

type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
type Confidence = "high" | "medium" | "low";

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "щотижня",
  biweekly: "раз на 2 тижні",
  monthly: "щомісяця",
  quarterly: "щокварталу",
  yearly: "щороку",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "висока",
  medium: "середня",
  low: "низька",
};

const CONFIDENCE_DOT: Record<Confidence, string> = {
  high: "bg-green-500",
  medium: "bg-amber-500",
  low: "bg-muted",
};

type RecurringCandidate = {
  key: string;
  displayName?: string;
  cadence: Cadence;
  confidence: Confidence;
  avgAmount: number;
  currency?: string;
  occurrences: number;
  billingDay?: number;
};

type SubscriptionLite = {
  id: string;
  keyword?: string;
  [extra: string]: unknown;
};

interface RecurringSuggestionsProps {
  transactions?: readonly Transaction[];
  subscriptions?: readonly SubscriptionLite[];
  dismissedRecurring?: readonly string[];
  excludedTxIds?: ReadonlySet<string> | readonly string[];
  onAdd?: (candidate: RecurringCandidate) => void;
  onDismiss?: (key: string) => void;
}

function fmtAmount(amount: number, currency: string | undefined) {
  const symbol = currency === "USD" ? "$" : "₴";
  const value = Math.round(amount * 100) / 100;
  return `${value.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ${symbol}`;
}

/**
 * Блок пропозицій можливих підписок, знайдених у транзакціях.
 * Рендериться лише, якщо detectRecurring повернув ≥1 кандидата.
 */
export function RecurringSuggestions({
  transactions,
  subscriptions,
  dismissedRecurring,
  excludedTxIds,
  onAdd,
  onDismiss,
}: RecurringSuggestionsProps) {
  const [open, setOpen] = useState(false);

  const candidates = useMemo<RecurringCandidate[]>(() => {
    if (!transactions || !transactions.length) return [];
    const excluded: string[] =
      excludedTxIds instanceof Set
        ? Array.from(excludedTxIds)
        : Array.isArray(excludedTxIds)
          ? [...excludedTxIds]
          : [];
    return detectRecurring(transactions as Transaction[], {
      subscriptions: (subscriptions || []) as SubscriptionLite[],
      dismissedKeys: (dismissedRecurring || []) as string[],
      excludedTxIds: excluded,
    }) as RecurringCandidate[];
  }, [transactions, subscriptions, dismissedRecurring, excludedTxIds]);

  if (!candidates.length) return null;

  return (
    <section className="mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-panelHi border border-line rounded-2xl text-left transition-colors hover:border-muted/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">💡</span>
          <div>
            <div className="text-sm font-bold text-text">
              Можливі підписки
              <span className="ml-2 text-style-caption text-muted">
                ({candidates.length})
              </span>
            </div>
            <div className="text-xs text-muted mt-0.5">
              Повторювані витрати — можна додати як підписки
            </div>
          </div>
        </div>
        <span className="text-xs text-muted shrink-0 ml-2">
          {open ? "Згорнути ↑" : "Розкласти ↓"}
        </span>
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {candidates.map((c) => (
            <li
              key={c.key}
              className="px-4 py-3 bg-panelHi border border-line rounded-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block w-2 h-2 rounded-full shrink-0",
                        CONFIDENCE_DOT[c.confidence],
                      )}
                      title={`Впевненість: ${CONFIDENCE_LABEL[c.confidence]}`}
                    />
                    <div className="text-style-label text-text truncate">
                      {c.displayName}
                    </div>
                  </div>
                  <div className="text-xs text-muted mt-1 space-x-2">
                    <span>~{fmtAmount(c.avgAmount, c.currency)}</span>
                    <span>·</span>
                    <span>{CADENCE_LABEL[c.cadence] || c.cadence}</span>
                    <span>·</span>
                    <span>{c.occurrences}×</span>
                    {c.cadence === "monthly" && (
                      <>
                        <span>·</span>
                        <span>{c.billingDay} числа</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => onAdd?.(c)}
                    className="whitespace-nowrap"
                  >
                    + Підписка
                  </Button>
                  <button
                    onClick={() => onDismiss?.(c.key)}
                    className="text-xs text-muted hover:text-text transition-colors px-2 py-1"
                  >
                    Приховати
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
