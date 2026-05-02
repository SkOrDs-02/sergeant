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
 * Out of scope (covered by Phase 4 follow-up tasks):
 *  - Live Monobank refresh — `realTx` arrives via `seed` until the Mono
 *    client port lands (Task #12).
 *  - Bulk-select / batch-categorize toolbar.
 *  - Date-range bottom-sheet picker beyond the month nav (covered by
 *    `setRange` on the filter hook — UI can be added later).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";

import {
  fmtAmt,
  CURRENCY,
  getCategory,
  getIncomeCategory,
  mergeExpenseCategoryDefinitions,
  INCOME_CATEGORIES,
} from "@sergeant/finyk-domain";
import {
  manualExpenseToTransaction,
  type Transaction,
} from "@sergeant/finyk-domain/domain";

import { TxRow } from "@/modules/finyk/components/TxRow";
import { SwipeToAction } from "@/components/ui/SwipeToAction";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { showUndoToast } from "@/lib/showUndoToast";
import {
  ManualExpenseSheet,
  type ManualExpensePayload,
} from "@/modules/finyk/components/ManualExpenseSheet";
import { CategoryPickerSheet } from "@/modules/finyk/components/CategoryPickerSheet";
import {
  useFinykTransactionsStore,
  useFinykTxFilters,
  type FinykTransactionsSeed,
  type FinykTxFilterState,
  type ManualExpenseRecord,
} from "@/modules/finyk/lib/transactionsStore";
import { STORAGE_KEYS } from "@sergeant/shared";
import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";

// ── Types ──────────────────────────────────────────────────────────────

interface FilterChip {
  id: string;
  label: string;
}

const BASE_FILTERS: FilterChip[] = [
  { id: "all", label: "Всі" },
  { id: "expense", label: "Витрати" },
  { id: "income", label: "Доходи" },
];

type FeedItem =
  | {
      kind: "header";
      key: string;
      dayKey: string;
      label: string;
      total: number;
      count: number;
      collapsed: boolean;
    }
  | { kind: "tx"; key: string; tx: Transaction };

/** Sparse per-day override map. Missing entries fall back to the
 *  default rule ("today is expanded, rest collapsed"); explicit
 *  booleans survive across cold starts. */
type DayCollapseMap = Record<string, boolean>;

const DAY_COLLAPSE_KEY = STORAGE_KEYS.FINYK_TX_DAY_COLLAPSE;

function readDayCollapse(): DayCollapseMap {
  const v = safeReadLS<DayCollapseMap | null>(DAY_COLLAPSE_KEY, null);
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  return {};
}

function isDayExpanded(
  overrides: DayCollapseMap,
  key: string,
  todayKey: string,
): boolean {
  const o = overrides[key];
  return o === undefined ? key === todayKey : !!o;
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });
}

function getMonthBounds(
  year: number,
  month: number,
): { start: number; end: number } {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  return { start, end };
}

