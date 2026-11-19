/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Пропозиції «схоже на внутрішній переказ» — усі разом.
 *
 * AI-CONTEXT (фідбек власника 2026-11-19, «має питати всі одразу і не
 * повторюватися»): екран показував першу пропозицію з черги, і після
 * кожної відповіді спливала наступна. Людина бачила це як «знаходить нові,
 * про які не питало раніше». Тепер одна пропозиція — звична картка
 * (`TransferSuggestionCard`), дві й більше — один список: кожну пару можна
 * підтвердити чи відхилити окремо, а «Усе це перекази» і «Не зараз»
 * відповідають за всі показані разом.
 */
import type { InternalTransferSuggestion } from "@sergeant/finyk-domain/domain/transferMatching";
import { transferSuggestionPairKey } from "@sergeant/finyk-domain/domain/transferMatching";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import type { TxAccount } from "./Transactions";
import { TransferSuggestionCard } from "./TransferSuggestionCard";
import {
  describeTransferSuggestion,
  transferLegDate,
  TransferLegs,
} from "./transferSuggestionParts";

export interface TransferSuggestionsProps {
  suggestions: readonly InternalTransferSuggestion[];
  accounts: ReadonlyArray<TxAccount> | undefined;
  showBalance: boolean;
  onConfirm: (suggestion: InternalTransferSuggestion) => void;
  onReject: (suggestion: InternalTransferSuggestion) => void;
  /** «Не зараз» для однієї картки — до наступної київської доби. */
  onSnooze: (suggestion: InternalTransferSuggestion) => void;
  onConfirmAll: () => void;
  onSnoozeAll: () => void;
}

export function TransferSuggestions({
  suggestions,
  accounts,
  showBalance,
  onConfirm,
  onReject,
  onSnooze,
  onConfirmAll,
  onSnoozeAll,
}: TransferSuggestionsProps) {
  const first = suggestions[0];
  if (!first) return null;
  if (suggestions.length === 1) {
    return (
      <TransferSuggestionCard
        suggestion={first}
        accounts={accounts}
        showBalance={showBalance}
        onConfirm={() => onConfirm(first)}
        onReject={() => onReject(first)}
        onSnooze={() => onSnooze(first)}
      />
    );
  }

  const copy = messages.finyk.transferSuggestion;
  const count = suggestions.length;
  return (
    <Card
      tone="finyk"
      prominence="panel"
      className="space-y-3"
      aria-label={copy.listTitle}
      role="region"
    >
      <div>
        <p className="text-style-label text-text">{copy.listTitle}</p>
        <p className="text-style-caption text-muted mt-0.5">
          {copy.listCount.replace("{n}", String(count))}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {suggestions.map((suggestion) => {
          const view = describeTransferSuggestion(suggestion, accounts);
          const confirmLabel = view.isCreditCardRepayment
            ? copy.rowCreditConfirm
            : copy.rowConfirm;
          // Короткі «Переказ»/«Ні» в рядку однакові для всіх пар, тож
          // скрінрідеру назва кнопки каже, про ЯКУ пару мова.
          const pairName = `${view.fromLabel} → ${view.toLabel}, ${transferLegDate(
            suggestion.outgoing,
          )}`;
          return (
            <li
              key={transferSuggestionPairKey(suggestion)}
              className="py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-style-caption text-muted truncate">
                    {view.fromLabel} → {view.toLabel}
                    {view.isCreditCardRepayment
                      ? ` · ${copy.creditAccountTag}`
                      : ""}
                  </p>
                  <TransferLegs
                    suggestion={suggestion}
                    view={view}
                    accounts={accounts}
                    showBalance={showBalance}
                  />
                </div>
                <span className="text-style-label tabular-nums text-text shrink-0">
                  {showBalance ? (
                    <Money amount={view.amountUah} tone="inherit" />
                  ) : (
                    "••••"
                  )}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`${confirmLabel}: ${pairName}`}
                  onClick={() => onConfirm(suggestion)}
                >
                  {confirmLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`${copy.rowRejectAria}: ${pairName}`}
                  onClick={() => onReject(suggestion)}
                >
                  {copy.rowReject}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-style-caption text-muted leading-snug">
        {copy.listHint}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="solid"
          tone="ink"
          onClick={onConfirmAll}
        >
          {copy.confirmAll}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onSnoozeAll}>
          {copy.dismissAll}
        </Button>
      </div>
    </Card>
  );
}
