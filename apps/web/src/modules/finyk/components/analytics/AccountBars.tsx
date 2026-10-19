import { useMemo } from "react";
import { chartHex } from "@sergeant/design-tokens/tokens";
import { CASH_ACCOUNT_ID } from "@sergeant/finyk-domain/constants";
import {
  aggregateSpendingByAccount,
  NO_ACCOUNT_KEY,
} from "@sergeant/finyk-domain/domain/accountBreakdown";
import type {
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import { getAccountVisual } from "../../lib/accountVisual";
import { CategoryBars } from "./CategoryBars";

const t = messages.finyk.cashOnHand;
const ACCOUNT_COLOR = "rgb(var(--c-chart-finyk))";

export interface AccountBarsAccount {
  id?: string | undefined;
  type?: string | undefined;
  creditLimit?: number | undefined;
  maskedPan?: unknown;
}

function accountLabel(
  key: string,
  accounts: readonly AccountBarsAccount[],
): string {
  if (key === CASH_ACCOUNT_ID) return t.title;
  if (key === NO_ACCOUNT_KEY) return t.noAccount;
  const acc = accounts.find((a) => a.id === key);
  if (!acc) return t.cardFallback;
  const pan = Array.isArray(acc.maskedPan)
    ? acc.maskedPan.find((v): v is string => typeof v === "string")
    : undefined;
  const last4 = pan?.replace(/\D/g, "").slice(-4);
  const name = getAccountVisual(acc).name;
  return last4 ? `${name} • ${last4}` : name;
}

/**
 * «За рахунками» (Р4): мова H через `CategoryBars`, той самий рядок і
 * привид минулого періоду. Тап по рахунку фільтрує всю Аналітику, повторний
 * тап або «Усі рахунки» знімає фільтр.
 */
export function AccountBars({
  transactions,
  previousTransactions,
  excludedTxIds,
  txSplits,
  accounts,
  selected,
  onSelect,
  showBalance,
  title,
}: {
  title: string;
  transactions: readonly Transaction[];
  previousTransactions: readonly Transaction[] | null;
  excludedTxIds: Set<string> | Iterable<string>;
  txSplits: TxSplitsMap;
  accounts: readonly AccountBarsAccount[];
  selected: string | null;
  onSelect: (accountKey: string | null) => void;
  showBalance: boolean;
}) {
  const rows = useMemo(
    () => aggregateSpendingByAccount(transactions, { excludedTxIds, txSplits }),
    [transactions, excludedTxIds, txSplits],
  );
  const previous = useMemo(
    () =>
      previousTransactions
        ? aggregateSpendingByAccount(previousTransactions, {
            excludedTxIds,
            txSplits,
          }).map((r) => ({ categoryId: r.accountKey, prevMinor: r.spentMinor }))
        : undefined,
    [previousTransactions, excludedTxIds, txSplits],
  );

  // Один рахунок без фільтра нічого не розрізає: блок мовчить.
  if (rows.length < 2 && selected === null) return null;

  return (
    <Card
      prominence="panel"
      padding="lg"
      data-testid="finyk-analytics-accounts"
    >
      <SectionHeading as="div" size="lg" className="mb-4" variant="text">
        {title}
      </SectionHeading>
      {selected !== null && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-style-label text-text">
            {t.filterActive.replace(
              "{account}",
              accountLabel(selected, accounts),
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelect(null)}
          >
            {t.filterClear}
          </Button>
        </div>
      )}
      <CategoryBars
        data={rows.map((r) => ({
          categoryId: r.accountKey,
          label: accountLabel(r.accountKey, accounts),
          spent: r.spentMinor / 100,
          color:
            r.accountKey === NO_ACCOUNT_KEY ? chartHex.neutral : ACCOUNT_COLOR,
        }))}
        previous={previous}
        showBalance={showBalance}
        onSelectCategory={(key) => onSelect(key === selected ? null : key)}
      />
    </Card>
  );
}
