import { useCallback, useMemo, useState } from "react";
import { useToast } from "@shared/hooks/useToast";
import { useTransactionsPullRefresh } from "./useTransactionsPullRefresh";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { failedCopy } from "@shared/i18n/failedCopy";
import { TransactionsHeader } from "./TransactionsHeader";
import { exportTransactionsCsv } from "./exportTransactionsCsv";
import { TransactionsBatchToolbar } from "./TransactionsBatchToolbar";
import { TransactionFilters } from "./TransactionFilters";
import { CategoryTrend } from "./CategoryTrend";
import { TransactionList } from "./TransactionList";
import { TransactionSyncPill } from "./TransactionSyncPill";
import { TransactionsFilterChip } from "./TransactionsFilterChip";
import {
  TransactionsSearchEmpty,
  TransactionsSearchField,
} from "./TransactionsSearchField";
import {
  TransactionsActiveFiltersChip,
  TransactionsFiltersButton,
  TransactionsFiltersEmpty,
} from "./TransactionsFiltersControl";
import type { LabelledAccount } from "../../lib/accountLabel";
import { formatAnalyticsPeriod } from "../../lib/analyticsPeriodLabel";
import { useTransactionFilters } from "./useTransactionFilters";
import { formatDayFilterDate, isDayFilterKey } from "./transactionsLib";
import { useTransactionSelection } from "./useTransactionSelection";
import { useFocusTransaction } from "./useFocusTransaction";
import { BankTransactionDetailsSheet } from "../../components/BankTransactionDetailsSheet";
import { useDebtPaymentSplitSync } from "../../hooks/useDebtPaymentSplitSync";
import { useMerchantRuleActions } from "../../hooks/useMerchantRuleActions";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { TransferSuggestions } from "./TransferSuggestionList";
import { useTransferSuggestions } from "./useTransferSuggestions";
import { useAssetLinks } from "./useAssetLinks";
import { AssetLinkSuggestions } from "./AssetLinkSuggestions";
import { isCashWithdrawalCandidate } from "@sergeant/finyk-domain/domain/cashOnHand";
import { formatMoney } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import type { Transaction, TxSplit } from "@sergeant/finyk-domain/domain/types";
import {
  toSyncPillState,
  type TransactionsProps,
} from "./transactionsPageTypes";

