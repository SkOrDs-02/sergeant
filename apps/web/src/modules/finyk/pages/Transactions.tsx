import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { GroupedVirtuoso } from "react-virtuoso";
import { TxListItem } from "../components/TxListItem";
import { getCategory, getIncomeCategory, fmtAmt } from "../utils";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { mergeExpenseCategoryDefinitions, CURRENCY } from "../constants";
import { Card } from "@shared/components/ui/Card";
import { SkeletonTransactionRow } from "@shared/components/ui/Skeleton";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/cn";
import { perfMark, perfEnd } from "@shared/lib/perf";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";
import {
  DAY_COLLAPSE_KEY,
  dayKeyFromTx,
  readDayCollapse,
  writeDayCollapse,
  isDayExpanded,
  formatStickyDayLabel,
  computeDaySummary,
} from "./transactionsLib";
import { TransactionsHeader } from "./TransactionsHeader";
import { TransactionsBatchToolbar } from "./TransactionsBatchToolbar";

const now = new Date();

// Ukrainian 1 / 2-4 / 5+ noun plural for "операція" (operation/transaction).
// Inline because the only consumers are the batch-undo toasts below — if a
// third caller appears, promote to `@shared/lib/pluralize`.
function pluralizeOps(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "операції";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return "операцій";
  return "операцій";
}

