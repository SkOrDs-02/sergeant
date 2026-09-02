import { useCallback, useMemo, useState } from "react";
import { useToast } from "@shared/hooks/useToast";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { TransactionsHeader } from "./TransactionsHeader";
import { exportTransactionsCsv } from "./exportTransactionsCsv";
import { TransactionsBatchToolbar } from "./TransactionsBatchToolbar";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionList } from "./TransactionList";
import { TransactionSyncPill } from "./TransactionSyncPill";
import { useTransactionFilters } from "./useTransactionFilters";
import { DAY_FILTER_KEY_RE, formatDayFilterDate } from "./transactionsLib";
import { useTransactionSelection } from "./useTransactionSelection";
import { BankTransactionDetailsSheet } from "../../components/BankTransactionDetailsSheet";
import type { UseFinykReceiptLinksResult } from "../../hooks/useFinykReceiptLinks";
import { Button } from "@shared/components/ui/Button";
import { TransferSuggestionCard } from "./TransferSuggestionCard";
import {
  filterTransferSuggestions,
  findInternalTransferSuggestions,
  transferSuggestionPairKey,
} from "@sergeant/finyk-domain/domain/transferMatching";
import {
  FINYK_TRANSFER_SUGGESTION_REJECTED_KEY,
  FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY,
} from "@sergeant/finyk-domain/storage-keys";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
import { messages } from "@shared/i18n/uk";
import type {
  Transaction,
  TxCategoriesMap,
  TxSplit,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type {
  Debt,
  LinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
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
  id?: string | undefined;
  creditLimit?: number | undefined;
  type?: string | undefined;
  _source?: string | undefined;
  [k: string]: unknown;
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
  setSplitTx: (id: string, splits: TxSplit[] | null) => void;
  /** Пасиви + мутатори для мостика «Борг → пасив» (спека finyk-observations,
   * PR-3), прокинуті в {@link BankTransactionDetailsSheet}. */
  manualDebts: Debt[];
  setManualDebts: (updater: (debts: Debt[]) => Debt[]) => void;
  setLinkedTxRole: (
    id: string,
    txId: string,
    type: "debt" | "receivable",
    role: LinkedTxRole | null,
    amountUAH?: number,
  ) => void;
  /** User's own free-text annotation per bank transaction — bank facts
   * (amount/date/merchant) stay immutable, this is the user's note. */
  txNotes: Record<string, string | undefined>;
  setTxNote: (id: string, note: string | null) => void;
  manualExpenses: ManualExpense[] | undefined;
  addManualExpense: (expense: Omit<ManualExpense, "id">) => void;
  removeManualExpense: (id: string) => void;
}

export interface TransactionsProps {
  mono: TransactionsMonoSlice;
  storage: TransactionsStorageSlice;
  showBalance?: boolean;
  categoryFilter?: string | null;
  onClearCategoryFilter?: () => void;
  onEditManualExpense?: (id: string) => void;
  dayFilter?: string | null;
  onClearDayFilter?: () => void;
  /** Device-local чек↔транзакція лінки (спека § Розгортка) — optional so
   * existing test call-sites without receipt-scan context keep compiling. */
  receiptLinks?: UseFinykReceiptLinksResult;
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
  dayFilter,
  onClearDayFilter,
  receiptLinks,
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
    customCategories,
    fetchMonth,
    categoryFilter,
    onClearCategoryFilter,
    dayFilter,
  });

  // Чіп дня — той самий візуальний блок для «сьогодні» (Overview, рядок
  // «Операції за сьогодні») і для конкретної дати (тап по клітинці
  // `MonthStrip`); різниться лише лівий текст, кнопка «Усі дні» спільна.
  const isDayFilterValid =
    dayFilter === "today" ||
    (dayFilter != null && DAY_FILTER_KEY_RE.test(dayFilter));
  const dayFilterLabel =
    dayFilter === "today"
      ? messages.finyk.todayFilter.label
      : dayFilter && isDayFilterValid
        ? formatDayFilterDate(dayFilter)
        : "";

  // Both actions below persist device-locally (no cross-device sync — see
  // `FINYK_TRANSFER_SUGGESTION_REJECTED_KEY` / `_SNOOZED_KEY` docs), so a
  // rejected/snoozed pair survives reload instead of only lasting for the
  // current page mount.
  const [rejectedTransferPairs, setRejectedTransferPairs] = useState<
    Set<string>
  >(
    () =>
      new Set(
        safeReadLS<string[]>(FINYK_TRANSFER_SUGGESTION_REJECTED_KEY, []) ?? [],
      ),
  );
  const [snoozedTransferPairs, setSnoozedTransferPairs] = useState<
    Record<string, string>
  >(
    () =>
      safeReadLS<Record<string, string>>(
        FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY,
        {},
      ) ?? {},
  );

  const transferSuggestions = useMemo(() => {
    const hidden = new Set(hiddenTxIds);
    const raw = findInternalTransferSuggestions(
      filters.activeTx.filter((tx) => !hidden.has(tx.id)),
      { txCategories },
    );
    return filterTransferSuggestions(raw, {
      rejectedPairKeys: rejectedTransferPairs,
      snoozedPairKeys: snoozedTransferPairs,
      todayKey: getKyivDayKey(),
    });
  }, [
    filters.activeTx,
    hiddenTxIds,
    txCategories,
    rejectedTransferPairs,
    snoozedTransferPairs,
  ]);
  const visibleTransferSuggestion = transferSuggestions[0] ?? null;
  const visibleTransferKey = visibleTransferSuggestion
    ? transferSuggestionPairKey(visibleTransferSuggestion)
    : null;

  const rejectTransferSuggestion = useCallback((key: string) => {
    setRejectedTransferPairs((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      safeWriteLS(FINYK_TRANSFER_SUGGESTION_REJECTED_KEY, Array.from(next));
      return next;
    });
  }, []);

  const snoozeTransferSuggestion = useCallback((key: string) => {
    setSnoozedTransferPairs((current) => {
      const next = { ...current, [key]: getKyivDayKey() };
      safeWriteLS(FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY, next);
      return next;
    });
  }, []);

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

  // CSV-експорт видимого місяця. `monthKey` збирається з `selMonth` (у
  // ньому `month` — індекс 0..11, як у `Date`), щоб імʼя файла називало
  // саме той місяць, який людина бачила на екрані.
  const handleExportCsv = useCallback(() => {
    const monthKey = `${filters.selMonth.year}-${String(
      filters.selMonth.month + 1,
    ).padStart(2, "0")}`;
    const count = exportTransactionsCsv(
      filters.filtered,
      filters.getEffectiveCat,
      monthKey,
    );
    toast?.success(`Вивантажено операцій: ${count}`);
  }, [filters.selMonth, filters.filtered, filters.getEffectiveCat, toast]);

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
        txCategories={txCategories}
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
        header={
          <section
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
              selectedCount={selection.selectedIds.size}
              onExportCsv={handleExportCsv}
              exportCount={filters.filtered.length}
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
            {isDayFilterValid && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-finyk/25 bg-finyk-soft px-3 py-2">
                <span className="text-style-caption text-finyk-strong dark:text-finyk">
                  {dayFilterLabel}
                </span>
                {onClearDayFilter && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    tone="finyk"
                    onClick={onClearDayFilter}
                    aria-label={messages.finyk.todayFilter.showAllAria}
                  >
                    {messages.finyk.todayFilter.showAll}
                  </Button>
                )}
              </div>
            )}
            {visibleTransferSuggestion && visibleTransferKey && (
              <TransferSuggestionCard
                suggestion={visibleTransferSuggestion}
                accounts={accounts}
                showBalance={showBalance}
                onConfirm={() => {
                  overrideCategory(
                    visibleTransferSuggestion.outgoing.id,
                    INTERNAL_TRANSFER_ID,
                  );
                  overrideCategory(
                    visibleTransferSuggestion.incoming.id,
                    INTERNAL_TRANSFER_ID,
                  );
                  toast.success(messages.finyk.transferSuggestion.confirmed);
                }}
                onReject={() => rejectTransferSuggestion(visibleTransferKey)}
                onSnooze={() => snoozeTransferSuggestion(visibleTransferKey)}
              />
            )}
            <TransactionFilters
              filter={filters.filter}
              onChangeFilter={filters.setFilter}
              hasCreditAccounts={filters.creditAccIds.size > 0}
              activeCategoryLabel={filters.activeCategoryLabel}
            />
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
            onApplyExclude={selection.applyBatchExclude}
            batchCatPicker={selection.batchCatPicker}
            onCloseCatPicker={() => selection.setBatchCatPicker(false)}
            onApplyCategory={selection.applyBatchCategory}
            customCategories={customCategories}
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
          receiptId={
            receiptLinks?.getReceiptId(editingBankTransaction.id) ?? null
          }
          hideAmount={!showBalance}
          manualDebts={manualDebts}
          setManualDebts={setManualDebts}
          setLinkedTxRole={setLinkedTxRole}
          onCategoryChange={selection.stableOverrideCategory}
          onNoteChange={selection.stableSetTxNote}
          onSplitChange={selection.stableSetSplitTx}
          onToggleHidden={selection.stableHideTx}
          onToggleExcludedFromStats={toggleExcludeFromStats}
          onClose={() => setEditingBankTransaction(null)}
        />
      )}
    </>
  );
}
