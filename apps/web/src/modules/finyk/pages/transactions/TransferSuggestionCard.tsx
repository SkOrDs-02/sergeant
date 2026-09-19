import type { InternalTransferSuggestion } from "@sergeant/finyk-domain/domain/transferMatching";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import type { TxAccount } from "./Transactions";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { formatDateShort, KYIV_TIME_ZONE } from "@shared/lib/time/formatDate";

interface TransferSuggestionCardProps {
  suggestion: InternalTransferSuggestion;
  accounts: ReadonlyArray<TxAccount> | undefined;
  showBalance: boolean;
  onConfirm: () => void;
  /** Permanent "Не переказ" rejection — this pair never resurfaces. */
  onReject: () => void;
  /** "Не зараз" — hides this pair until the next Kyiv calendar day. */
  onSnooze: () => void;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  black: "Чорна",
  white: "Біла",
  platinum: "Platinum",
  iron: "Iron",
  fop: "ФОП",
  yellow: "Жовта",
  jar: "Банка",
};

function accountLabel(
  accountId: string | null,
  accounts: ReadonlyArray<TxAccount> | undefined,
): string {
  const account = accounts?.find((item) => item.id === accountId);
  const type = typeof account?.type === "string" ? account.type : "";
  const base = ACCOUNT_TYPE_LABELS[type] ?? type ?? "";
  const maskedPan = Array.isArray(account?.["maskedPan"])
    ? account["maskedPan"].find(
        (value): value is string => typeof value === "string",
      )
    : null;
  const lastFour = maskedPan?.replace(/\D/g, "").slice(-4);
  if (base && lastFour) return `${base} • ${lastFour}`;
  if (base) return base;
  return accountId ? `Рахунок • ${accountId.slice(-4)}` : "Власний рахунок";
}

export function TransferSuggestionCard({
  suggestion,
  accounts,
  showBalance,
  onConfirm,
  onReject,
  onSnooze,
}: TransferSuggestionCardProps) {
  const fromId =
    suggestion.outgoing.accountId ?? suggestion.outgoing._accountId;
  const toId = suggestion.incoming.accountId ?? suggestion.incoming._accountId;
  // Money landing on a credit-card account is a repayment, not a transfer
  // between two "own money" pots — the hint needs to explain that the
  // spending already happened (the card purchases), not this movement.
  const toAccount = accounts?.find((account) => account.id === toId);
  const isCreditCardRepayment =
    typeof toAccount?.creditLimit === "number" && toAccount.creditLimit > 0;
  const amountUah = Math.round(suggestion.amountMinor / 100);
  // Account labels alone ("Чорна • 1234 → Банка") do not let the user recall
  // which pair of operations this is about, so each side gets its own row.
  //
  // AI-CONTEXT: the sign belongs to the AMOUNT, never to the date. Until
  // 2026-09-14 these rows read "−11 вер. · Переказ на картку": the minus
  // was glued to the day number and parsed as "мінус одинадцяте", while the
  // sum itself sat unsigned in the corner and belonged to neither leg
  // (owner's report on the credit-repayment card). The bank description is
  // gone from the rows on purpose — direction was already stated by the
  // arrow above, and repeating it in the bank's own words ("Переказ на
  // картку", "З Білої картки") made a third telling of the same fact.
  const legDate = (tx: InternalTransferSuggestion["outgoing"]): string => {
    const seconds = Number(tx.time);
    const instant = Number.isFinite(seconds)
      ? seconds > 10_000_000_000
        ? seconds
        : seconds * 1000
      : 0;
    if (!instant) return "";
    return formatDateShort(new Date(instant), { timeZone: KYIV_TIME_ZONE });
  };
  const legs = [
    { key: "outgoing", tx: suggestion.outgoing, accountId: fromId, sign: -1 },
    { key: "incoming", tx: suggestion.incoming, accountId: toId, sign: 1 },
  ] as const;

  return (
    <Card module="finyk" prominence="soft" radius="lg" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-style-label text-text">
            {isCreditCardRepayment
              ? messages.finyk.transferSuggestion.creditRepaymentTitle
              : messages.finyk.transferSuggestion.title}
          </p>
          <p className="text-style-caption text-muted mt-0.5 truncate">
            {accountLabel(fromId, accounts)} → {accountLabel(toId, accounts)}
            {isCreditCardRepayment
              ? ` · ${messages.finyk.transferSuggestion.creditAccountTag}`
              : ""}
          </p>
          <div className="mt-1 space-y-0.5">
            {legs.map((leg) => (
              <p
                key={leg.key}
                className="text-style-caption text-subtle flex items-baseline gap-2"
              >
                <span className="tabular-nums shrink-0">{legDate(leg.tx)}</span>
                <span className="tabular-nums shrink-0">
                  {showBalance ? (
                    <Money
                      amount={leg.sign * amountUah}
                      signed
                      tone="inherit"
                    />
                  ) : (
                    "••••"
                  )}
                </span>
                <span className="truncate">
                  {accountLabel(leg.accountId, accounts)}
                </span>
              </p>
            ))}
          </div>
        </div>
        <span className="text-style-label tabular-nums text-finyk-strong dark:text-finyk shrink-0">
          {showBalance ? <Money amount={amountUah} tone="inherit" /> : "••••"}
        </span>
      </div>
      <p className="text-style-caption text-muted leading-snug">
        {isCreditCardRepayment
          ? messages.finyk.transferSuggestion.creditRepaymentHint
          : messages.finyk.transferSuggestion.hint}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="solid"
          tone="finyk"
          onClick={onConfirm}
        >
          {isCreditCardRepayment
            ? messages.finyk.transferSuggestion.creditRepaymentConfirm
            : messages.finyk.transferSuggestion.confirm}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          tone="neutral"
          onClick={onReject}
        >
          {isCreditCardRepayment
            ? messages.finyk.transferSuggestion.creditRepaymentReject
            : messages.finyk.transferSuggestion.reject}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onSnooze}>
          {isCreditCardRepayment
            ? messages.finyk.transferSuggestion.creditRepaymentDismiss
            : messages.finyk.transferSuggestion.dismiss}
        </Button>
      </div>
    </Card>
  );
}
