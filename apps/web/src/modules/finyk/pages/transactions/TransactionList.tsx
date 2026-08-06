/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { useState, useMemo, type ReactNode } from "react";
import { VirtualList } from "@shared/components/ui/VirtualList";
import { TxListItem } from "../../components/TxListItem";
import type { TxRowTx } from "../../components/TxRow";
import { SkeletonTransactionRow } from "@shared/components/ui/Skeleton";
import { Button } from "@shared/components/ui/Button";
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
import { getOnboardingGoals } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import type {
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type { TxAccount } from "./Transactions";

/** Typical rendered height of one `TxListItem` row, in px. */
const ROW_HEIGHT_PX = 64;

/** Typical rendered height of a `TransactionDayHeader` row, in px. */
const HEADER_HEIGHT_PX = 48;

/**
 * 1px-tall filler returned when a row index is briefly out of range
 * (e.g. mid-mutation, before the new counts/items propagate). A non-zero,
 * visually-empty filler keeps the measurement valid.
 */
function ListPlaceholder() {
  return <div aria-hidden className="h-px" />;
}

/**
 * #13 (Hybrid 1) — one virtualized row's slice of a per-day "paper" card.
 *
 * The card is border-less: every slice shares the same `bg-panel` surface so
 * flush neighbours read as one continuous panel, while the transparent
 * bottom gap (`pb`) on the group's last slice lets the page background show
 * through and separates days. Only the group's outer corners are rounded —
 * interior corners sit panel-on-panel and stay invisible, which also sidesteps
 * the rounded corners `SwipeToAction` paints on every row.
 *
 * `inset` draws the hairline divider between rows, indented past the category
 * icon so it aligns with the description text (replaces the old zebra bands).
 */
function DayCardShell({
  edge,
  inset = false,
  children,
}: {
  edge: "top" | "middle" | "bottom" | "single";
  inset?: boolean;
  children: ReactNode;
}) {
  const groupEnd = edge === "bottom" || edge === "single";
  const roundTop = edge === "top" || edge === "single";
  const roundBottom = edge === "bottom" || edge === "single";
  return (
    <div className={cn(groupEnd && "pb-2.5")}>
      {/* AI-CONTEXT: день транзакцій — це чек, і тепер він так і
          виглядає (П3 «край і зріз», рішення власника 2026-08-06 на
          `mockups/product/own-material-variants.html`). Замість
          скруглень: друкарська лінійка там, де день починається, і
          відривна перфорація там, де закінчується.

          Утиліти РОЗДІЛЕНІ саме заради цього місця. Група дня — це
          стос із кількох `DayCardShell`; якби лінійка й перфорація
          були одним класом, кожна транзакція отримала б обидві, і
          матеріал став би візерунком.

          AI-DANGER: `overflow-hidden` тут більше НЕ ставиться на
          перфорованому краю — він обрізав би маску, і зубці зникли б.
          Замість нього обрізанням займається сама маска. */}
      <div
        className={cn(
          "bg-panel",
          roundTop && "edge-rule border-line",
          roundBottom && "edge-perf",
          roundTop && !roundBottom && "overflow-hidden",
        )}
      >
        {inset && (
          <div
            aria-hidden
            className="ml-[3.4rem] mr-3 border-t border-line/45"
          />
        )}
        {children}
      </div>
    </div>
  );
}

/** Discriminated union for the flat render list fed to `VirtualList`. */
type RenderRow =
  | { kind: "header"; groupIndex: number; key: string; standalone: boolean }
  | {
      kind: "item";
      flatIndex: number;
      tx: Transaction;
      firstInGroup: boolean;
      lastInGroup: boolean;
    };

export interface TransactionListProps {
  /** Whether the underlying month is still loading (real or history). */
  loading: boolean;
  /** All-month list (incl. hidden) — used to decide whether to render the
   * skeleton block or the empty state. */
  activeTx: Transaction[];
  /**
   * Selected month has no rows, but the user does have transactions in other
   * months. Switches the empty slot from the first-run onboarding hero to a
   * month-scoped "цього місяця ще порожньо" state.
   */
  hasTransactionsOutsideMonth?: boolean;
  /** Human month label ("серпень 2026") for the month-scoped empty state. */
  monthLabel?: string;
  /** Jump one month back from the month-scoped empty state. */
  onGoPreviousMonth?: (() => void) | undefined;
  /** Filtered + sorted list of transactions to render in the virtual list. */
  filtered: Transaction[];
  /** Virtual list group spec — one entry per visible day. */
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
  /** User's own free-text annotation per bank transaction. */
  txNotes?: Record<string, string | undefined> | undefined;
  accounts: ReadonlyArray<TxAccount> | undefined;
  customCategories: CustomCategoryInput[] | undefined;
  onToggleSelect: (id: string) => void;
  onSwipeHideTx: (id: string) => void;
  onSwipeDeleteManual: (tx: Transaction) => void;
  /** Row tap opens the canonical editor for either transaction source. */
  onOpenTransaction: (tx: Transaction) => void;
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
 *   - the scroll-parent attachment for `VirtualList`
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
  hasTransactionsOutsideMonth = false,
  monthLabel,
  onGoPreviousMonth,
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
  txNotes = {},
  accounts,
  customCategories,
  onToggleSelect,
  onSwipeHideTx,
  onSwipeDeleteManual,
  onOpenTransaction,
  trailing,
  header,
  footer,
  onRefresh,
}: TransactionListProps) {
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const cloudPullPending = useCloudPullPending();
  // Read onboarding goals once per render — stable across the session.
  const onboardingGoals = useMemo(() => getOnboardingGoals(webKVStore), []);

  // Build a flat render list of alternating headers + item rows.
  // groupCounts[i] is 0 when the day is collapsed (set by the parent), so
  // collapsed days contribute only their header row.
  const renderRows = useMemo<RenderRow[]>(() => {
    const rows: RenderRow[] = [];
    let flatIdx = 0;
    groupedByDate.forEach((group, gi) => {
      const count = groupCounts[gi] ?? 0;
      // A collapsed day contributes only its header (count 0) → the header
      // becomes a self-contained rounded card (#13 Hybrid 1).
      rows.push({
        kind: "header",
        groupIndex: gi,
        key: group.key,
        standalone: count === 0,
      });
      for (let k = 0; k < count; k++) {
        const tx = flatItems[flatIdx];
        if (tx)
          rows.push({
            kind: "item",
            flatIndex: flatIdx,
            tx,
            firstInGroup: k === 0,
            lastInGroup: k === count - 1,
          });
        flatIdx++;
      }
    });
    return rows;
  }, [groupedByDate, groupCounts, flatItems]);

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

  // Three empty surfaces share the same DataState slot:
  //   • no-data-at-all (`activeTx` empty AND nothing in any other month) →
  //     tier-1 hero with the module-tuned copy/illustration via
  //     `ModuleEmptyState`. No inline action — the global "+ Додати витрату"
  //     FAB on `FinykApp` is the primary CTA and duplicating it inside the
  //     empty-state would be the anti-pattern called out in
  //     `docs/design/empty-states.md`.
  //   • month-empty (`activeTx` empty but the user HAS transactions in other
  //     months) → month-scoped state. The first-run hero here read as data
  //     loss: on 1 серпня, with Monobank connected and a full July history,
  //     the tab greeted the user with «Куди йдуть твої гроші? Додай першу
  //     витрату… Підключи Monobank» (founder report 2026-07-31).
  //   • filter-empty (`activeTx` has rows but the user's filter zeroed
  //     `filtered`) → keep the descriptive "Немає транзакцій" state and
  //     just tint the leading icon container with the finyk accent so
  //     the surface still feels owned by the module.
  const emptyFallback =
    activeTx.length === 0 && hasTransactionsOutsideMonth ? (
      <div className="rounded-2xl border border-dashed border-line bg-panelHi/40">
        <EmptyState
          illustration={<FinykEmptyIllustration size={80} />}
          title="Цей місяць ще порожній"
          description={
            // `monthLabel` is nominative ("серпень 2026 р.") — keep it after
            // "За", where Ukrainian accusative matches the nominative form for
            // masculine inanimate nouns, so no declension juggling is needed.
            monthLabel
              ? `За ${monthLabel} операцій поки немає. Попередні місяці на місці — гортай назад або додай запис вручну.`
              : "Операцій за цей місяць поки немає. Попередні місяці на місці — гортай назад або додай запис вручну."
          }
          module="finyk"
          action={
            onGoPreviousMonth ? (
              <Button variant="secondary" onClick={onGoPreviousMonth}>
                Попередній місяць
              </Button>
            ) : undefined
          }
        />
      </div>
    ) : activeTx.length === 0 ? (
      <ModuleEmptyState module="finyk" goalContext={onboardingGoals} />
    ) : (
      <div className="rounded-2xl border border-dashed border-line bg-panelHi/40">
        <EmptyState
          illustration={<FinykEmptyIllustration size={80} />}
          title="Немає транзакцій"
          description="Зміни місяць, фільтр або переключи «приховані», якщо вони є."
          module="finyk"
        />
      </div>
    );

  const content = (
    <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
      <h1 className="sr-only">Операції</h1>
      {header}
      <DataState
        query={txQuery}
        skeleton={skeleton}
        empty={emptyFallback}
        isEmpty={(data) => data.length === 0}
      >
        {() => (
          <div className="-mx-px">
            <VirtualList
              items={renderRows}
              estimateSize={(index) => {
                const row = renderRows[index];
                if (!row) return ROW_HEIGHT_PX;
                // Group-end rows carry the transparent day-gap (`pb`), so
                // seed the estimate a touch taller to reduce first-paint jump.
                if (row.kind === "header")
                  return HEADER_HEIGHT_PX + (row.standalone ? 10 : 0);
                return ROW_HEIGHT_PX + (row.lastInGroup ? 10 : 0);
              }}
              scrollElement={scrollParent}
              overscan={8}
              getItemKey={(_, row) =>
                row.kind === "header" ? `h-${row.key}` : `i-${row.flatIndex}`
              }
            >
              {(row) => {
                if (row.kind === "header") {
                  const group = groupedByDate[row.groupIndex];
                  if (!group) return <ListPlaceholder />;
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
                  // #9 — показуємо суму завжди, коли вона є, але за вимкненого
                  // «ока» (showBalance=false) віддаємо її розмитою, а не ховаємо.
                  const hasTotal = summary.statCount > 0;
                  return (
                    <DayCardShell edge={row.standalone ? "single" : "top"}>
                      <TransactionDayHeader
                        dayKey={key}
                        collapsed={collapsed}
                        summary={summary}
                        showTotal={hasTotal}
                        masked={!showBalance}
                        onToggle={toggleDay}
                      />
                    </DayCardShell>
                  );
                }
                // row.kind === "item"
                const t = row.tx;
                if (!t) return <ListPlaceholder />;
                const rowTx = t as TxRowTx;
                return (
                  <DayCardShell
                    edge={row.lastInGroup ? "bottom" : "middle"}
                    inset={!row.firstInGroup}
                  >
                    <TxListItem
                      tx={rowTx}
                      rowIndex={row.flatIndex}
                      selectMode={selectMode}
                      selected={selectMode && selectedIds.has(t.id)}
                      hidden={hiddenTxIdSet.has(t.id)}
                      overrideCatId={txCategories[t.id]}
                      txSplits={txSplits}
                      note={txNotes[t.id]}
                      accounts={accounts ?? []}
                      hideAmount={!showBalance}
                      customCategories={customCategories}
                      onToggleSelect={onToggleSelect}
                      onSwipeHideTx={onSwipeHideTx}
                      onSwipeDeleteManual={() => onSwipeDeleteManual(t)}
                      onOpenDetails={() => onOpenTransaction(t)}
                    />
                  </DayCardShell>
                );
              }}
            </VirtualList>
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
