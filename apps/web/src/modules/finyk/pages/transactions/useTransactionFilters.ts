import { useCallback, useEffect, useMemo, useState } from "react";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import type {
  Category,
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type { TxAccount } from "./Transactions";
import { perfMark, perfEnd } from "@shared/lib/perf";
import { mergeExpenseCategoryDefinitions } from "../../constants";
import { getCategory, getIncomeCategory } from "../../utils";
import {
  DAY_COLLAPSE_KEY,
  computeDaySummary,
  dayKeyFromTx,
  isDayExpanded,
  readDayCollapse,
  writeDayCollapse,
} from "./transactionsLib";

const now = new Date();

export interface UseTransactionFiltersParams {
  /** Real Monobank transactions for the current month. */
  realTx: Transaction[];
  /** Cached transactions for any historical month. */
  historyTx: Transaction[];
  loadingTx: boolean;
  loadingHistory: boolean;
  manualExpenses: ManualExpense[] | undefined;
  accounts: ReadonlyArray<TxAccount> | undefined;
  hiddenTxIds: string[];
  excludedTxIds: Set<string>;
  txSplits: TxSplitsMap;
  txCategories: TxCategoriesMap;
  customCategories: Category[] | undefined;
  fetchMonth: (year: number, month: number) => Promise<unknown>;
  /** External-driven category filter (e.g. tap on a category card). */
  categoryFilter: string | null | undefined;
  onClearCategoryFilter?: () => void;
}

/**
 * State + derived data for the Transactions page:
 *   - month picker (`selMonth`, `goMonth`, `monthLabel`)
 *   - filter pill state (`filter`, `setFilter`) with external override
 *   - hidden-rows toggle (`showHidden`)
 *   - merged active list (`activeTx` = real OR history + manual expenses)
 *   - filtered + sorted list (`filtered`)
 *   - day grouping + per-day summary (`groupedByDate`, `daySummaries`)
 *   - day collapse/expand state synced across tabs
 *   - flat list + group counts for the virtualized renderer
 *   - category-spend list for the filter chip strip
 *
 * Returning a plain object keeps the shell's call-site flat — callers
 * can destructure exactly the slices they need without re-deriving any
 * of these aggregates.
 */
export function useTransactionFilters({
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
}: UseTransactionFiltersParams) {
  const [filter, setFilter] = useState("all");
  const [showHidden, setShowHidden] = useState(false);
  const [selMonth, setSelMonth] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));

  useEffect(() => {
    if (categoryFilter) {
      setFilter(categoryFilter);
      onClearCategoryFilter?.();
    }
  }, [categoryFilter, onClearCategoryFilter]);

  const isCurrentMonth =
    selMonth.year === now.getFullYear() && selMonth.month === now.getMonth();

  const manualExpenseTxs = useMemo(() => {
    const monthStart = new Date(selMonth.year, selMonth.month, 1).getTime();
    const monthEnd = new Date(selMonth.year, selMonth.month + 1, 1).getTime();
    return (manualExpenses || [])
      .filter((e) => {
        const ts = new Date(e.date).getTime();
        return ts >= monthStart && ts < monthEnd;
      })
      .map((e) => manualExpenseToTransaction(e));
  }, [manualExpenses, selMonth]);

  const activeTx = useMemo(
    () => [...(isCurrentMonth ? realTx : historyTx), ...manualExpenseTxs],
    [isCurrentMonth, realTx, historyTx, manualExpenseTxs],
  );
  const activeLoading = isCurrentMonth ? loadingTx : loadingHistory;

  // useCallback — `goMonth` підв'язаний до двох кнопок навігації місяцями;
  // стабільний handler уникає створення нових замикань на кожен рендер.
  const goMonth = useCallback(
    (delta: number) => {
      setSelMonth((prev) => {
        let m = prev.month + delta;
        let y = prev.year;
        if (m < 0) {
          m = 11;
          y--;
        }
        if (m > 11) {
          m = 0;
          y++;
        }
        if (!(y === now.getFullYear() && m === now.getMonth()))
          // Fire-and-forget: `fetchMonth` may reject (e.g. when monobank
          // is disconnected). The page degrades gracefully to its empty
          // state, so we just swallow the rejection here to keep the
          // unhandled-rejection logs clean.
          fetchMonth(y, m).catch(() => {});
        return { year: y, month: m };
      });
    },
    [fetchMonth],
  );

  const monthLabel = new Date(
    selMonth.year,
    selMonth.month,
    1,
  ).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });

  const creditAccIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of accounts || []) {
      if ((a.creditLimit ?? 0) > 0 && typeof a.id === "string") {
        ids.add(a.id);
      }
    }
    return ids;
  }, [accounts]);

  const hiddenTxIdSet = useMemo(
    () => new Set(hiddenTxIds || []),
    [hiddenTxIds],
  );

  const getEffectiveCat = useCallback(
    (t: Transaction) =>
      t.amount > 0
        ? getIncomeCategory(t.description, txCategories[t.id])
        : getCategory(
            t.description,
            t.mcc,
            txCategories[t.id],
            customCategories,
          ),
    [txCategories, customCategories],
  );

  const statTx = useMemo(
    () => activeTx.filter((t) => !excludedTxIds.has(t.id)),
    [activeTx, excludedTxIds],
  );
  const catSpends = useMemo(
    () =>
      mergeExpenseCategoryDefinitions(customCategories)
        .filter((c) => c.id !== "income")
        .map((cat) => ({
          ...cat,
          spent: Math.round(
            statTx
              .filter((t) => t.amount < 0)
              .reduce((s, t) => {
                const splits = txSplits?.[t.id];
                if (splits && splits.length > 0)
                  return (
                    s +
                    splits
                      .filter((sp) => sp.categoryId === cat.id)
                      .reduce((ss, sp) => ss + (sp.amount || 0), 0)
                  );
                return getEffectiveCat(t).id === cat.id
                  ? s + Math.abs(t.amount / 100)
                  : s;
              }, 0),
          ),
        }))
        .filter((c) => c.spent > 0)
        .sort((a, b) => b.spent - a.spent),
    [statTx, txSplits, getEffectiveCat, customCategories],
  );

  const txsToShow = useMemo(
    () =>
      showHidden ? activeTx : activeTx.filter((t) => !hiddenTxIdSet.has(t.id)),
    [activeTx, hiddenTxIdSet, showHidden],
  );

  const sortedTxs = useMemo(() => {
    const m = perfMark("finyk:tx:sort");
    const next = [...txsToShow].sort((a, b) => (b.time || 0) - (a.time || 0));
    perfEnd(m, { n: next.length });
    return next;
  }, [txsToShow]);

  const filtered = useMemo(() => {
    const m = perfMark("finyk:tx:filter");
    const res = sortedTxs.filter((t) => {
      if (filter === "all") return true;
      if (filter === "income") return t.amount > 0;
      if (filter === "expense") return t.amount < 0;
      if (filter === "credit")
        return (
          typeof t._accountId === "string" && creditAccIds.has(t._accountId)
        );
      return getEffectiveCat(t).id === filter;
    });
    perfEnd(m, { n: res.length });
    return res;
  }, [sortedTxs, filter, creditAccIds, getEffectiveCat]);

  const groupedByDate = useMemo(() => {
    const m = perfMark("finyk:tx:groupByDate");
    const groups: { key: string; items: Transaction[] }[] = [];
    for (const t of filtered) {
      const k = dayKeyFromTx(t.time);
      const last = groups[groups.length - 1];
      if (last && last.key === k) last.items.push(t);
      else groups.push({ key: k, items: [t] });
    }
    perfEnd(m, { groups: groups.length });
    return groups;
  }, [filtered]);

  // Per-day totals (signed amount in cents, item count). Внутрішні
  // перекази та явно виключені з статистики транзакції НЕ йдуть у
  // `total` — інакше header-суми розходяться з «Підсумком місяця» і
  // перекази тихо рахуються як дохід (див. issue про «++15 403,58₴»).
  const daySummaries = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeDaySummary>> = {};
    for (const g of groupedByDate) {
      map[g.key] = computeDaySummary(g.items, { excludedTxIds, txSplits });
    }
    return map;
  }, [groupedByDate, excludedTxIds, txSplits]);

  // Day collapse/expand state. Persisted as a sparse override map:
  // absence → default rule (only "today" is expanded). Explicit boolean
  // overrides the default and survives across sessions.
  const todayDayKey = useMemo(
    () => dayKeyFromTx(Math.floor(Date.now() / 1000)),
    [],
  );
  const [dayOverrides, setDayOverrides] = useState(() => readDayCollapse());

  // Sync with other tabs: another Finyk tab toggling the same day should
  // immediately reflect here, matching how the rest of the module treats
  // localStorage as the single source of truth.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== DAY_COLLAPSE_KEY) return;
      setDayOverrides(readDayCollapse());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleDay = useCallback(
    (key: string) => {
      setDayOverrides((prev) => {
        const expanded = isDayExpanded(prev, key, todayDayKey);
        const next = { ...prev, [key]: !expanded };
        writeDayCollapse(next);
        return next;
      });
    },
    [todayDayKey],
  );

  // Фільтр-чіпи (Витрати/Доходи/Кредитна/Борг) більше не форсять
  // розгортання — користувач явно хотів, щоб згортання працювало
  // навіть під активним фільтром (inbox-style). `groupedByDate` уже
  // обчислено з відфільтрованого `filtered`, тож у згорнутій групі
  // лічильник під датою показує кількість саме *відфільтрованих*
  // транзакцій — нічого не зникає, все одно тап розгортає.
  const collapsedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const g of groupedByDate) {
      if (!isDayExpanded(dayOverrides, g.key, todayDayKey)) s.add(g.key);
    }
    return s;
  }, [groupedByDate, dayOverrides, todayDayKey]);

  const groupCounts = useMemo(
    () =>
      groupedByDate.map((g) => (collapsedKeys.has(g.key) ? 0 : g.items.length)),
    [groupedByDate, collapsedKeys],
  );

  // GroupedVirtuoso передає глобальний (плоский) індекс — будуємо плоский масив
  const flatItems = useMemo(
    () =>
      groupedByDate.flatMap((g) => (collapsedKeys.has(g.key) ? [] : g.items)),
    [groupedByDate, collapsedKeys],
  );

  return {
    // month + filter state
    filter,
    setFilter,
    showHidden,
    setShowHidden,
    selMonth,
    isCurrentMonth,
    goMonth,
    monthLabel,
    // derived
    activeTx,
    activeLoading,
    creditAccIds,
    hiddenTxIdSet,
    catSpends,
    filtered,
    groupedByDate,
    daySummaries,
    collapsedKeys,
    groupCounts,
    flatItems,
    toggleDay,
  };
}
