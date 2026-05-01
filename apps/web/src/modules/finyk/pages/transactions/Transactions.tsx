import { Card } from "@shared/components/ui/Card";
import { useToast } from "@shared/hooks/useToast";
import { TransactionsHeader } from "./TransactionsHeader";
import { TransactionsBatchToolbar } from "./TransactionsBatchToolbar";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionList } from "./TransactionList";
import { TransactionSyncPill } from "./TransactionSyncPill";
import { useTransactionFilters } from "./useTransactionFilters";
import { useTransactionSelection } from "./useTransactionSelection";

export interface TransactionsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mono: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: any;
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
    refresh,
    syncState,
    accounts,
    fetchMonth,
    historyTx,
    loadingHistory,
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
      header={
        <Card
          as="section"
          radius="lg"
          padding="sm"
          aria-label="Керування операціями"
          className="mb-4 space-y-2.5"
        >
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
            refresh={refresh}
            loading={filters.activeLoading}
          />
          <TransactionSyncPill
            syncState={syncState}
            lastUpdated={lastUpdated}
          />
          <TransactionFilters
            filter={filters.filter}
            onChangeFilter={filters.setFilter}
            hasCreditAccounts={filters.creditAccIds.size > 0}
            catSpends={filters.catSpends}
          />
        </Card>
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