function dayKeyFromTime(timeSec: number): string {
  const d = new Date(timeSec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(key: string, now: Date): string {
  const [y, m, da] = key.split("-").map(Number);
  const d = new Date(y!, (m ?? 1) - 1, da);
  const t0 = new Date(now);
  t0.setHours(0, 0, 0, 0);
  const d0 = new Date(d);
  d0.setHours(0, 0, 0, 0);
  const diffDays = Math.round((t0.getTime() - d0.getTime()) / 86400000);
  if (diffDays === 0) return "Сьогодні";
  if (diffDays === 1) return "Вчора";
  return d.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ── Component ──────────────────────────────────────────────────────────

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

  // Single-tap delete + undo-toast (parity з web). Снимаємо запис
  // до виклику `removeManualExpense`, бо після нього його вже немає.
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
  const [draftRange, setDraftRange] = useState<{ start: string; end: string }>({
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

  // ── Data shaping ────────────────────────────────────────────────────
  const manualTxsThisMonth = useMemo<Transaction[]>(() => {
    const { start, end } = getMonthBounds(selMonth.year, selMonth.month);
    return manualExpenses
      .filter((e) => {
        const ts = e.date ? new Date(e.date).getTime() : 0;
        return ts >= start && ts < end;
      })
      .map((e) => manualExpenseToTransaction(e));
  }, [manualExpenses, selMonth.year, selMonth.month]);

  // Bank tx coming out of MMKV cache may span several months — filter
  // to the selected month so prev-month navigation surfaces cached
  // history (web parity), instead of being limited to "current month".
  const realTxThisMonth = useMemo<Transaction[]>(() => {
    const { start, end } = getMonthBounds(selMonth.year, selMonth.month);
    return realTx.filter((t) => {
      const ms = (t.time || 0) * 1000;
      return ms >= start && ms < end;
    });
  }, [realTx, selMonth.year, selMonth.month]);

  const activeTx = useMemo<Transaction[]>(
    () => [...realTxThisMonth, ...manualTxsThisMonth],
    [realTxThisMonth, manualTxsThisMonth],
  );

  const hiddenTxIdSet = useMemo(() => new Set(hiddenTxIds), [hiddenTxIds]);
  const creditAccIds = useMemo(
    () =>
      new Set(
        accounts.filter((a) => (a.creditLimit ?? 0) > 0).map((a) => a.id),
      ),
    [accounts],
  );

  const accountFilterSet = useMemo(
    () => (filters.accountIds.length > 0 ? new Set(filters.accountIds) : null),
    [filters.accountIds],
  );

  const categoryChips = useMemo<FilterChip[]>(
    () => customCategories.map((c) => ({ id: c.id, label: c.label })),
    [customCategories],
  );

  const filterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [...BASE_FILTERS];
    if (creditAccIds.size > 0) {
      chips.push({ id: "credit", label: "💳 Кредитна" });
    }
    chips.push(...categoryChips);
    return chips;
  }, [creditAccIds.size, categoryChips]);

  const searchLower = search.trim().toLowerCase();

  // Per-day collapse/expand state. Persisted as a sparse override map;
  // missing entries fall back to the default "only today is expanded"
  // rule. Live-syncs with other MMKV writers (e.g. another screen that
  // flips the same flag) via the MMKV value listener.
  const todayDayKey = useMemo(() => dayKeyFromDate(now), [now]);
  const [dayOverrides, setDayOverrides] = useState<DayCollapseMap>(() =>
    readDayCollapse(),
  );
  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey === DAY_COLLAPSE_KEY) {
        setDayOverrides(readDayCollapse());
      }
    });
    return () => sub.remove();
  }, []);

  const toggleDay = useCallback(
    (dayKey: string) => {
      setDayOverrides((prev) => {
        const expanded = isDayExpanded(prev, dayKey, todayDayKey);
        const next: DayCollapseMap = { ...prev, [dayKey]: !expanded };
        safeWriteLS(DAY_COLLAPSE_KEY, next);
        return next;
      });
    },
    [todayDayKey],
  );

  // When any filter / search is active, collapsed days would hide
  // matches — force every day expanded so nothing looks "missing". The
  // persisted override is untouched; clearing filters restores it.
  const filtersActive =
    filters.filter !== "all" ||
    filters.accountIds.length > 0 ||
    filters.range.startMs != null ||
    filters.range.endMs != null ||
    !!searchLower;

  // Full list of expense categories (built-ins + user customs) used by
  // the category-filter picker. Mirrors the same merger the web feed
  // uses, so the chip set on mobile and the filter the user picks below
  // refer to the exact same `id` space.
  const allExpenseCategories = useMemo<{ id: string; label: string }[]>(() => {
    const merged = mergeExpenseCategoryDefinitions(
      customCategories.map((c) => ({ id: c.id, label: c.label })),
    ) as { id: string; label: string }[];
    return merged.filter((c) => c.id !== "income");
  }, [customCategories]);

  const allIncomeCategories = useMemo<{ id: string; label: string }[]>(
    () => INCOME_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    [],
  );

  const activeCategoryLabel = useMemo<string | null>(() => {
    const id = filters.filter;
    if (
      id === "all" ||
      id === "expense" ||
      id === "income" ||
      id === "credit"
    ) {
      return null;
    }
    const hit =
      allExpenseCategories.find((c) => c.id === id) ??
      allIncomeCategories.find((c) => c.id === id);
    return hit ? hit.label : null;
  }, [filters.filter, allExpenseCategories, allIncomeCategories]);

  const getEffectiveCat = useCallback(
    (t: Transaction): { id: string; label: string } => {
      if (t.amount > 0) {
        return getIncomeCategory(t.description, txCategories[t.id]) as {
          id: string;
          label: string;
        };
      }
      return getCategory(
        t.description,
        t.mcc,
        txCategories[t.id],
        customCategories,
      ) as { id: string; label: string };
    },
    [txCategories, customCategories],
  );

  const filtered = useMemo<Transaction[]>(() => {
    const base = [...activeTx]
      .filter((t) => !hiddenTxIdSet.has(t.id))
      .sort((a, b) => (b.time || 0) - (a.time || 0));
    const startMs = filters.range.startMs;
    const endMs = filters.range.endMs;
    return base.filter((t) => {
      if (accountFilterSet && !accountFilterSet.has(t._accountId ?? "")) {
        return false;
      }
      if (startMs != null || endMs != null) {
        const ms = (t.time || 0) * 1000;
        if (startMs != null && ms < startMs) return false;
        if (endMs != null && ms > endMs) return false;
      }
      const matchSearch =
        !searchLower ||
        (t.description || "").toLowerCase().includes(searchLower);
      const matchFilter =
        filters.filter === "all"
          ? true
          : filters.filter === "income"
            ? t.amount > 0
            : filters.filter === "expense"
              ? t.amount < 0
              : filters.filter === "credit"
                ? creditAccIds.has(t._accountId ?? "")
                : getEffectiveCat(t).id === filters.filter;
      return matchSearch && matchFilter;
    });
  }, [
    activeTx,
    hiddenTxIdSet,
    searchLower,
    filters.filter,
    filters.range.startMs,
    filters.range.endMs,
    accountFilterSet,
    creditAccIds,
    getEffectiveCat,
  ]);

  // Build the day-grouped flat array consumed by FlashList: each day
  // contributes a `header` row (label + signed total), optionally
  // followed by its tx rows. When a day is collapsed the header is
  // still emitted — only the tx rows are suppressed so the user can tap
  // the header to expand.
  const feed = useMemo<FeedItem[]>(() => {
    // First pass: compute per-day totals across the full filtered set so
    // the collapsed-header summary stays accurate regardless of whether
    // the rows are actually emitted below.
    const totals = new Map<string, { total: number; count: number }>();
    for (const t of filtered) {
      const k = dayKeyFromTime(t.time || 0);
      const acc = totals.get(k);
      if (acc) {
        acc.total += Number(t.amount || 0);
        acc.count += 1;
      } else {
        totals.set(k, { total: Number(t.amount || 0), count: 1 });
      }
    }

    const out: FeedItem[] = [];
    let currentKey = "";
    let currentCollapsed = false;
    for (let i = 0; i < filtered.length; i++) {
      const t = filtered[i]!;
      const k = dayKeyFromTime(t.time || 0);
      if (k !== currentKey) {
        const expanded =
          filtersActive || isDayExpanded(dayOverrides, k, todayDayKey);
        currentCollapsed = !expanded;
        const summary = totals.get(k) ?? { total: 0, count: 0 };
        out.push({
          kind: "header",
          key: `h-${k}`,
          dayKey: k,
          label: formatDayLabel(k, now),
          total: summary.total,
          count: summary.count,
          collapsed: currentCollapsed,
        });
        currentKey = k;
      }
      if (!currentCollapsed) {
        out.push({ kind: "tx", key: `t-${t.id}`, tx: t });
      }
    }
    return out;
  }, [filtered, now, dayOverrides, todayDayKey, filtersActive]);

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
    ({ item }) => {
      if (item.kind === "header") {
        const sign = item.total >= 0 ? "+" : "";
        const totalText =
          item.count === 0 ? "" : `${sign}${fmtAmt(item.total, CURRENCY.UAH)}`;
        return (
          <Pressable
            onPress={() => toggleDay(item.dayKey)}
            accessibilityRole="button"
            accessibilityState={{ expanded: !item.collapsed }}
            accessibilityLabel={`${item.collapsed ? "Розгорнути" : "Згорнути"} ${item.label}`}
            className="flex-row items-center justify-between bg-cream-100/80 px-4 py-2 border-b border-cream-300 active:opacity-70"
            testID={`finyk-tx-day-${item.key}`}
          >
            <View className="flex-row items-center flex-1 min-w-0">
              <Text
                className="text-fg-muted mr-2 text-xs"
                style={{ width: 10 }}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {item.collapsed ? "▸" : "▾"}
              </Text>
              {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
              <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted flex-shrink">
                {item.label}
              </Text>
              {item.count > 0 ? (
                <Text className="text-[10px] font-normal text-fg-subtle ml-2">
                  · {item.count}
                </Text>
              ) : null}
            </View>
            {totalText ? (
              <Text
                className={
                  item.total >= 0
                    ? "text-xs font-semibold text-brand-600"
                    : "text-xs font-semibold text-fg"
                }
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {totalText}
              </Text>
            ) : null}
          </Pressable>
        );
      }
      const tx = item.tx;
      const isManual = !!tx._manual;
      const overrideId = txCategories[tx.id] ?? null;
      return (
        <SwipeToAction
          onSwipeLeft={() => handleSwipeLeft(tx)}
          onSwipeRight={() => handleSwipeRight(tx)}
          leftLabel={isManual ? "✎ Редагувати" : "⋯ Дії"}
          leftColor="bg-brand-500"
          rightLabel="🏷 Категорія"
          rightColor="bg-warning"
        >
          <TxRow
            tx={tx}
            accounts={accounts}
            txSplits={txSplits}
            customCategories={customCategories}
            overrideCatId={overrideId}
            hidden={hiddenTxIdSet.has(tx.id)}
            onPress={
              isManual ? () => openEditSheet(tx) : () => setBankEditTx(tx)
            }
            testID={`finyk-tx-row-${tx.id}`}
          />
        </SwipeToAction>
      );
    },
    [
      accounts,
      customCategories,
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

  const hasActiveFilter =
    filters.filter !== "all" ||
    filters.accountIds.length > 0 ||
    filters.range.startMs != null ||
    filters.range.endMs != null ||
    !!searchLower;

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

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-cream-50">
      <View className="px-4 pt-3 pb-2 gap-3" testID={testID}>
        {/* Header — month nav + add button */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Pressable
              onPress={() => goMonth(-1)}
              accessibilityRole="button"
              accessibilityLabel="Попередній місяць"
              testID={`${testID}-prev-month`}
              className="w-9 h-9 items-center justify-center rounded-xl active:opacity-60"
            >
              <Text className="text-xl text-fg-muted">‹</Text>
            </Pressable>
            <Text className="text-sm font-semibold text-fg capitalize px-2">
              {monthLabel}
            </Text>
            <Pressable
              onPress={() => goMonth(1)}
              disabled={isCurrentMonth}
              accessibilityRole="button"
              accessibilityLabel="Наступний місяць"
              accessibilityState={{ disabled: isCurrentMonth }}
              testID={`${testID}-next-month`}
              className="w-9 h-9 items-center justify-center rounded-xl active:opacity-60"
            >
              <Text
                className={
                  isCurrentMonth
                    ? "text-xl text-fg-subtle"
                    : "text-xl text-fg-muted"
                }
              >
                ›
              </Text>
            </Pressable>
          </View>

          <View className="flex-row items-center gap-1.5">
            {hasActiveFilter && (
              <Pressable
                onPress={() => {
                  clearAll();
                  setSearch("");
                }}
                accessibilityRole="button"
                accessibilityLabel="Скинути всі фільтри"
                testID={`${testID}-clear-filters`}
                className="bg-cream-100 border border-cream-300 rounded-full h-9 px-3 items-center justify-center active:opacity-70"
              >
                <Text className="text-fg-muted text-xs font-medium">
                  ✕ Скинути
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={openAddSheet}
              accessibilityRole="button"
              accessibilityLabel="Додати витрату"
              testID={`${testID}-add`}
              className="bg-brand-500 rounded-full h-9 px-4 items-center justify-center active:opacity-80"
            >
              <Text className="text-white text-sm font-semibold">+ Додати</Text>
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <View className="bg-cream-100 border border-cream-300 rounded-2xl px-3 flex-row items-center">
          <Text className="text-fg-subtle mr-2">🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Пошук по транзакціях…"
            placeholderTextColor="#a8a29e"
            className="flex-1 py-2.5 text-sm text-fg"
            accessibilityLabel="Пошук транзакцій"
            testID={`${testID}-search`}
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              accessibilityRole="button"
              accessibilityLabel="Очистити пошук"
              hitSlop={8}
            >
              <Text className="text-fg-subtle px-1">✕</Text>
            </Pressable>
          )}
        </View>

        {/* Filter chips (horizontal, rendered via plain View + flex-wrap
            for simplicity — chip count is small and we don't need the
            virtualisation overhead here). */}
        <View className="flex-row flex-wrap gap-2" testID={`${testID}-filters`}>
          {filterChips.map((chip) => {
            const selected = filters.filter === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => setFilter(chip.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`${testID}-filter-${chip.id}`}
                className={
                  selected
                    ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 justify-center"
                    : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 justify-center"
                }
              >
                <Text
                  className={
                    selected
                      ? "text-white text-xs font-semibold"
                      : "text-fg text-xs font-medium"
                  }
                  numberOfLines={1}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setFilterCatSheet(true)}
            accessibilityRole="button"
            accessibilityLabel="Фільтр по категорії"
            testID={`${testID}-filter-category`}
            className={
              activeCategoryLabel
                ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 justify-center"
                : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 justify-center"
            }
          >
            <Text
              className={
                activeCategoryLabel
                  ? "text-white text-xs font-semibold"
                  : "text-fg text-xs font-medium"
              }
              numberOfLines={1}
            >
              🏷 {activeCategoryLabel ?? "Категорія"}
            </Text>
          </Pressable>
          <Pressable
            onPress={openDateRangeSheet}
            accessibilityRole="button"
            accessibilityLabel="Фільтр по даті"
            testID={`${testID}-filter-range`}
            className={
              filters.range.startMs != null || filters.range.endMs != null
                ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 justify-center"
                : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 justify-center"
            }
          >
            <Text
              className={
                filters.range.startMs != null || filters.range.endMs != null
                  ? "text-white text-xs font-semibold"
                  : "text-fg text-xs font-medium"
              }
            >
              📅 {rangeLabel ?? "Період"}
            </Text>
          </Pressable>
          {accounts.length > 0 && (
            <Pressable
              onPress={() => setAccountPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Фільтр по рахунках"
              testID={`${testID}-filter-accounts`}
              className={
                filters.accountIds.length > 0
                  ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 justify-center"
                  : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 justify-center"
              }
            >
              <Text
                className={
                  filters.accountIds.length > 0
                    ? "text-white text-xs font-semibold"
                    : "text-fg text-xs font-medium"
                }
              >
                🏦 Рахунки
                {filters.accountIds.length > 0
                  ? ` · ${filters.accountIds.length}`
                  : ""}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Transaction feed */}
      {feed.length === 0 ? (
        <View
          className="flex-1 items-center justify-center px-8"
          testID={`${testID}-empty`}
        >
          <Text className="text-5xl mb-3">🧾</Text>
          <Text className="text-base font-semibold text-fg mb-1 text-center">
            {hasActiveFilter
              ? "Нічого не знайдено"
              : "Немає транзакцій за цей місяць"}
          </Text>
          <Text className="text-sm text-fg-muted text-center mb-4">
            {hasActiveFilter
              ? "Спробуйте інший фільтр або очистіть пошук."
              : "Додайте першу витрату — і вона з'явиться тут."}
          </Text>
          <Pressable
            onPress={openAddSheet}
            accessibilityRole="button"
            accessibilityLabel="Додати першу витрату"
            testID={`${testID}-empty-add`}
            className="bg-brand-500 rounded-full h-11 px-5 items-center justify-center active:opacity-80"
          >
            <Text className="text-white text-sm font-semibold">
              + Додати витрату
            </Text>
          </Pressable>
        </View>
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

      <Sheet
        open={accountPicker}
        onClose={() => setAccountPicker(false)}
        title="Фільтр по рахунках"
        description="Оберіть рахунки, транзакції з яких показувати."
      >
        <View testID={`${testID}-accounts-sheet`}>
          {accounts.length === 0 ? (
            <Text className="text-sm text-fg-muted px-3 py-2">
              Немає підключених рахунків.
            </Text>
          ) : (
            accounts.map((a) => {
              const aid = a.id ?? "";
              const checked = filters.accountIds.includes(aid);
              return (
                <Pressable
                  key={aid}
                  onPress={() => {
                    const next = checked
                      ? filters.accountIds.filter((x) => x !== aid)
                      : [...filters.accountIds, aid];
                    setAccountIds(next);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  testID={`${testID}-account-opt-${aid}`}
                  className="flex-row items-center px-3 py-3 rounded-xl active:opacity-70"
                >
                  <Text className="text-sm text-fg flex-1">
                    {a.type ?? aid ?? "Рахунок"}
                  </Text>
                  <Text
                    className={checked ? "text-brand-500" : "text-fg-subtle"}
                  >
                    {checked ? "☑" : "☐"}
                  </Text>
                </Pressable>
              );
            })
          )}
          {filters.accountIds.length > 0 && (
            <Pressable
              onPress={() => setAccountIds([])}
              accessibilityRole="button"
              testID={`${testID}-account-clear`}
              className="mt-2 px-3 py-3 rounded-xl bg-cream-100 active:opacity-70"
            >
              <Text className="text-sm text-fg-muted text-center">
                Скинути вибір рахунків
              </Text>
            </Pressable>
          )}
        </View>
      </Sheet>

      <Sheet
        open={datePicker}
        onClose={() => setDatePicker(false)}
        title="Період"
        description="YYYY-MM-DD. Залиште поле порожнім, щоб не обмежувати."
        footer={
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => {
                setRange({ startMs: null, endMs: null });
                setDatePicker(false);
              }}
              accessibilityRole="button"
              testID={`${testID}-range-clear`}
              className="flex-1 h-11 rounded-xl bg-cream-100 items-center justify-center active:opacity-70"
            >
              <Text className="text-sm text-fg font-medium">Скинути</Text>
            </Pressable>
            <Pressable
              onPress={applyDateRange}
              accessibilityRole="button"
              testID={`${testID}-range-apply`}
              className="flex-1 h-11 rounded-xl bg-brand-500 items-center justify-center active:opacity-80"
            >
              <Text className="text-sm text-white font-semibold">
                Застосувати
              </Text>
            </Pressable>
          </View>
        }
      >
        <View className="px-4 pb-4 gap-3" testID={`${testID}-range-sheet`}>
          <View>
            <Text className="text-xs text-fg-muted mb-1">Від</Text>
            <TextInput
              value={draftRange.start}
              onChangeText={(v) => setDraftRange((r) => ({ ...r, start: v }))}
              placeholder="2026-04-01"
              placeholderTextColor="#a8a29e"
              autoCapitalize="none"
              autoCorrect={false}
              className="bg-cream-100 border border-cream-300 rounded-xl px-3 py-2.5 text-sm text-fg"
              testID={`${testID}-range-start`}
            />
          </View>
          <View>
            <Text className="text-xs text-fg-muted mb-1">До</Text>
            <TextInput
              value={draftRange.end}
              onChangeText={(v) => setDraftRange((r) => ({ ...r, end: v }))}
              placeholder="2026-04-30"
              placeholderTextColor="#a8a29e"
              autoCapitalize="none"
              autoCorrect={false}
              className="bg-cream-100 border border-cream-300 rounded-xl px-3 py-2.5 text-sm text-fg"
              testID={`${testID}-range-end`}
            />
          </View>
        </View>
      </Sheet>

      <Sheet
        open={!!bankEditTx}
        onClose={() => setBankEditTx(null)}
        title="Дії над транзакцією"
        description={
          bankEditTx?.description
            ? `«${bankEditTx.description}» — банківська транзакція не редагується напряму.`
            : undefined
        }
      >
        <View className="px-2 pb-2" testID={`${testID}-bank-edit-sheet`}>
          <Pressable
            onPress={() => {
              if (bankEditTx) setCatPicker({ tx: bankEditTx });
              setBankEditTx(null);
            }}
            accessibilityRole="button"
            testID={`${testID}-bank-edit-categorize`}
            className="px-3 py-3 rounded-xl active:opacity-70"
          >
            <Text className="text-sm text-fg">🏷 Змінити категорію</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (bankEditTx) hideTx(bankEditTx.id);
              setBankEditTx(null);
            }}
            accessibilityRole="button"
            testID={`${testID}-bank-edit-hide`}
            className="px-3 py-3 rounded-xl active:opacity-70"
          >
            <Text className="text-sm text-fg">🙈 Приховати</Text>
          </Pressable>
        </View>
      </Sheet>

      <Sheet
        open={filterCatSheet}
        onClose={() => setFilterCatSheet(false)}
        title="Фільтр по категорії"
        description="Оберіть категорію (включно з MCC-категоріями за замовчуванням), щоб показати лише транзакції з нею."
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 16, gap: 4 }}
          testID={`${testID}-filter-cat-sheet`}
        >
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
          <Text className="text-[11px] uppercase tracking-wide text-fg-subtle px-3 pt-2 pb-1">
            Витрати
          </Text>
          {allExpenseCategories.map((c) => {
            const checked = filters.filter === c.id;
            return (
              <Pressable
                key={`exp-${c.id}`}
                onPress={() => {
                  setFilter(c.id);
                  setFilterCatSheet(false);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                testID={`${testID}-filter-cat-opt-${c.id}`}
                className="flex-row items-center px-3 py-3 rounded-xl active:opacity-70"
              >
                <Text className="text-sm text-fg flex-1">{c.label}</Text>
                <Text className={checked ? "text-brand-500" : "text-fg-subtle"}>
                  {checked ? "☑" : "☐"}
                </Text>
              </Pressable>
            );
          })}
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
          <Text className="text-[11px] uppercase tracking-wide text-fg-subtle px-3 pt-3 pb-1">
            Доходи
          </Text>
          {allIncomeCategories.map((c) => {
            const checked = filters.filter === c.id;
            return (
              <Pressable
                key={`inc-${c.id}`}
                onPress={() => {
                  setFilter(c.id);
                  setFilterCatSheet(false);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                testID={`${testID}-filter-cat-opt-${c.id}`}
                className="flex-row items-center px-3 py-3 rounded-xl active:opacity-70"
              >
                <Text className="text-sm text-fg flex-1">{c.label}</Text>
                <Text className={checked ? "text-brand-500" : "text-fg-subtle"}>
                  {checked ? "☑" : "☐"}
                </Text>
              </Pressable>
            );
          })}
          {activeCategoryLabel && (
            <Pressable
              onPress={() => {
                setFilter("all");
                setFilterCatSheet(false);
              }}
              accessibilityRole="button"
              testID={`${testID}-filter-cat-clear`}
              className="mt-2 px-3 py-3 rounded-xl bg-cream-100 active:opacity-70"
            >
              <Text className="text-sm text-fg-muted text-center">
                Скинути категорію
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}
