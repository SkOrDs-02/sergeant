import { useCallback } from "react";
import { useToast } from "@shared/hooks/useToast";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { TransactionsHeader } from "./TransactionsHeader";
import { TransactionsBatchToolbar } from "./TransactionsBatchToolbar";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionList } from "./TransactionList";
import { TransactionSyncPill } from "./TransactionSyncPill";
import { useTransactionFilters } from "./useTransactionFilters";
import { useTransactionSelection } from "./useTransactionSelection";
import type {
  Transaction,
  TxCategoriesMap,
  TxSplit,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type { Category } from "@sergeant/finyk-domain/domain/types";

/**
 * Merged-account shape produced by `useUnifiedFinanceData` (Mono + Privat).
 * Privat entries are opaque except for the `_source` tag, so the slice
 * lists only the subset the page chain actually reads (id for the per-row
 * lookup, creditLimit for the "credit" filter chip). The `_source` tag
 * is included so the privatbank `{ _source: "privatbank" }` literal
 * isn't rejected by TS's weak-type check (all-optional target needs at
 * least one matching property).
 */
export interface TxAccount {
  id?: string;
  creditLimit?: number;
  type?: string;
  _source?: string;
}

type PillStatus = "idle" | "loading" | "success" | "partial" | "error";

const PILL_STATUSES: readonly PillStatus[] = [
  "idle",
  "loading",
  "success",
  "partial",
  "error",
];

function isPillStatus(s: string | undefined): s is PillStatus {
  return (
    typeof s === "string" && (PILL_STATUSES as readonly string[]).includes(s)
  );
}

/**
 * Sync status surfaced by the Mono fetcher chain. Status drives the
 * coloured pill in {@link TransactionSyncPill}; `lastUpdated` is rendered
 * underneath as a relative timestamp.
 */
interface MonoSyncState {
  // After `useUnifiedFinanceData` merges the mono + privat sync states,
  // `status` widens to `string` because the fall-through branch reads
  // `mono.syncState?.status` directly. Keep the slice in sync with that
  // wider shape; `TransactionSyncPill` discriminates on the narrow
  // values it understands and treats anything else as "idle".
  status: string;
  source?: "network" | "cache" | "none";
  accountsOk?: number;
  accountsTotal?: number;
}

/**
 * Slice of `useMonobank` (after `useUnifiedFinanceData` merging) that the
 * Transactions page reads. Defined inline to avoid a circular type import
 * on the lazy-loaded page module.
 */
export interface TransactionsMonoSlice {
  realTx: Transaction[];
  loadingTx: boolean;
  lastUpdated: Date | null;
  syncState: MonoSyncState;
  accounts: ReadonlyArray<TxAccount> | undefined;
  fetchMonth: (year: number, month: number) => Promise<unknown>;
  historyTx: Transaction[];
  loadingHistory: boolean;
  refresh: () => Promise<unknown>;
}

/**
 * Slice of `useStorage` that the Transactions page reads. Defined inline
 * for the same reason as {@link TransactionsMonoSlice}.
 */
export interface TransactionsStorageSlice {
  hiddenTxIds: string[];
  hideTx: (id: string) => void;
  excludedTxIds: Set<string>;
  excludedStatTxIds: string[] | undefined;
  toggleExcludeFromStats: (id: string) => void;
  txCategories: TxCategoriesMap;
  customCategories: Category[] | undefined;
  overrideCategory: (id: string, catId: string | null) => void;
  txSplits: TxSplitsMap;
  setSplitTx: (id: string, splits: TxSplit[]) => void;
  manualExpenses: ManualExpense[] | undefined;
  addManualExpense: (expense: ManualExpense) => void;
  removeManualExpense: (id: string) => void;
}

export interface TransactionsProps {
  mono: TransactionsMonoSlice;
  storage: TransactionsStorageSlice;
  showBalance?: boolean;
  categoryFilter?: string | null;
  onClearCategoryFilter?: () => void;
  onEditManualExpense?: (id: string) => void;
}

/**
 * Page shell for the Finyk Transactions tab. Composes:
 *   - {@link useTransactionFilters} — month/filter state, derived data
 *   - {@link useTransactionSelection} — batch select + undo handlers
 *   - {@link TransactionsHeader} — month switcher + action cluster
 *   - {@link TransactionSyncPill} — sync status pill
 *   - {@link TransactionFilters} — filter chip strip
 *   - {@link TransactionList} — virtualized day-grouped list
 *   - {@link TransactionsBatchToolbar} — bottom batch toolbar + cat picker
 *
 * `mono` and `storage` are still passed in as opaque object bags because
 * the call-site (FinykApp) constructs them from many hooks; threading
 * them per-field would change three more files. Each helper here picks
 * out exactly the slice it needs.
 */
export function Transactions({
  mono,
  storage,
  showBalance = true,
  categoryFilter,
  onClearCategoryFilter,
  onEditManualExpense,
}: TransactionsProps) {
  const toast = useToast();
  const {
    realTx,
    loadingTx,
    lastUpdated,
    syncState,
    accounts,
    fetchMonth,
    historyTx,
    loadingHistory,
    refresh: monoRefresh,
  } = mono;
  const {
    hiddenTxIds,
    hideTx,
    excludedTxIds,
    excludedStatTxIds,
    toggleExcludeFromStats,
    txCategories,
    customCategories,
    overrideCategory,
    txSplits,
    setSplitTx,
    manualExpenses,
    addManualExpense,
    removeManualExpense,
  } = storage;

  const filters = useTransactionFilters({
    realTx,
    historyTx,
    loadingTx,
    loadingHistory,
    manualExpenses,
    accounts,
    hiddenTxIds,
    excludedTxIds,
    txSplits,
    txCategories,
    customCategories,
    fetchMonth,
    categoryFilter,
    onClearCategoryFilter,
  });

  // PTR refresh runs the bank-side refetch (Mono + Privat, via the
  // unified `mergedRefresh`) **and** asks the App-level cloud-sync
  // engine to pull the latest queue/dirty state from the server. The
  // cloud-pull is awaited with a short timeout so the spinner never
  // sticks longer than the longest reasonable network hop.
  const handlePullRefresh = useCallback(async () => {
    await Promise.allSettled([
      typeof monoRefresh === "function" ? monoRefresh() : Promise.resolve(),
      requestCloudPull(2500),
    ]);
  }, [monoRefresh]);

  const selection = useTransactionSelection({
    hiddenTxIds,
    excludedStatTxIds,
    txCategories,
    hideTx,
    toggleExcludeFromStats,
    overrideCategory,
    setSplitTx,
    removeManualExpense,
    addManualExpense,
    onEditManualExpense,
    toast,
  });

  return (
    <TransactionList
      loading={filters.activeLoading}
      activeTx={filters.activeTx}
      filtered={filters.filtered}
      groupedByDate={filters.groupedByDate}
      groupCounts={filters.groupCounts}
      flatItems={filters.flatItems}
      collapsedKeys={filters.collapsedKeys}
      daySummaries={filters.daySummaries}
      showBalance={showBalance}
      toggleDay={filters.toggleDay}
      selectMode={selection.selectMode}
      selectedIds={selection.selectedIds}
      hiddenTxIdSet={filters.hiddenTxIdSet}
      txCategories={txCategories}
      txSplits={txSplits}
      accounts={accounts}
      customCategories={customCategories}
      onToggleSelect={selection.toggleSelect}
      onSwipeHideTx={selection.stableSwipeHideTx}
      onSwipeDeleteManual={selection.stableSwipeDeleteManual}
      onEditManual={selection.stableOnEditManual}
      onHideTx={selection.stableHideTx}
      onCatChange={selection.stableOverrideCategory}
      onSplitChange={selection.stableSetSplitTx}
      onRefresh={handlePullRefresh}
      header={
        <section aria-label="Керування операціями" className="mb-4 space-y-2.5">
          <TransactionsHeader
            monthLabel={filters.monthLabel}
            isCurrentMonth={filters.isCurrentMonth}
            goMonth={filters.goMonth}
            selectMode={selection.selectMode}
            exitSelectMode={selection.exitSelectMode}
            setSelectMode={selection.setSelectMode}
            showHidden={filters.showHidden}
            setShowHidden={filters.setShowHidden}
            hiddenCount={hiddenTxIds.length}
          />
          <TransactionSyncPill
            syncState={{
              status: isPillStatus(syncState.status)
                ? syncState.status
                : "idle",
              source: syncState.source,
              accountsOk: syncState.accountsOk,
              accountsTotal: syncState.accountsTotal,
            }}
            lastUpdated={lastUpdated}
          />
          <TransactionFilters
            filter={filters.filter}
            onChangeFilter={filters.setFilter}
            hasCreditAccounts={filters.creditAccIds.size > 0}
            catSpends={filters.catSpends}
          />
        </section>
      }
      trailing={
        filters.activeLoading && filters.activeTx.length > 0 ? (
          <p className="text-center text-xs text-subtle py-2">⟳ оновлення…</p>
        ) : null
      }
      footer={
        <TransactionsBatchToolbar
          selectMode={selection.selectMode}
          selectedSize={selection.selectedIds.size}
          onOpenCatPicker={() => selection.setBatchCatPicker(true)}
          onApplyHide={selection.applyBatchHide}
          onApplyExclude={selection.applyBatchExclude}
          batchCatPicker={selection.batchCatPicker}
          onCloseCatPicker={() => selection.setBatchCatPicker(false)}
          onApplyCategory={selection.applyBatchCategory}
          customCategories={customCategories}
        />
      }
    />
  );
}
