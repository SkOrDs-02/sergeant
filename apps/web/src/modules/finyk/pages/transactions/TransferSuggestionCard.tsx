import type { InternalTransferSuggestion } from "@sergeant/finyk-domain/domain/transferMatching";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import type { TxAccount } from "./Transactions";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import {
  describeTransferSuggestion,
  TransferLegs,
} from "./transferSuggestionParts";

interface TransferSuggestionCardProps {
  suggestion: InternalTransferSuggestion;
  accounts: ReadonlyArray<TxAccount> | undefined;
  showBalance: boolean;
  onConfirm: () => void;
  /** Permanent "Не переказ" rejection — neither operation resurfaces. */
  onReject: () => void;
  /** "Не зараз" — hides this pair until the next Kyiv calendar day. */
  onSnooze: () => void;
}

/**
 * Одна пропозиція «схоже на внутрішній переказ». Коли їх кілька, екран
 * показує `TransferSuggestionList` — усі разом, а не по одній.
 */
export function TransferSuggestionCard({
  suggestion,
  accounts,
  showBalance,
  onConfirm,
  onReject,
  onSnooze,
}: TransferSuggestionCardProps) {
  const view = describeTransferSuggestion(suggestion, accounts);
  const copy = messages.finyk.transferSuggestion;
  const credit = view.isCreditCardRepayment;

  return (
    <Card tone="finyk" prominence="panel" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-style-label text-text">
            {credit ? copy.creditRepaymentTitle : copy.title}
          </p>
          <p className="text-style-caption text-muted mt-0.5 truncate">
            {view.fromLabel} → {view.toLabel}
            {credit ? ` · ${copy.creditAccountTag}` : ""}
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
      <p className="text-style-caption text-muted leading-snug">
        {credit ? copy.creditRepaymentHint : copy.hint}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="solid"
          onClick={onConfirm}
          tone="ink"
        >
          {credit ? copy.creditRepaymentConfirm : copy.confirm}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReject}>
          {credit ? copy.creditRepaymentReject : copy.reject}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onSnooze}>
          {credit ? copy.creditRepaymentDismiss : copy.dismiss}
        </Button>
      </div>
    </Card>
  );
}