// Контракт сторінки (зрізи `mono`/`storage`, пропси) живе в
// `transactionsPageTypes.ts`; реекспорт тримає старі імпорти робочими.
export type {
  TxAccount,
  TransactionsMonoSlice,
  TransactionsStorageSlice,
  TransactionsProps,
} from "./transactionsPageTypes";

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
  categoryMonth,
  categoryRange,
  onClearCategoryFilter,
  onEditManualExpense,
  dayFilter,
  onClearDayFilter,
  receiptLinks,
  focusTxId,
  onFocusTxConsumed,
}: TransactionsProps) {
  const toast = useToast();
  const [editingBankTransaction, setEditingBankTransaction] =
    useState<Transaction | null>(null);
  const {
    realTx,
    loadingTx,
    lastUpdated,
    syncState,
    accounts,
    jars,
    fetchMonth,
    historyTx,
    loadingHistory,
    refresh: monoRefresh,
  } = mono;
  const {
    storageReady = true,
    hiddenTxIds,
    hideTx,
    excludedTxIds,
    cancelledTxIds,
    excludedStatTxIds,
    toggleExcludeFromStats,
    cashOnHand,
    toggleCashCountAsExpense,
    txCategories,
    merchantRuleIndex,
    upsertMerchantRule,
    undoMerchantRule,
    deleteMerchantRule,
    restoreMerchantRules,
    customCategories,
    overrideCategory,
    txSplits,
    setSplitTx,
    txNotes,
    setTxNote,
    manualExpenses,
    addManualExpense,
    removeManualExpense,
    manualDebts,
    setManualDebts,
    setLinkedTxRole,
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
    merchantRules: merchantRuleIndex,
    customCategories,
    fetchMonth,
    categoryFilter,
    categoryMonth,
    categoryRange,
    onClearCategoryFilter,
    dayFilter,
    txNotes,
    txTags: storage.txTags,
  });

  // Рахунки для підписів аркуша «Фільтри» (`accountLabel` читає id, тип і
  // маску картки, як «За рахунками» в Аналітиці).
  const txAccountsForLabels = useMemo(
    () => (accounts ?? []) as readonly LabelledAccount[],
    [accounts],
  );

  // Чіп дня — той самий візуальний блок для «сьогодні» (Overview, рядок
  // «Операції за сьогодні») і для конкретної дати (тап по клітинці
  // `MonthStrip`); різниться лише лівий текст, кнопка «Усі дні» спільна.
  const isDayFilterValid =
    dayFilter === "today" || (dayFilter != null && isDayFilterKey(dayFilter));
  const dayFilterLabel =
    dayFilter === "today"
      ? messages.finyk.todayFilter.label
      : dayFilter && isDayFilterValid
        ? formatDayFilterDate(dayFilter)
        : "";

  // Пропозиції «схоже на переказ» — усі разом і без повторів
  // (`useTransferSuggestions`, фідбек власника 2026-11-19).
  const transfers = useTransferSuggestions({
    storageReady,
    activeTx: filters.activeTx,
    hiddenTxIds,
    txCategories,
    jars,
    overrideCategory,
  });

  // Ноги пар «схоже на переказ»: картки активів їх не дублюють.
  const transferTxIds = useMemo(
    () =>
      new Set(
        transfers.suggestions.flatMap((p) => [p.outgoing.id, p.incoming.id]),
      ),
    [transfers.suggestions],
  );
  // Внески в рахунки-активи (спеки finyk-savings-assets і
  // finyk-investment-suggestions).
  const assetLinks = useAssetLinks({
    storageReady,
    activeTx: filters.activeTx,
    hiddenTxIds,
    excludedTxIds,
    transferTxIds,
    manualAssets: storage.manualAssets,
    setManualAssets: storage.setManualAssets,
    overrideCategory,
  });

  // Жест оновлення: банк + хмарний пул, провал пулу дає тост (PR-X3).
  const {
    onRefresh: handlePullRefresh,
    onRefreshError: handlePullRefreshError,
  } = useTransactionsPullRefresh(monoRefresh);

  // CSV-експорт видимого місяця. `monthKey` збирається з `selMonth` (у
  // ньому `month` — індекс 0..11, як у `Date`), щоб імʼя файла називало
  // саме той місяць, який людина бачила на екрані.
  const handleExportCsv = useCallback(
    async function exportCsv(): Promise<void> {
      const monthKey = `${filters.selMonth.year}-${String(
        filters.selMonth.month + 1,
      ).padStart(2, "0")}`;
      try {
        const { count, result } = await exportTransactionsCsv(
          filters.filtered,
          filters.getEffectiveCat,
          monthKey,
        );
        // Закрили аркуш «Поділитись» без вибору — це не вивантаження, тост
        // «Вивантажено…» тут збрехав би.
        if (result !== "cancelled") {
          toast?.success(`Вивантажено операцій: ${count}`);
        }
      } catch {
        // Повтор безпечний: файл збирається заново з того, що на екрані. Кнопка
        // в тості теж жест користувача, тож `navigator.share` знову дозволений.
        toast?.error(failedCopy("вивантажити операції"), undefined, {
          label: "Повторити",
          onClick: () => void exportCsv(),
        });
      }
    },
    [filters.selMonth, filters.filtered, filters.getEffectiveCat, toast],
  );

  // PR-F4 founder-UX audit 2026-09-13: `excludedStatTxIds` — джерело
  // правди для «не враховувати у статистиці» — доти доходило лише до
  // `BankTransactionDetailsSheet` (проп `excludedFromStats` нижче), а не
  // до самого рядка списку чи пакетної дії. Людина бачила підсумки
  // Огляду/Аналітики, що змінились, і жодного сліду в списку, ЯКІ саме
  // рядки виключено. Set будується тут же й іде в кожен рядок через
  // `TransactionList` → `TxListItem` → `TxRow` → `TxRowMetaChips`.
  const excludedStatTxIdSet = useMemo(
    () => new Set(excludedStatTxIds ?? []),
    [excludedStatTxIds],
  );

  // «Завжди так для цього магазину»: створення/прибирання правила з тостом
  // скасування (рішення власника 2026-10-01).
  const merchantRuleActions = useMerchantRuleActions({
    upsertMerchantRule,
    undoMerchantRule,
    deleteMerchantRule,
    restoreMerchantRules,
    customCategories,
    toast,
  });

  const selection = useTransactionSelection({
    hiddenTxIds,
    excludedStatTxIds,
    txCategories,
    hideTx,
    toggleExcludeFromStats,
    overrideCategory,
    setSplitTx,
    setTxNote,
    removeManualExpense,
    addManualExpense,
    onEditManualExpense,
    toast,
  });

  useFocusTransaction({
    focusTxId,
    realTx,
    historyTx,
    manualExpenses,
    openBankTransaction: setEditingBankTransaction,
    openManualExpense: onEditManualExpense,
    onConsumed: onFocusTxConsumed,
  });

  // Рівень 3: розподіл операції може змінитись УЖЕ ПІСЛЯ привʼязки платежу,
  // і тоді сума привʼязки застаріває. Обгортка стоїть саме тут, бо це
  // єдина точка, крізь яку проходять усі три шляхи зміни розподілу
  // (редактор спліту, «прибрати розподіл», розбивка за чеком Сільпо) —
  // аркуш роздає той самий `onSplitChange` усім трьом.
  const splitSync = useDebtPaymentSplitSync(
    manualDebts,
    setLinkedTxRole,
    toast.success,
  );
  const handleSplitChange = useCallback(
    (id: string, splits: TxSplit[] | null) => {
      selection.stableSetSplitTx(id, splits);
      const amountKop = Math.abs(Number(editingBankTransaction?.amount) || 0);
      if (editingBankTransaction?.id === id && amountKop > 0) {
        splitSync.reconcile(id, splits, amountKop / 100);
      }
    },
    [selection, splitSync, editingBankTransaction],
  );

  return (
    <>
      <TransactionList
        loading={filters.activeLoading}
        activeTx={filters.activeTx}
        hasTransactionsOutsideMonth={filters.hasTransactionsOutsideMonth}
        monthLabel={filters.monthLabel}
        onGoPreviousMonth={() => filters.goMonth(-1)}
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
        excludedStatTxIdSet={excludedStatTxIdSet}
        cancelledTxIdSet={cancelledTxIds}
        txCategories={txCategories}
        merchantRules={merchantRuleIndex}
        txSplits={txSplits}
        txNotes={txNotes}
        accounts={accounts}
        customCategories={customCategories}
        hasReceipt={receiptLinks?.hasReceipt}
        onToggleSelect={selection.toggleSelect}
        onSwipeHideTx={selection.stableSwipeHideTx}
        onSwipeDeleteManual={selection.stableSwipeDeleteManual}
        onOpenTransaction={(transaction) => {
          if (transaction._manual) {
            selection.stableOnEditManual(transaction._manualId);
            return;
          }
          setEditingBankTransaction(transaction);
        }}
        onRefresh={handlePullRefresh}
        searchEmpty={
          filters.advancedActive ? (
            <TransactionsFiltersEmpty
              withSearch={filters.searchActive}
              onReset={() => {
                filters.clearAdvancedFilters();
                filters.setSearchQuery("");
              }}
            />
          ) : filters.searchActive ? (
            <TransactionsSearchEmpty
              query={filters.searchQuery}
              onClear={() => filters.setSearchQuery("")}
            />
          ) : undefined
        }
        onRefreshError={handlePullRefreshError}
        header={
          <section
            aria-label="Керування операціями"
            className="mb-4 space-y-2.5"
          >
            <TransactionsHeader
              {...filters.monthNav}
              selectMode={selection.selectMode}
              exitSelectMode={selection.exitSelectMode}
              setSelectMode={selection.setSelectMode}
              showHidden={filters.showHidden}
              setShowHidden={filters.setShowHidden}
              hiddenCount={hiddenTxIds.length}
              selectedCount={selection.selectedIds.size}
              onExportCsv={handleExportCsv}
              exportCount={filters.filtered.length}
            />
            {/* Ф-2 (а): пошук під місяцем; діє разом із вкладкою нижче. */}
            <TransactionsSearchField
              query={filters.searchQuery}
              onQueryChange={filters.setSearchQuery}
              resultCount={filters.filtered.length}
              narrowed={filters.advancedActive}
              trailing={
                <TransactionsFiltersButton
                  value={filters.advancedFilters}
                  baseList={filters.searchedTx}
                  monthTx={filters.activeTx}
                  tags={storage.txTags}
                  accounts={txAccountsForLabels}
                  onApply={filters.setAdvancedFilters}
                />
              }
              periodLabel={
                filters.rangeFilter
                  ? null
                  : filters.monthLabel.charAt(0).toLocaleLowerCase("uk") +
                    filters.monthLabel.slice(1)
              }
            />
            {/* Ф-2 (б): що діє з аркуша «Фільтри», скидання одним тапом. */}
            <TransactionsActiveFiltersChip
              value={filters.advancedFilters}
              accounts={txAccountsForLabels}
              tags={storage.txTags}
              onClear={filters.clearAdvancedFilters}
            />
            <TransactionSyncPill
              syncState={toSyncPillState(syncState)}
              lastUpdated={lastUpdated}
            />
            {isDayFilterValid && (
              <TransactionsFilterChip
                label={dayFilterLabel}
                clearLabel={messages.finyk.todayFilter.showAll}
                clearAria={messages.finyk.todayFilter.showAllAria}
                onClear={onClearDayFilter}
              />
            )}
            {filters.rangeFilter && (
              <TransactionsFilterChip
                label={formatAnalyticsPeriod(
                  { kind: "range", ...filters.rangeFilter },
                  getKyivDayKey(),
                )}
                clearLabel={messages.finyk.analyticsPage.rangeChipClear}
                clearAria={messages.finyk.analyticsPage.rangeChipAria}
                onClear={filters.clearRangeFilter}
              />
            )}
            <TransferSuggestions
              suggestions={transfers.suggestions}
              accounts={accounts}
              showBalance={showBalance}
              onConfirm={(suggestion) => {
                transfers.confirm(suggestion);
                toast.success(messages.finyk.transferSuggestion.confirmed);
              }}
              onReject={transfers.reject}
              onSnooze={transfers.snooze}
              onConfirmAll={() => {
                transfers.confirmAll();
                toast.success(messages.finyk.transferSuggestion.confirmedAll);
              }}
              onSnoozeAll={transfers.snoozeAll}
            />
            <AssetLinkSuggestions {...assetLinks} />
            <TransactionFilters
              filter={filters.filter}
              onChangeFilter={filters.setFilter}
              hasCreditAccounts={filters.creditAccIds.size > 0}
              activeCategoryLabel={filters.activeCategoryLabel}
            />
            {filters.activeCategoryLabel && (
              <CategoryTrend
                categoryId={filters.filter}
                label={filters.activeCategoryLabel}
                storage={{
                  excludedTxIds,
                  txSplits,
                  manualExpenses,
                  txCategories,
                  merchantRules: merchantRuleIndex,
                  customCategories,
                }}
                fetchRange={mono.fetchRange}
                showBalance={showBalance}
              />
            )}
          </section>
        }
        trailing={
          filters.activeLoading && filters.activeTx.length > 0 ? (
            <p className="text-center text-style-caption text-subtle py-2">
              ⟳ оновлення…
            </p>
          ) : null
        }
        footer={
          <TransactionsBatchToolbar
            selectMode={selection.selectMode}
            selectedSize={selection.selectedIds.size}
            onOpenCatPicker={() => selection.setBatchCatPicker(true)}
            onApplyHide={selection.applyBatchHide}
            allSelectedHidden={selection.allSelectedHidden}
            onApplyUnhide={selection.applyBatchUnhide}
            onApplyExclude={selection.applyBatchExclude}
            batchCatPicker={selection.batchCatPicker}
            onCloseCatPicker={() => selection.setBatchCatPicker(false)}
            onApplyCategory={selection.applyBatchCategory}
            customCategories={customCategories}
            tagBatch={{ tagsApi: storage, selection }}
          />
        }
      />

      {editingBankTransaction && (
        <BankTransactionDetailsSheet
          transaction={editingBankTransaction}
          accounts={accounts}
          hidden={hiddenTxIds.includes(editingBankTransaction.id)}
          excludedFromStats={(excludedStatTxIds ?? []).includes(
            editingBankTransaction.id,
          )}
          overrideCatId={txCategories[editingBankTransaction.id]}
          note={txNotes[editingBankTransaction.id]}
          txSplits={txSplits}
          customCategories={customCategories}
          merchantRules={merchantRuleIndex}
          onCreateMerchantRule={
            upsertMerchantRule
              ? (tx, categoryId) =>
                  merchantRuleActions.createRule(tx, categoryId)
              : undefined
          }
          onRemoveMerchantRule={
            deleteMerchantRule ? merchantRuleActions.removeRule : undefined
          }
          receiptId={
            receiptLinks?.getReceiptId(editingBankTransaction.id) ?? null
          }
          hideAmount={!showBalance}
          manualDebts={manualDebts}
          setManualDebts={setManualDebts}
          setLinkedTxRole={setLinkedTxRole}
          onCategoryChange={selection.stableOverrideCategory}
          onNoteChange={selection.stableSetTxNote}
          tagsApi={storage}
          onSplitChange={handleSplitChange}
          onToggleHidden={selection.stableHideTx}
          onToggleExcludedFromStats={toggleExcludeFromStats}
          cashWithdrawal={
            cashOnHand &&
            toggleCashCountAsExpense &&
            isCashWithdrawalCandidate(editingBankTransaction, cashOnHand)
              ? {
                  countedAsExpense: cashOnHand.countAsExpenseTxIds.includes(
                    editingBankTransaction.id,
                  ),
                  onToggle: () =>
                    toggleCashCountAsExpense(editingBankTransaction.id),
                }
              : undefined
          }
          assetLink={assetLinks.linkFor(editingBankTransaction)}
          onClose={() => setEditingBankTransaction(null)}
        />
      )}

      {/* Рівень 3: частки боргу в розподілі не лишилось. Питаємо, а не
          відвʼязуємо самі — людина може бути посеред редагування. */}
      {splitSync.pendingUnlink && (
        <ConfirmDialog
          open
          title={messages.finyk.debtSplitSync.unlinkTitle}
          description={messages.finyk.debtSplitSync.unlinkQuestion
            .replace("{debt}", splitSync.pendingUnlink.debtName)
            .replace(
              "{amount}",
              formatMoney(splitSync.pendingUnlink.previousAmountUAH, {
                maxFractionDigits: 2,
              }),
            )}
          confirmLabel={messages.finyk.debtSplitSync.unlinkConfirm}
          cancelLabel={messages.finyk.debtSplitSync.unlinkKeep}
          onConfirm={splitSync.confirmUnlink}
          onCancel={splitSync.dismissUnlink}
        />
      )}
    </>
  );
}
