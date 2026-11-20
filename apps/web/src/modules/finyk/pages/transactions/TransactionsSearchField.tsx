/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Поле пошуку в шапці «Операцій» (Ф-2 (а), рішення власника OD-26,
 * 2026-11-18). Сам пошук чистий (`transactionSearch.ts`) і живе в
 * `useTransactionFilters`; тут лише поле, очищення й рядок «Знайдено N».
 */
import type { ReactNode } from "react";
import { pluralUa } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import {
  HIDE_NATIVE_SEARCH_CANCEL,
  SearchClearButton,
} from "@shared/components/ui/SearchClearButton";
import { messages } from "@shared/i18n/uk";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";

const copy = messages.finyk.transactionsSearch;

export function formatFoundOperations(count: number): string {
  return `${count} ${pluralUa(count, {
    one: copy.countOne,
    few: copy.countFew,
    many: copy.countMany,
  })}`;
}

export interface TransactionsSearchFieldProps {
  query: string;
  onQueryChange: (next: string) => void;
  /** Кількість знайдених операцій після вкладки й пошуку. */
  resultCount: number;
  /** Підпис періоду в знахідному відмінку («листопад 2026 р.»); `null` — без нього. */
  periodLabel: string | null;
  /** Праворуч від поля: кнопка «Фільтри» (Ф-2 (б)). */
  trailing?: ReactNode;
  /** Діють фільтри аркуша: рядок «Знайдено N» показується і без запиту. */
  narrowed?: boolean;
}

export function TransactionsSearchField({
  query,
  onQueryChange,
  resultCount,
  periodLabel,
  trailing,
  narrowed = false,
}: TransactionsSearchFieldProps) {
  const active = query.trim() !== "";
  const count = formatFoundOperations(resultCount);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            type="search"
            aria-label={copy.label}
            {...searchFieldProps("finyk-transactions-search")}
            placeholder={copy.placeholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            // Нативний хрестик `type="search"` дублював би власну кнопку
            // очищення нижче (зйомка 2026-11-18). Ховаємо лише тут: в інших
            // полях пошуку нативний хрестик може бути єдиним способом очистити.
            className={HIDE_NATIVE_SEARCH_CANCEL}
            onKeyDown={(event) => {
              if (event.key === "Escape" && active) {
                event.preventDefault();
                onQueryChange("");
              }
            }}
            icon={<Icon name="search" size="md" aria-hidden />}
            suffix={
              active ? (
                <SearchClearButton
                  label={copy.clear}
                  onClear={() => onQueryChange("")}
                  className="-mr-2"
                />
              ) : undefined
            }
          />
        </div>
        {trailing}
      </div>
      {/* При нулі збігів говорить порожній стан списку («Нічого не
          знайдено»), тож другого `role=status` поруч не ставимо. */}
      {(active || narrowed) && resultCount > 0 ? (
        <p
          className="px-1 text-style-caption text-subtle"
          role="status"
          aria-live="polite"
        >
          {periodLabel
            ? copy.foundInPeriod
                .replace("{count}", count)
                .replace("{period}", periodLabel)
            : copy.found.replace("{count}", count)}
        </p>
      ) : null}
    </div>
  );
}

/** «Нічого не знайдено» під активним пошуком, з дією очистити запит. */
export function TransactionsSearchEmpty({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    // `px-5`: у `EmptyState` немає бічного поля, без нього текст впритул
    // до рамки (зйомка 2026-11-18).
    <div className="rounded-panel border border-dashed border-line bg-panel px-5">
      <EmptyState
        title={copy.emptyTitle}
        description={copy.emptyDescription.replace("{query}", query.trim())}
        action={
          <Button variant="outline" onClick={onClear}>
            {copy.clear}
          </Button>
        }
      />
    </div>
  );
}
