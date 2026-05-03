/**
 * Sergeant Finyk — TransactionsPage (React Native).
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/Transactions.tsx`.
 *
 * Surface:
 *  - Month navigator + add button + clear-all-filters chip.
 *  - Search input (live).
 *  - Quick-filter chips (All / Витрати / Доходи / Кредитна / per-cat).
 *  - Account picker chip → opens a bottom-sheet account multiselect.
 *  - FlashList of day-grouped transactions with running day totals.
 *  - Pull-to-refresh re-reads MMKV (CloudSync may have written new data).
 *  - Swipe LEFT → Edit (manual rows open prefilled `ManualExpenseSheet`,
 *    bank rows fall through to "Hide" since they aren't editable).
 *  - Swipe RIGHT → Categorize (opens `CategoryPickerSheet`).
 *  - Empty state with primary CTA opening `ManualExpenseSheet`.
 *
 * Persistence:
 *  - `useFinykTransactionsStore` owns manual expenses + category
 *    overrides + splits + hidden ids; every setter persists to MMKV
 *    and pushes onto the cloud-sync queue.
 *  - `useFinykTxFilters` persists the active filter / account whitelist
 *    so navigating away and back lands the user in the same view.
 *
 * Layout:
 *  - Pure orchestration here; the page is decomposed into per-concern
 *    files under `./components` (header / chips / feed item / sheets)
 *    and `./hooks` (day-collapse / category filters / feed building).
 *
 * Out of scope (covered by Phase 4 follow-up tasks):
 *  - Live Monobank refresh — `realTx` arrives via `seed` until the Mono
 *    client port lands (Task #12).
 *  - Bulk-select / batch-categorize toolbar.
 *  - Date-range bottom-sheet picker beyond the month nav (covered by
 *    `setRange` on the filter hook — UI can be added later).
 */
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";

import type { Transaction } from "@sergeant/finyk-domain/domain";

import { CategoryPickerSheet } from "@/modules/finyk/components/CategoryPickerSheet";
import {
  ManualExpenseSheet,
  type ManualExpensePayload,
} from "@/modules/finyk/components/ManualExpenseSheet";
import { useToast } from "@/components/ui/Toast";
import { showUndoToast } from "@/lib/showUndoToast";
import {
  useFinykTransactionsStore,
  useFinykTxFilters,
  type FinykTransactionsSeed,
  type FinykTxFilterState,
  type ManualExpenseRecord,
} from "@/modules/finyk/lib/transactionsStore";

import { AccountFilterSheet } from "./components/AccountFilterSheet";
import { BankActionsSheet } from "./components/BankActionsSheet";
import { CategoryFilterSheet } from "./components/CategoryFilterSheet";
import { DateRangeFilterSheet } from "./components/DateRangeFilterSheet";
import { TransactionsEmptyState } from "./components/TransactionsEmptyState";
import { TransactionsFeedItem } from "./components/TransactionsFeedItem";
import { TransactionsFilterChips } from "./components/TransactionsFilterChips";
import { TransactionsHeader } from "./components/TransactionsHeader";
import { TransactionsSearchBar } from "./components/TransactionsSearchBar";
import { useCategoryFilters } from "./hooks/useCategoryFilters";
import { useDayCollapse } from "./hooks/useDayCollapse";
import { useTransactionsFeed } from "./hooks/useTransactionsFeed";
import type { DraftRange, FeedItem } from "./types";
import { formatMonthLabel } from "./utils";

export interface TransactionsPageProps {
  /** Test/storybook seed — pre-populates MMKV slices and injects realTx. */
  seed?: FinykTransactionsSeed;
  /** Seed for the persisted filter hook — bypasses MMKV in tests. */
  filtersSeed?: Partial<FinykTxFilterState>;
  /** `Date.now()` seam for deterministic jest snapshots. */
  now?: Date;
  /** testID propagated to the screen root + add button. */
  testID?: string;
}

