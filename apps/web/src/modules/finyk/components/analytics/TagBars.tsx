import { useMemo } from "react";
import { aggregateSpendingByAccount } from "@sergeant/finyk-domain/domain/accountBreakdown";
import {
  aggregateSpendingByTag,
  type TxTagsMap,
} from "@sergeant/finyk-domain/domain/tags";
import type {
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import { CategoryBars } from "./CategoryBars";

const t = messages.finyk.tags;
const TAG_COLOR = "rgb(var(--c-chart-finyk))";

/**
 * «За тегами» (Р6.4): мова H через `CategoryBars`. Кожен тег рахує повну
 * суму своїх операцій, тож рядка «Разом» немає, а частка йде від витрат
 * періоду. Тап по тегу фільтрує всю Аналітику, як у «За рахунками».
 */
export function TagBars({
  transactions,
  previousTransactions,
  txTags,
  excludedTxIds,
  txSplits,
  selected,
  onSelect,
  showBalance,
}: {
  transactions: readonly Transaction[];
  previousTransactions: readonly Transaction[] | null;
  txTags: TxTagsMap;
  excludedTxIds: Set<string> | Iterable<string>;
  txSplits: TxSplitsMap;
  selected: string | null;
  onSelect: (tagKey: string | null) => void;
  showBalance: boolean;
}) {
  const opts = useMemo(
    () => ({ excludedTxIds: new Set(excludedTxIds), txSplits }),
    [excludedTxIds, txSplits],
  );
  const rows = useMemo(
    () => aggregateSpendingByTag(transactions, txTags, opts),
    [transactions, txTags, opts],
  );
  const periodSpentMinor = useMemo(
    () =>
      aggregateSpendingByAccount(transactions, opts).reduce(
        (s, r) => s + r.spentMinor,
        0,
      ),
    [transactions, opts],
  );
  const previous = useMemo(
    () =>
      previousTransactions
        ? aggregateSpendingByTag(previousTransactions, txTags, opts).map(
            (r) => ({ categoryId: r.key, prevMinor: r.spentMinor }),
          )
        : undefined,
    [previousTransactions, txTags, opts],
  );

  if (rows.length === 0 && selected === null) return null;
  const selectedLabel = rows.find((r) => r.key === selected)?.label ?? selected;

  return (
    <Card prominence="panel" padding="lg" data-testid="finyk-analytics-tags">
      <SectionHeading as="div" size="lg" className="mb-4" variant="text">
        {t.analyticsTitle}
      </SectionHeading>
      {selected !== null && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-style-label text-text">
            {t.filterActive.replace("{tag}", selectedLabel ?? "")}
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
          categoryId: r.key,
          label: r.label,
          spent: r.spentMinor / 100,
          color: TAG_COLOR,
        }))}
        previous={previous}
        showBalance={showBalance}
        overlapTotal={periodSpentMinor / 100}
        onSelectCategory={(key) => onSelect(key === selected ? null : key)}
      />
      <p className="mt-2 text-style-caption text-muted">{t.analyticsNote}</p>
    </Card>
  );
}