export function Transactions({
  mono,
  storage,
  showBalance = true,
  categoryFilter,
  onClearCategoryFilter,
  onEditManualExpense,
}) {
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
  const [filter, setFilter] = useState("all");
  const [scrollParent, setScrollParent] = useState(null);

  // Stable refs for handlers used by memoized row — avoids re-rendering all
  // visible rows whenever any unrelated parent state changes.
  const handlersRef = useRef({
    hideTx,
    overrideCategory,
    setSplitTx,
    removeManualExpense,
    addManualExpense,
    onEditManualExpense,
    toast,
  });
  handlersRef.current = {
    hideTx,
    overrideCategory,
    setSplitTx,
    removeManualExpense,
    addManualExpense,
    onEditManualExpense,
    toast,
  };

  useEffect(() => {
    if (categoryFilter) {
      setFilter(categoryFilter);
      onClearCategoryFilter?.();
    }
  }, [categoryFilter, onClearCategoryFilter]);
  const [showHidden, setShowHidden] = useState(false);
  // Batch selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchCatPicker, setBatchCatPicker] = useState(false);

  // useCallback — `toggleSelect` передається у кожен рядок вибору.
  // Сталий reference спільно з React.memo(TxRow)/обгорткою чекбокса дає
  // змогу дочірнім елементам не перерендерюватись при оновленні батька.
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const stableHideTx = useCallback((id) => handlersRef.current.hideTx(id), []);
  const stableOverrideCategory = useCallback(
    (id, catId) => handlersRef.current.overrideCategory(id, catId),
    [],
  );
  const stableSetSplitTx = useCallback(
    (id, splits) => handlersRef.current.setSplitTx(id, splits),
    [],
  );
  const stableOnEditManual = useCallback((manualId) => {
    const fn = handlersRef.current.onEditManualExpense;
    if (typeof fn === "function") fn(manualId);
  }, []);
  const stableSwipeHideTx = useCallback(
    (id) => handlersRef.current.hideTx(id),
    [],
  );
  const stableSwipeDeleteManual = useCallback((tx) => {
    const { removeManualExpense, addManualExpense, toast } =
      handlersRef.current;
    if (!removeManualExpense || !addManualExpense) return;
    const snapshot = {
      id: String(tx._manualId),
      date: tx.time
        ? new Date(tx.time * 1000).toISOString()
        : new Date().toISOString(),
      description: String(tx.description || ""),
      amount: Math.abs(Number(tx.amount || 0) / 100),
      category: String(tx._category || "інше"),
    };
    removeManualExpense(tx._manualId);
    showUndoToast(toast, {
      msg: "Витрату видалено",
      onUndo: () => addManualExpense(snapshot),
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBatchCatPicker(false);
  }, []);

  // useCallback — використовується у batch-панелі; стабільний handler
  // дозволяє безпечно мемоїзувати toolbar у майбутньому.
  const applyBatchCategory = useCallback(
    (catId) => {
      // Snapshot the previous override (or `null` for "default category")
      // for every selected id so the undo can restore each row to whatever
      // category it had before the batch — including rows that previously
      // had no override.
      const prev: Array<[string, string | null]> = [];
      for (const id of selectedIds) {
        prev.push([id, txCategories?.[id] ?? null]);
      }
      for (const [id] of prev) overrideCategory(id, catId);
      exitSelectMode();
      if (prev.length > 0) {
        showUndoToast(toast, {
          msg: `Категорію змінено для ${prev.length} ${pluralizeOps(prev.length)}`,
          onUndo: () => {
            for (const [id, prevCat] of prev) overrideCategory(id, prevCat);
          },
        });
      }
    },
    [selectedIds, overrideCategory, exitSelectMode, txCategories, toast],
  );

  const applyBatchHide = useCallback(() => {
    // Capture which ids were *newly* hidden so the undo doesn't accidentally
    // un-hide rows the user had already hidden manually before entering
    // select-mode. `hideTx` is a toggle, so calling it again on the same id
    // restores visibility.
    const hiddenNow: string[] = [];
    for (const id of selectedIds) {
      if (!hiddenTxIds.includes(id)) {
        hideTx(id);
        hiddenNow.push(id);
      }
    }
    exitSelectMode();
    if (hiddenNow.length > 0) {
      showUndoToast(toast, {
        msg: `Приховано ${hiddenNow.length} ${pluralizeOps(hiddenNow.length)}`,
        onUndo: () => {
          for (const id of hiddenNow) hideTx(id);
        },
      });
    }
  }, [selectedIds, hiddenTxIds, hideTx, exitSelectMode, toast]);

  const applyBatchExclude = useCallback(() => {
    // Same toggle/snapshot pattern as applyBatchHide — capture the ids that
    // were newly excluded and call `toggleExcludeFromStats` again on undo.
    const excludedNow: string[] = [];
    for (const id of selectedIds) {
      if (!(excludedStatTxIds || []).includes(id)) {
        toggleExcludeFromStats(id);
        excludedNow.push(id);
      }
    }
    exitSelectMode();
    if (excludedNow.length > 0) {
      showUndoToast(toast, {
        msg: `Виключено зі статистики: ${excludedNow.length} ${pluralizeOps(excludedNow.length)}`,
        onUndo: () => {
          for (const id of excludedNow) toggleExcludeFromStats(id);
        },
      });
    }
  }, [
    selectedIds,
    excludedStatTxIds,
    toggleExcludeFromStats,
    exitSelectMode,
    toast,
  ]);
  const [selMonth, setSelMonth] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));

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
    (delta) => {
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
          fetchMonth(y, m);
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

  const creditAccIds = useMemo(
    () =>
      new Set(
        (accounts || []).filter((a) => a.creditLimit > 0).map((a) => a.id),
      ),
    [accounts],
  );

  const hiddenTxIdSet = useMemo(
    () => new Set(hiddenTxIds || []),
    [hiddenTxIds],
  );

  const getEffectiveCat = useCallback(
    (t) =>
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
      if (filter === "credit") return creditAccIds.has(t._accountId);
      return getEffectiveCat(t).id === filter;
    });
    perfEnd(m, { n: res.length });
    return res;
  }, [sortedTxs, filter, creditAccIds, getEffectiveCat]);

  const groupedByDate = useMemo(() => {
    const m = perfMark("finyk:tx:groupByDate");
    const groups = [];
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
    function onStorage(e) {
      if (e.key !== DAY_COLLAPSE_KEY) return;
      setDayOverrides(readDayCollapse());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleDay = useCallback(
    (key) => {
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
    const s = new Set();
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

  // Sync-meta pill: tone follows status, dot mirrors `text-*` colour so the
  // pill remains a single-glance status chip even without reading the label.
  const syncPillTone =
    syncState?.status === "error"
      ? "text-danger border-danger/30 bg-danger/10"
      : syncState?.status === "partial"
        ? "text-warning border-warning/30 bg-warning/10"
        : syncState?.status === "loading"
          ? "text-subtle border-line/60 bg-panelHi/60"
          : "text-subtle border-line/60 bg-panelHi/60";
  const syncPillDot =
    syncState?.status === "error"
      ? "bg-danger"
      : syncState?.status === "partial"
        ? "bg-warning"
        : syncState?.status === "loading"
          ? "bg-muted motion-safe:animate-pulse"
          : "bg-success";
  const syncStatusLabel =
    syncState?.status === "loading"
      ? "оновлення…"
      : syncState?.status === "success"
        ? "синхронізовано"
        : syncState?.status === "partial"
          ? "частково"
          : syncState?.status === "error"
            ? "помилка"
            : "";
  const syncSourceLabel =
    syncState?.source === "network"
      ? "мережа"
      : syncState?.source === "cache"
        ? "кеш"
        : "нема";
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const showSyncRow = syncState?.status !== "idle" || lastUpdated;

  return (
    <div ref={setScrollParent} className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
        <Card
          as="section"
          radius="lg"
          padding="sm"
          aria-label="Керування операціями"
          className="mb-4 space-y-2.5"
        >
          <TransactionsHeader
            monthLabel={monthLabel}
            isCurrentMonth={isCurrentMonth}
            goMonth={goMonth}
            selectMode={selectMode}
            exitSelectMode={exitSelectMode}
            setSelectMode={setSelectMode}
            showHidden={showHidden}
            setShowHidden={setShowHidden}
            hiddenCount={hiddenTxIds.length}
            refresh={refresh}
            loading={activeLoading}
          />

          {/* Compact sync + last-updated meta row.
              Floating "✓ синхронізовано · мережа · 6/6 акаунтів" + bare
              "Оновлено: 10:55" used to read as two stray grey lines under
              the action cluster. Collapsed into one pill chip + inline
              timestamp so the panel reads as a single controls tray. */}
          {showSyncRow && (
            <div className="flex items-center gap-2 flex-wrap text-2xs">
              {syncState?.status !== "idle" && syncStatusLabel && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border tabular-nums",
                    syncPillTone,
                  )}
                  aria-label={`Стан синхронізації: ${syncStatusLabel}, джерело: ${syncSourceLabel}, акаунтів: ${syncState.accountsOk}/${syncState.accountsTotal}`}
                >
                  <span
                    className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                      syncPillDot,
                    )}
                    aria-hidden
                  />
                  <span>{syncStatusLabel}</span>
                  <span className="text-line" aria-hidden>
                    ·
                  </span>
                  <span>{syncSourceLabel}</span>
                  <span className="text-line" aria-hidden>
                    ·
                  </span>
                  <span>
                    {syncState.accountsOk}/{syncState.accountsTotal}
                  </span>
                </span>
              )}
              {lastUpdatedLabel && (
                <span className="text-subtle tabular-nums">
                  оновлено · {lastUpdatedLabel}
                </span>
              )}
            </div>
          )}

          {/* Filters */}
          <div
            data-finyk-no-swipe
            className="-mx-3 px-3 overflow-x-auto no-scrollbar"
          >
            <div className="flex gap-1.5 whitespace-nowrap">
              {[
                { id: "all", label: "Всі" },
                { id: "expense", label: "Витрати" },
                { id: "income", label: "Доходи" },
                ...(creditAccIds.size > 0
                  ? [{ id: "credit", label: "💳 Кредитна" }]
                  : []),
                ...catSpends.map((c) => ({
                  id: c.id,
                  label: c.label.split(" ")[0] + " " + c.label.slice(3),
                })),
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "text-xs px-4 py-2 rounded-full border transition-colors min-h-[36px] font-medium",
                    filter === f.id
                      ? "bg-primary border-primary text-bg shadow-sm"
                      : "bg-panelHi border-line text-text hover:border-muted",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Skeleton — shape-aware: matches a real TxRow (icon · 2-line
            description · amount). Stagger fades down so the list feels
            like it's "loading from the top" instead of pulsing as a slab. */}
        {activeLoading && activeTx.length === 0 && (
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
        )}

        {/* Empty */}
        {filtered.length === 0 && !activeLoading && (
          <div className="rounded-2xl border border-dashed border-line bg-panelHi/40">
            <EmptyState
              icon={<Icon name="credit-card" size={20} strokeWidth={1.6} />}
              title="Немає транзакцій"
              description="Зміни місяць, фільтр або переключи «приховані», якщо вони є."
            />
          </div>
        )}

        {/* Virtualized list */}
        {filtered.length > 0 && (
          <div className="rounded-2xl border border-line/40 overflow-hidden -mx-px">
            <GroupedVirtuoso
              customScrollParent={scrollParent}
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
                const label = formatStickyDayLabel(key);
                return (
                  <button
                    type="button"
                    onClick={() => toggleDay(key)}
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? "Розгорнути" : "Згорнути"} ${label}`}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-bg/95 backdrop-blur-sm border-b border-line text-xs font-semibold text-text tracking-wide hover:bg-panelHi transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                        className="shrink-0 motion-safe:transition-transform motion-safe:duration-150"
                        style={{
                          transform: collapsed
                            ? "rotate(-90deg)"
                            : "rotate(0deg)",
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span className="truncate">{label}</span>
                      <span className="shrink-0 text-[10px] font-semibold text-muted normal-case tabular-nums">
                        · {summary.count}
                      </span>
                    </span>
                    {showTotal && (
                      <span
                        className={cn(
                          "shrink-0 tabular-nums",
                          summary.total > 0 ? "text-success" : "text-text",
                        )}
                      >
                        {/* fmtAmt сам додає `+`/`-` — не дублюємо префікс. */}
                        {fmtAmt(summary.total, CURRENCY.UAH)}
                      </span>
                    )}
                  </button>
                );
              }}
              itemContent={(index) => {
                const t = flatItems[index];
                if (!t) return null;
                return (
                  <TxListItem
                    tx={t}
                    rowIndex={index}
                    selectMode={selectMode}
                    selected={selectMode && selectedIds.has(t.id)}
                    hidden={hiddenTxIdSet.has(t.id)}
                    overrideCatId={txCategories[t.id]}
                    txSplits={txSplits}
                    accounts={accounts}
                    hideAmount={!showBalance}
                    customCategories={customCategories}
                    onToggleSelect={toggleSelect}
                    onSwipeHideTx={stableSwipeHideTx}
                    onSwipeDeleteManual={stableSwipeDeleteManual}
                    onEditManual={stableOnEditManual}
                    onHideTx={stableHideTx}
                    onCatChange={stableOverrideCategory}
                    onSplitChange={stableSetSplitTx}
                  />
                );
              }}
            />
          </div>
        )}

        {activeLoading && activeTx.length > 0 && (
          <p className="text-center text-xs text-subtle py-2">⟳ оновлення…</p>
        )}
      </div>

      <TransactionsBatchToolbar
        selectMode={selectMode}
        selectedSize={selectedIds.size}
        onOpenCatPicker={() => setBatchCatPicker(true)}
        onApplyHide={applyBatchHide}
        onApplyExclude={applyBatchExclude}
        batchCatPicker={batchCatPicker}
        onCloseCatPicker={() => setBatchCatPicker(false)}
        onApplyCategory={applyBatchCategory}
        customCategories={customCategories}
      />
    </div>
  );
}
