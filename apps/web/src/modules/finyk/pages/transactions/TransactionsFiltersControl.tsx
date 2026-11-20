/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Обвʼязка аркуша «Фільтри» в «Операціях» (Ф-2 (б), спека
 * `docs/work/specs/finyk-operations-filters.md`): кнопка біля пошуку, сам
 * аркуш лінивим чанком, плашка активних фільтрів над списком зі скиданням
 * одним тапом і чесний порожній стан. Стан фільтрів живе в
 * `useTransactionFilters`, тут лише показ.
 */
import { Suspense, useState } from "react";
import { tagKey, type TxTagsMap } from "@sergeant/finyk-domain/domain/tags";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Spinner } from "@shared/components/ui/Spinner";
import { finykTxFiltersMessages as copy } from "@shared/i18n/uk.finykTxFilters";
import { lazyImport } from "../../../../core/lib/lazyImport";
import { accountLabel, type LabelledAccount } from "../../lib/accountLabel";
import { TransactionsFilterChip } from "./TransactionsFilterChip";
import {
  countActiveAdvancedFilters,
  formatTxAmountKop as amountText,
  type TxAdvancedFilters,
} from "./transactionAdvancedFilters";

const TransactionsFiltersSheet = lazyImport(
  () => import("./TransactionsFiltersSheet"),
  "TransactionsFiltersSheet",
);

/** Підпис плашки: «від 1 000 ₴ · Готівка на руках · Кава». */
export function describeAdvancedFilters(
  f: TxAdvancedFilters,
  accounts: readonly LabelledAccount[],
  tags: TxTagsMap | undefined,
): string {
  const parts: string[] = [];
  if (f.minKop !== null && f.maxKop !== null) {
    parts.push(
      copy.chipAmountRange
        .replace("{from}", amountText(f.minKop))
        .replace("{to}", amountText(f.maxKop)),
    );
  } else if (f.minKop !== null) {
    parts.push(copy.chipAmountFrom.replace("{from}", amountText(f.minKop)));
  } else if (f.maxKop !== null) {
    parts.push(copy.chipAmountTo.replace("{to}", amountText(f.maxKop)));
  }
  if (f.accountKey !== null) parts.push(accountLabel(f.accountKey, accounts));
  if (f.tagKey !== null) {
    // Написання першого вжитку, як у рядку операції; ключ — запасний шлях.
    let label = f.tagKey;
    for (const list of Object.values(tags ?? {})) {
      const hit = list.find((t) => tagKey(t) === f.tagKey);
      if (hit) {
        label = hit;
        break;
      }
    }
    parts.push(label);
  }
  return parts.join(" · ");
}

export interface TransactionsFiltersButtonProps {
  value: TxAdvancedFilters;
  baseList: Transaction[];
  monthTx: readonly Transaction[];
  tags: TxTagsMap | undefined;
  accounts: readonly LabelledAccount[];
  onApply: (next: TxAdvancedFilters) => void;
}

/** «Фільтри» / «Фільтри · 2» біля поля пошуку; тап відкриває аркуш. */
export function TransactionsFiltersButton({
  value,
  baseList,
  monthTx,
  tags,
  accounts,
  onApply,
}: TransactionsFiltersButtonProps) {
  const [open, setOpen] = useState(false);
  const count = countActiveAdvancedFilters(value);
  return (
    <>
      <Button
        variant="outline"
        className="shrink-0 h-12"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {count > 0
          ? copy.openActive.replace("{count}", String(count))
          : copy.open}
      </Button>
      {open && (
        <Suspense
          fallback={
            <div
              role="status"
              aria-label={copy.sheetTitle}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            >
              <Spinner size="lg" />
            </div>
          }
        >
          <TransactionsFiltersSheet
            value={value}
            baseList={baseList}
            monthTx={monthTx}
            tags={tags}
            accounts={accounts}
            onClose={() => setOpen(false)}
            onApply={(next: TxAdvancedFilters) => {
              setOpen(false);
              onApply(next);
            }}
          />
        </Suspense>
      )}
    </>
  );
}

/** Плашка над списком: що діє і «Скинути» одним тапом. */
export function TransactionsActiveFiltersChip({
  value,
  accounts,
  tags,
  onClear,
}: {
  value: TxAdvancedFilters;
  accounts: readonly LabelledAccount[];
  tags: TxTagsMap | undefined;
  onClear: () => void;
}) {
  if (countActiveAdvancedFilters(value) === 0) return null;
  return (
    <TransactionsFilterChip
      label={describeAdvancedFilters(value, accounts, tags)}
      clearLabel={copy.chipClear}
      clearAria={copy.chipClearAria}
      onClear={onClear}
    />
  );
}

/**
 * Порожній результат під фільтрами аркуша. Коли разом діє пошук, одна дія
 * знімає обидва: інакше після «Скинути фільтри» людина могла б упертись у
 * той самий порожній список уже через пошук.
 */
export function TransactionsFiltersEmpty({
  withSearch,
  onReset,
}: {
  withSearch: boolean;
  onReset: () => void;
}) {
  return (
    <div className="rounded-panel border border-dashed border-line bg-panel px-5">
      <EmptyState
        title={copy.emptyTitle}
        description={copy.emptyDescription}
        action={
          <Button variant="outline" onClick={onReset}>
            {withSearch ? copy.emptyResetAll : copy.emptyReset}
          </Button>
        }
      />
    </div>
  );
}