export function TransactionsPage({
  seed,
  filtersSeed,
  now: nowOverride,
  testID = "finyk-transactions",
}: TransactionsPageProps) {
  const store = useFinykTransactionsStore(seed);
  const {
    manualExpenses,
    txCategories,
    txSplits,
    hiddenTxIds,
    realTx,
    accounts,
    customCategories,
    addManualExpense,
    updateManualExpense,
    removeManualExpense,
    hideTx,
    overrideCategory,
    refresh,
  } = store;
  const toast = useToast();

  // Single-tap delete + undo-toast (parity з web). Знімаємо запис до
  // виклику `removeManualExpense`, бо після нього його вже немає.
  const handleDeleteManualExpense = useCallback(
    (id: string) => {
      const snapshot = manualExpenses.find((e) => e.id === id);
      if (!snapshot) return;
      removeManualExpense(id);
      showUndoToast(toast, {
        msg: `Транзакцію видалено`,
        onUndo: () => {
          // ManualExpenseRecord використовує `string` для category, але
          // payload очікує літеральний union — за допомогою snapshot це
          // безпечно, бо значення вже валідне (записано раніше).
          addManualExpense(snapshot as unknown as ManualExpensePayload);
        },
      });
    },
    [addManualExpense, manualExpenses, removeManualExpense, toast],
  );

  const { filters, setFilter, setAccountIds, setRange, clearAll } =
    useFinykTxFilters(filtersSeed);

  const now = useMemo(() => nowOverride ?? new Date(), [nowOverride]);
  const [selMonth, setSelMonth] = useState<{ year: number; month: number }>(
    () => ({ year: now.getFullYear(), month: now.getMonth() }),
  );
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [sheetState, setSheetState] = useState<
    { open: false } | { open: true; editing: ManualExpenseRecord | null }
  >({ open: false });
  const [catPicker, setCatPicker] = useState<{ tx: Transaction } | null>(null);
  const [filterCatSheet, setFilterCatSheet] = useState(false);
  const [accountPicker, setAccountPicker] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [bankEditTx, setBankEditTx] = useState<Transaction | null>(null);
  const [draftRange, setDraftRange] = useState<DraftRange>({
    start: "",
    end: "",
  });

  const isCurrentMonth =
    selMonth.year === now.getFullYear() && selMonth.month === now.getMonth();
  const monthLabel = formatMonthLabel(selMonth.year, selMonth.month);

  const goMonth = useCallback((delta: number) => {
    setSelMonth((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) {
        m = 11;
        y -= 1;
      } else if (m > 11) {
        m = 0;
        y += 1;
      }
      return { year: y, month: m };
    });
  }, []);

  const creditAccIds = useMemo(
    () =>
      new Set(
        accounts
          .filter((a) => (a.creditLimit ?? 0) > 0)
          .map((a) => a.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    [accounts],
  );

  const {
    filterChips,
    allExpenseCategories,
    allIncomeCategories,
    activeCategoryLabel,
    getEffectiveCat,
  } = useCategoryFilters({
    filterId: filters.filter,
    customCategories,
    txCategories,
    creditCount: creditAccIds.size,
  });

  const searchLower = search.trim().toLowerCase();

  const { dayOverrides, todayDayKey, toggleDay } = useDayCollapse(now);

  const hiddenTxIdSet = useMemo(() => new Set(hiddenTxIds), [hiddenTxIds]);

  const { feed, filtersActive } = useTransactionsFeed({
    manualExpenses,
    realTx,
    hiddenTxIds,
    selMonth,
    filters,
    searchLower,
    creditAccIds,
    getEffectiveCat,
    dayOverrides,
    todayDayKey,
    now,
  });

  // ── Handlers ────────────────────────────────────────────────────────
  const openAddSheet = useCallback(() => {
    setSheetState({ open: true, editing: null });
  }, []);

  const openEditSheet = useCallback(
    (tx: Transaction) => {
      const id = tx._manualId != null ? String(tx._manualId) : null;
      if (!id) return;
      const found = manualExpenses.find((e) => e.id === id);
      if (!found) return;
      setSheetState({ open: true, editing: found });
    },
    [manualExpenses],
  );

  const closeSheet = useCallback(() => setSheetState({ open: false }), []);

  const handleSave = useCallback(
    (payload: ManualExpensePayload) => {
      if (payload.id) {
        updateManualExpense(payload.id, payload);
      } else {
        addManualExpense(payload);
      }
    },
    [addManualExpense, updateManualExpense],
  );

  const handleSwipeLeft = useCallback(
    (tx: Transaction) => {
      // Manual rows open the prefilled `ManualExpenseSheet`. Bank rows
      // aren't editable in-place, so we surface an "Edit" actions sheet
      // (Categorize / Hide) — same affordance the user can reach from a
      // tap-and-hold on web.
      if (tx._manual) {
        openEditSheet(tx);
      } else {
        setBankEditTx(tx);
      }
    },
    [openEditSheet],
  );

  const handleSwipeRight = useCallback((tx: Transaction) => {
    setCatPicker({ tx });
  }, []);

  const handlePressBank = useCallback((tx: Transaction) => {
    setBankEditTx(tx);
  }, []);

  const handleCategorySelect = useCallback(
    (categoryId: string | null) => {
      const tx = catPicker?.tx;
      if (!tx) return;
      overrideCategory(tx.id, categoryId);
      setCatPicker(null);
    },
    [catPicker, overrideCategory],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refresh();
    // Yield a tick so the spinner shows briefly even when MMKV reads
    // resolve synchronously — feels less jumpy on fast devices.
    await new Promise<void>((r) => setTimeout(r, 200));
    setRefreshing(false);
  }, [refresh]);

  // ── Renderers ───────────────────────────────────────────────────────
  const renderItem = useCallback<ListRenderItem<FeedItem>>(
    ({ item }) => (
      <TransactionsFeedItem
        item={item}
        accounts={accounts}
        customCategories={customCategories}
        txSplits={txSplits}
        txCategories={txCategories}
        hiddenTxIdSet={hiddenTxIdSet}
        onToggleDay={toggleDay}
        onSwipeLeft={handleSwipeLeft}
        onSwipeRight={handleSwipeRight}
        onPressManual={openEditSheet}
        onPressBank={handlePressBank}
      />
    ),
    [
      accounts,
      customCategories,
      handlePressBank,
      handleSwipeLeft,
      handleSwipeRight,
      hiddenTxIdSet,
      openEditSheet,
      toggleDay,
      txCategories,
      txSplits,
    ],
  );

  const keyExtractor = useCallback((it: FeedItem) => it.key, []);
  const getItemType = useCallback(
    (it: FeedItem) => (it.kind === "header" ? "h" : "t"),
    [],
  );

  const hasActiveFilter = filtersActive;

  // Direction passed to the picker — `+` shows income categories.
  const pickerDirection: "income" | "expense" =
    catPicker?.tx && catPicker.tx.amount > 0 ? "income" : "expense";

  const rangeLabel = useMemo(() => {
    const fmt = (ms: number) =>
      new Date(ms).toLocaleDateString("uk-UA", {
        day: "2-digit",
        month: "short",
      });
    if (filters.range.startMs && filters.range.endMs) {
      return `${fmt(filters.range.startMs)}–${fmt(filters.range.endMs)}`;
    }
    if (filters.range.startMs) return `від ${fmt(filters.range.startMs)}`;
    if (filters.range.endMs) return `до ${fmt(filters.range.endMs)}`;
    return null;
  }, [filters.range.startMs, filters.range.endMs]);

  const openDateRangeSheet = useCallback(() => {
    const toISO = (ms: number | null) =>
      ms == null ? "" : new Date(ms).toISOString().slice(0, 10);
    setDraftRange({
      start: toISO(filters.range.startMs),
      end: toISO(filters.range.endMs),
    });
    setDatePicker(true);
  }, [filters.range.startMs, filters.range.endMs]);

  const applyDateRange = useCallback(() => {
    const parse = (s: string): number | null => {
      if (!s) return null;
      const ms = new Date(`${s}T00:00:00`).getTime();
      return Number.isNaN(ms) ? null : ms;
    };
    const startMs = parse(draftRange.start);
    const rawEnd = parse(draftRange.end);
    // End-of-day on the chosen `end` date so the comparison is inclusive.
    const endMs = rawEnd != null ? rawEnd + 86_399_000 : null;
    setRange({ startMs, endMs });
    setDatePicker(false);
  }, [draftRange.start, draftRange.end, setRange]);

  const clearDateRange = useCallback(() => {
    setRange({ startMs: null, endMs: null });
    setDatePicker(false);
  }, [setRange]);

  const handleSelectCategoryFilter = useCallback(
    (id: string) => {
      setFilter(id);
      setFilterCatSheet(false);
    },
    [setFilter],
  );

  const handleClearAllFilters = useCallback(() => {
    clearAll();
    setSearch("");
  }, [clearAll]);

  const handleBankCategorize = useCallback((tx: Transaction) => {
    setCatPicker({ tx });
    setBankEditTx(null);
  }, []);

  const handleBankHide = useCallback(
    (tx: Transaction) => {
      hideTx(tx.id);
      setBankEditTx(null);
    },
    [hideTx],
  );

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-cream-50">
      <View className="px-4 pt-3 pb-2 gap-3" testID={testID}>
        <TransactionsHeader
          testID={testID}
          monthLabel={monthLabel}
          isCurrentMonth={isCurrentMonth}
          hasActiveFilter={hasActiveFilter}
          onPrevMonth={() => goMonth(-1)}
          onNextMonth={() => goMonth(1)}
          onClearFilters={handleClearAllFilters}
          onAdd={openAddSheet}
        />

        <TransactionsSearchBar
          testID={testID}
          value={search}
          onChange={setSearch}
        />

        <TransactionsFilterChips
          testID={testID}
          chips={filterChips}
          activeFilterId={filters.filter}
          activeCategoryLabel={activeCategoryLabel}
          rangeLabel={rangeLabel}
          hasRangeFilter={
            filters.range.startMs != null || filters.range.endMs != null
          }
          hasAccountFilter={filters.accountIds.length > 0}
          selectedAccountCount={filters.accountIds.length}
          showAccountChip={accounts.length > 0}
          onSelectFilter={setFilter}
          onOpenCategorySheet={() => setFilterCatSheet(true)}
          onOpenDateRangeSheet={openDateRangeSheet}
          onOpenAccountSheet={() => setAccountPicker(true)}
        />
      </View>

      {/* Transaction feed */}
      {feed.length === 0 ? (
        <TransactionsEmptyState
          testID={testID}
          hasActiveFilter={hasActiveFilter}
          onAdd={openAddSheet}
        />
      ) : (
        <FlashList
          data={feed}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          estimatedItemSize={68}
          contentContainerStyle={{ paddingBottom: 64 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#78716c"
            />
          }
          testID={`${testID}-list`}
        />
      )}

      <ManualExpenseSheet
        open={sheetState.open}
        onClose={closeSheet}
        onSave={handleSave}
        onDelete={handleDeleteManualExpense}
        initialExpense={
          sheetState.open && sheetState.editing ? sheetState.editing : null
        }
        testID={`${testID}-sheet`}
      />

      <CategoryPickerSheet
        open={!!catPicker}
        onClose={() => setCatPicker(null)}
        onSelect={handleCategorySelect}
        direction={pickerDirection}
        customCategories={customCategories}
        selectedId={catPicker ? (txCategories[catPicker.tx.id] ?? null) : null}
        testID={`${testID}-cat-picker`}
      />

      <AccountFilterSheet
        testID={testID}
        open={accountPicker}
        onClose={() => setAccountPicker(false)}
        accounts={accounts}
        selectedIds={filters.accountIds}
        onChange={setAccountIds}
      />

      <DateRangeFilterSheet
        testID={testID}
        open={datePicker}
        draft={draftRange}
        onChange={setDraftRange}
        onApply={applyDateRange}
        onClear={clearDateRange}
        onClose={() => setDatePicker(false)}
      />

      <BankActionsSheet
        testID={testID}
        tx={bankEditTx}
        onCategorize={handleBankCategorize}
        onHide={handleBankHide}
        onClose={() => setBankEditTx(null)}
      />

      <CategoryFilterSheet
        testID={testID}
        open={filterCatSheet}
        onClose={() => setFilterCatSheet(false)}
        expenseCategories={allExpenseCategories}
        incomeCategories={allIncomeCategories}
        activeFilterId={filters.filter}
        activeCategoryLabel={activeCategoryLabel}
        onSelect={handleSelectCategoryFilter}
      />
    </SafeAreaView>
  );
}
