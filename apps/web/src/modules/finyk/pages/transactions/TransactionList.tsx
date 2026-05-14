import { useState, type ReactNode } from "react";
import { GroupedVirtuoso } from "react-virtuoso";
import { TxListItem } from "../../components/TxListItem";
import type { TxRowTx } from "../../components/TxRow";
import { SkeletonTransactionRow } from "@shared/components/ui/Skeleton";
import { EmptyState, ModuleEmptyState } from "@shared/components/ui/EmptyState";
import { FinykEmptyIllustration } from "@shared/components/ui/EmptyStateIllustrations";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import {
  DataState,
  type DataStateQueryLike,
} from "@shared/components/ui/DataState";
import { useCloudPullPending } from "@shared/hooks/useCloudPullPending";
import { cn } from "@shared/lib/ui/cn";
import { TransactionDayHeader } from "./TransactionDayHeader";
import type { computeDaySummary } from "./transactionsLib";
import type {
  Transaction,
  TxCategoriesMap,
  TxSplit,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type { TxAccount } from "./Transactions";

export interface TransactionListProps {
  /** Whether the underlying month is still loading (real or history). */
  loading: boolean;
  /** All-month list (incl. hidden) — used to decide whether to render the
   * skeleton block or the empty state. */
  activeTx: Transaction[];
  /** Filtered + sorted list of transactions to render in the virtual list. */
  filtered: Transaction[];
  /** `GroupedVirtuoso` group spec — one entry per visible day. */
  groupedByDate: { key: string; items: Transaction[] }[];
  groupCounts: number[];
  flatItems: Transaction[];
  collapsedKeys: Set<string>;
  daySummaries: Record<string, ReturnType<typeof computeDaySummary>>;
  showBalance: boolean;
  toggleDay: (key: string) => void;
  // Row props pass-through:
  selectMode: boolean;
  selectedIds: Set<string>;
  hiddenTxIdSet: Set<string>;
  txCategories: TxCategoriesMap;
  txSplits: TxSplitsMap;
  accounts: ReadonlyArray<TxAccount> | undefined;
  customCategories: CustomCategoryInput[] | undefined;
  onToggleSelect: (id: string) => void;
  onSwipeHideTx: (id: string) => void;
  onSwipeDeleteManual: (tx: Transaction) => void;
  onEditManual: (manualId?: string) => void;
  onHideTx: (id: string) => void;
  onCatChange: (id: string, catId: string | null) => void;
  onSplitChange: (id: string, splits: TxSplit[]) => void;
  /** Bottom-of-list "still loading…" text shown when refreshing a non-
   * empty list. */
  trailing?: ReactNode;
  /** Sticky controls block rendered above the virtualized list. */
  header?: ReactNode;
  /** Auxiliary footer (e.g. batch toolbar) rendered as a sibling to the
   * scroll container so it floats over the page chrome. */
  footer?: ReactNode;
  /**
   * Callback for the iOS-style pull-to-refresh gesture. When provided,
   * the scroll container hosts the gesture and the indicator. The
   * promise should resolve when the underlying data has finished
   * refetching so the spinner unwinds at the right moment.
   */
  onRefresh?: () => Promise<void> | void;
}

/**
 * Virtualized transaction list. Owns:
 *   - the scroll-parent attachment for `GroupedVirtuoso`
 *   - skeleton block while the first month load is in flight
 *   - empty state when filters yield zero rows
 *   - day-group headers + the row renderer
 *
 * All filtering/sorting/grouping logic lives in `useTransactionFilters`;
 * this component only renders.
 */
export function TransactionList({
  loading,
  activeTx,
  filtered,
  groupedByDate,
  groupCounts,
  flatItems,
  collapsedKeys,
  daySummaries,
  showBalance,
  toggleDay,
  selectMode,
  selectedIds,
  hiddenTxIdSet,
  txCategories,
  txSplits,
  accounts,
  customCategories,
  onToggleSelect,
  onSwipeHideTx,
  onSwipeDeleteManual,
  onEditManual,
  onHideTx,
  onCatChange,
  onSplitChange,
  trailing,
  header,
  footer,
  onRefresh,
}: TransactionListProps) {
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const cloudPullPending = useCloudPullPending();

  // DataState contract:
  //   - `data === undefined` triggers the skeleton slot. We mark the
  //     query as still-loading only on the very first paint, when the
  //     parent month list is empty (`activeTx.length === 0`); subsequent
  //     background refetches keep `data` defined so the existing list
  //     stays visible while a stale-revalidate happens.
  //   - `isEmpty` reads the post-filter list (`filtered`) so the empty
  //     slot shows when filters/exclusions hide every row, not when the
  //     month payload itself is empty (which the skeleton already covers
  //     during the first paint).
  const txQuery: DataStateQueryLike<readonly Transaction[]> = {
    data: loading && activeTx.length === 0 ? undefined : filtered,
    isLoading: loading,
  };

  const skeleton = (
    // Skeleton — shape-aware: matches a real TxRow (icon · 2-line
    // description · amount). Stagger fades down so the list feels
    // like it's "loading from the top" instead of pulsing as a slab.
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array(10)
        .fill(0)
        .map((_, i) => (
          <SkeletonTransactionRow
            key={i}
            module="finyk"
            className={cn(
              i < 3
                ? "opacity-100"
                : i < 6
                  ? "opacity-80"
                  : i < 8
                    ? "opacity-60"
                    : "opacity-40",
            )}
          />
        ))}
    </div>
  );

  // Two empty surfaces share the same DataState slot:
  //   • month-empty (`activeTx` itself has no rows) → tier-1 hero with the
  //     module-tuned copy/illustration via `ModuleEmptyState`. No inline
  //     action — the global "+ Додати витрату" FAB on `FinykApp` is the
  //     primary CTA and duplicating it inside the empty-state would be
  //     the anti-pattern called out in `docs/design/empty-states.md`.
  //   • filter-empty (`activeTx` has rows but the user's filter zeroed
  //     `filtered`) → keep the descriptive "Немає транзакцій" state and
  //     just tint the leading icon container with the finyk accent so
  //     the surface still feels owned by the module.
  const emptyFallback =
    activeTx.length === 0 ? (
      <ModuleEmptyState module="finyk" />
    ) : (
      <div className="rounded-2xl border border-dashed border-line bg-panelHi/40">
        <EmptyState
          icon={<FinykEmptyIllustration size={80} />}
          title="Немає транзакцій"
          description="Зміни місяць, фільтр або переключи «приховані», якщо вони є."
          module="finyk"
        />
      </div>
    );

  const content = (
    <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
      {header}
      <DataState
        query={txQuery}
        skeleton={skeleton}
        empty={emptyFallback}
        isEmpty={(data) => data.length === 0}
      >
        {() => (
          <div className="rounded-2xl border border-line/40 overflow-hidden -mx-px">
            <GroupedVirtuoso
              customScrollParent={scrollParent ?? undefined}
              groupCounts={groupCounts}
              increaseViewportBy={{ top: 400, bottom: 400 }}
              groupContent={(groupIndex) => {
                const group = groupedByDate[groupIndex];
                if (!group) return null;
                const key = group.key;
                const collapsed = collapsedKeys.has(key);
                const summary = daySummaries[key] ?? {
                  total: 0,
                  count: 0,
                  statCount: 0,
                };
                // Коли у день є тільки «не в статистиці» транзакції, сховати
                // суму — інакше побачимо «0,00₴» або (як раніше) злиплі
                // перекази у вигляді доходу.
                const showTotal = showBalance && summary.statCount > 0;
                return (
                  <TransactionDayHeader
                    dayKey={key}
                    collapsed={collapsed}
                    summary={summary}
                    showTotal={showTotal}
                    onToggle={toggleDay}
                  />
                );
              }}
              itemContent={(index) => {
                const t = flatItems[index];
                if (!t) return null;
                const rowTx = t as TxRowTx;
                return (
                  <TxListItem
                    tx={rowTx}
                    rowIndex={index}
                    selectMode={selectMode}
                    selected={selectMode && selectedIds.has(t.id)}
                    hidden={hiddenTxIdSet.has(t.id)}
                    overrideCatId={txCategories[t.id]}
                    txSplits={txSplits}
                    accounts={accounts ?? []}
                    hideAmount={!showBalance}
                    customCategories={customCategories}
                    onToggleSelect={onToggleSelect}
                    onSwipeHideTx={onSwipeHideTx}
                    onSwipeDeleteManual={() => onSwipeDeleteManual(t)}
                    onEditManual={onEditManual}
                    onHideTx={onHideTx}
                    onCatChange={onCatChange}
                    onSplitChange={(id, splits) =>
                      onSplitChange(id, (splits ?? []) as TxSplit[])
                    }
                  />
                );
              }}
            />
          </div>
        )}
      </DataState>

      {trailing}
    </div>
  );

  return (
    <>
      {onRefresh ? (
        <PullToRefresh
          onRefresh={onRefresh}
          variant="finyk"
          enabled={!cloudPullPending}
          onScrollElement={setScrollParent}
        >
          {content}
        </PullToRefresh>
      ) : (
        <div ref={setScrollParent} className="flex-1 overflow-y-auto">
          {content}
        </div>
      )}
      {footer}
    </>
  );
}
