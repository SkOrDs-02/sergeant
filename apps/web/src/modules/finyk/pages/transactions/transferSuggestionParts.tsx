/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Спільні частини пропозицій «схоже на внутрішній переказ»: підпис рахунку,
 * напрямок пари й рядки її ніг. Ними користуються і одиночна картка
 * (`TransferSuggestionCard`), і список, коли пропозицій кілька
 * (`TransferSuggestionList`).
 */
import type { InternalTransferSuggestion } from "@sergeant/finyk-domain/domain/transferMatching";
import { Money } from "@shared/components/ui/Money";
import { formatDateShort, KYIV_TIME_ZONE } from "@shared/lib/time/formatDate";
import type { TxAccount } from "./Transactions";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  black: "Чорна",
  white: "Біла",
  platinum: "Platinum",
  iron: "Iron",
  fop: "ФОП",
  yellow: "Жовта",
  jar: "Банка",
};

export function accountLabel(
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

export interface TransferSuggestionView {
  fromId: string | null;
  toId: string | null;
  fromLabel: string;
  toLabel: string;
  /**
   * Гроші лягають на рахунок із кредитним лімітом — це погашення, а не
   * переказ між двома «своїми» гаманцями, і питати треба саме про нього.
   */
  isCreditCardRepayment: boolean;
  amountUah: number;
}

export function describeTransferSuggestion(
  suggestion: InternalTransferSuggestion,
  accounts: ReadonlyArray<TxAccount> | undefined,
): TransferSuggestionView {
  const fromId =
    suggestion.outgoing.accountId ?? suggestion.outgoing._accountId ?? null;
  const toId =
    suggestion.incoming.accountId ?? suggestion.incoming._accountId ?? null;
  const toAccount = accounts?.find((account) => account.id === toId);
  return {
    fromId,
    toId,
    fromLabel: accountLabel(fromId, accounts),
    toLabel: accountLabel(toId, accounts),
    isCreditCardRepayment:
      typeof toAccount?.creditLimit === "number" && toAccount.creditLimit > 0,
    amountUah: Math.round(suggestion.amountMinor / 100),
  };
}

export function transferLegDate(
  tx: InternalTransferSuggestion["outgoing"],
): string {
  const seconds = Number(tx.time);
  const instant = Number.isFinite(seconds)
    ? seconds > 10_000_000_000
      ? seconds
      : seconds * 1000
    : 0;
  if (!instant) return "";
  return formatDateShort(new Date(instant), { timeZone: KYIV_TIME_ZONE });
}

interface TransferLegsProps {
  suggestion: InternalTransferSuggestion;
  view: TransferSuggestionView;
  accounts: ReadonlyArray<TxAccount> | undefined;
  showBalance: boolean;
}

/**
 * Дві ноги пари окремими рядками: дата, сума зі знаком, рахунок. Самих
 * підписів рахунків («Чорна • 1234 → Банка») не досить, щоб згадати, про
 * які саме операції мова.
 *
 * AI-CONTEXT: знак належить СУМІ, ніколи не даті. До 2026-09-14 рядки
 * читались «−11 вер. · Переказ на картку»: мінус прилипав до числа дня й
 * читався як «мінус одинадцяте», а сама сума стояла без знака в куті й не
 * належала жодній нозі (звіт власника про картку погашення кредитки).
 * Банківського опису в рядках немає навмисно: напрямок уже сказала стрілка
 * над ними, і повтор словами банку («Переказ на картку», «З Білої картки»)
 * був би третім переказом того самого факту.
 */
export function TransferLegs({
  suggestion,
  view,
  accounts,
  showBalance,
}: TransferLegsProps) {
  const legs = [
    {
      key: "outgoing",
      tx: suggestion.outgoing,
      accountId: view.fromId,
      sign: -1,
    },
    {
      key: "incoming",
      tx: suggestion.incoming,
      accountId: view.toId,
      sign: 1,
    },
  ] as const;
  return (
    <div className="mt-1 space-y-0.5">
      {legs.map((leg) => (
        <p
          key={leg.key}
          className="text-style-caption text-subtle flex items-baseline gap-2"
        >
          <span className="tabular-nums shrink-0">
            {transferLegDate(leg.tx)}
          </span>
          <span className="tabular-nums shrink-0">
            {showBalance ? (
              <Money amount={leg.sign * view.amountUah} signed tone="inherit" />
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
  );
}
