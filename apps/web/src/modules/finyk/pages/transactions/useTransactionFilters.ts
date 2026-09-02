import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ucFirst } from "@shared/lib/ui/ucFirst";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import { txTimeMs } from "@sergeant/finyk-domain/lib/transactions";
import type {
  Category,
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type { TxAccount } from "./Transactions";
import { perfMark, perfEnd } from "@shared/lib/ui/perf";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import { mergeExpenseCategoryDefinitions } from "../../constants";
import {
  calcCategorySpent,
  getExpenseCategoryForTransaction,
  getIncomeCategoryForTransaction,
} from "../../utils";
import {
  DAY_COLLAPSE_KEY,
  computeDaySummary,
  dayKeyFromTx,
  findAddedManualExpenseDayKey,
  isDayExpanded,
  readDayCollapse,
  writeDayCollapse,
} from "./transactionsLib";

/**
 * Current Kyiv-local `{ year, month0 }` (month is 0-indexed to match the
 * legacy `Date#getMonth()` shape consumed by `selMonth` state). Called
 * fresh on every read so the comparison stays correct when the user
 * keeps the tab open across midnight / month boundaries. Previously this
 * was `const now = new Date()` at module load, which froze the "current
 * month" at import time (consolidated page-audit § Theme 1 — 05 F6).
 */
function kyivNowMonth(): { year: number; month: number } {
  const parts = getKyivDateParts();
  return { year: parts.year, month: parts.month - 1 };
}

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
  onClearCategoryFilter?: (() => void) | undefined;
  /** URL-driven calendar shortcut from Overview (`date=today`). */
  dayFilter?: string | null | undefined;
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
  dayFilter,
}: UseTransactionFiltersParams) {
  const [filter, setFilter] = useState("all");
  const [showHidden, setShowHidden] = useState(false);
  const [selMonth, setSelMonth] = useState(() => kyivNowMonth());

  /*
    AI-CONTEXT: `categoryFilter` — ОДНОРАЗОВА передача з Аналітики, а не
    другий стан фільтра. Доти було навпаки: `effectiveFilter` читався як
    `categoryFilter ?? filter`, а ефект нижче проп гасив, нікуди його не
    записавши. Тобто значення жило один рендер і зникало — дрил-даун
    фізично не міг спрацювати, і саме тому `setCategoryFilter` ніде не
    викликався зі значенням.

    Підхоплюємо в РЕНДЕРІ, а не в ефекті (`react-hooks/set-state-in-effect`
    і документований React-патерн «adjusting state when a prop changes»):
    ефект дав би зайвий кадр зі старим фільтром, і на дрил-дауні цей кадр
    показував би повний список.

    `seenCategoryFilter` мусить скидатись і на `null` теж — інакше другий
    прихід у ТУ САМУ категорію дорівнював би попередньому й нічого б не
    зробив.
  */
  // AI-DANGER: нормалізація `undefined → null` обовʼязкова. Проп
  // необовʼязковий, тож без неї порівняння `undefined !== null` істинне на
  // КОЖНОМУ рендері — і це не теоретично: перша версія цього коду дала
  // «Too many re-renders» у 24 тестах.
  const incomingCategory = categoryFilter ?? null;
  const [seenCategoryFilter, setSeenCategoryFilter] = useState<string | null>(
    null,
  );
  if (incomingCategory !== seenCategoryFilter) {
    setSeenCategoryFilter(incomingCategory);
    if (incomingCategory) setFilter(incomingCategory);
  }

  // Гасимо одноразовий проп у власника, щоб він не «прилипав» до сторінки.
  useEffect(() => {
    if (categoryFilter) onClearCategoryFilter?.();
  }, [categoryFilter, onClearCategoryFilter]);

  // Єдине джерело правди — власний стан. Після підхоплення вище проп уже
  // нічого не перекриває.
  const effectiveFilter = filter;

  const { year: kyivNowY, month: kyivNowM } = kyivNowMonth();
  const isCurrentMonth =
    selMonth.year === kyivNowY && selMonth.month === kyivNowM;

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

  // The bank-side slice can carry rows outside `selMonth`: the read-overlay
  // in `useMonobankWebhook` falls back to the full SQLite mirror on a cold
  // start, and `historyTx` keeps the last fetched month while a new fetch is
  // in flight. Clamp to the selected month so the rendered rows always match
  // `monthLabel` instead of leaking adjacent-month groups under the header.
  const monthBankTxs = useMemo(() => {
    const monthStartSec =
      new Date(selMonth.year, selMonth.month, 1).getTime() / 1000;
    const monthEndSec =
      new Date(selMonth.year, selMonth.month + 1, 1).getTime() / 1000;
    const source = isCurrentMonth ? realTx : historyTx;
    return source.filter((t) => {
      const ts = t.time ?? 0;
      return ts >= monthStartSec && ts < monthEndSec;
    });
  }, [isCurrentMonth, realTx, historyTx, selMonth]);

  const activeTx = useMemo(
    () => [...monthBankTxs, ...manualExpenseTxs],
    [monthBankTxs, manualExpenseTxs],
  );
  const activeLoading = isCurrentMonth ? loadingTx : loadingHistory;

  // "Місяць порожній, але дані взагалі є" — окремий стан від "даних немає".
  // Без нього перший день нового місяця виглядав як повний втрата даних:
  // список чистий, а зверху висить first-run-хіро «Куди йдуть твої гроші?
  // Додай першу витрату… Підключи Monobank» — при підключеному банку і
  // повній історії за попередні місяці (звіт founder-а 2026-07-31,
  // 1 серпня 01:47). Джерела беремо ДО клампу по місяцю: `realTx` через
  // mirror-overlay тримає всю історію, `historyTx` — останній підвантажений
  // місяць, `manualExpenses` — усі ручні записи.
  const hasTransactionsOutsideMonth =
    activeTx.length === 0 &&
    (realTx.length > 0 ||
      historyTx.length > 0 ||
      (manualExpenses?.length ?? 0) > 0);

  // useCallback — `goMonth` підвʼязаний до двох кнопок навігації місяцями;
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
        const todayKyiv = kyivNowMonth();
        if (!(y === todayKyiv.year && m === todayKyiv.month))
          // Fire-and-forget: `fetchMonth` may reject (e.g. when monobank
          // is disconnected). The page degrades gracefully to its empty
          // state, so we just swallow the rejection here to keep the
          // unhandled-rejection logs clean.
          fetchMonth(y, m).catch(() => {});
        return { year: y, month: m };
      });
    },
    [fetchMonth, setSelMonth],
  );

  // TXT-7 (аудит 2026-09): велика літера в коді, не CSS `capitalize` —
  // інакше «р.» стає «Р.».
  const monthLabel = ucFirst(
    new Date(selMonth.year, selMonth.month, 1).toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    }),
  );

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
        ? getIncomeCategoryForTransaction(t, txCategories[t.id])
        : getExpenseCategoryForTransaction(
            t,
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
          spent: calcCategorySpent(
            statTx,
            cat.id,
            txCategories,
            txSplits,
            customCategories,
          ),
        }))
        .filter((c) => c.spent > 0)
        .sort((a, b) => b.spent - a.spent),
    [statTx, txSplits, txCategories, customCategories],
  );

  /**
   * Підпис активної категорії для знімного чипа у смузі фільтрів.
   *
   * AI-DANGER: береться з ПОВНОГО списку категорій, а не з `catSpends` —
   * той відфільтрований по `spent > 0`, і категорія, у якої цього місяця
   * витрат немає, лишилась би взагалі без імені. А саме в такий стан і
   * потрапляє людина, коли прийшла з Аналітики за інший місяць.
   */
  const activeCategoryLabel = useMemo(() => {
    if (effectiveFilter === "all") return null;
    if (["expense", "income", "credit"].includes(effectiveFilter)) return null;
    const cat = mergeExpenseCategoryDefinitions(customCategories).find(
      (c) => c.id === effectiveFilter,
    );
    if (!cat) return null;
    // Емодзі на початку підпису прибираємо — те саме правило, що діяло
    // для чипів категорій до їх зняття.
    const space = cat.label.indexOf(" ");
    return space > 0 ? cat.label.slice(space + 1) : cat.label;
  }, [effectiveFilter, customCategories]);

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
    const todayKey = dayFilter === "today" ? getKyivDayKey() : null;
    const res = sortedTxs.filter((t) => {
      if (todayKey) {
        const timeMs = txTimeMs(t.time);
        if (!Number.isFinite(timeMs) || timeMs <= 0) return false;
        if (getKyivDayKey(timeMs) !== todayKey) return false;
      }
      if (effectiveFilter === "all") return true;
      if (effectiveFilter === "income") return t.amount > 0;
      if (effectiveFilter === "expense") return t.amount < 0;
      if (effectiveFilter === "credit")
        return (
          typeof t._accountId === "string" && creditAccIds.has(t._accountId)
        );
      return getEffectiveCat(t).id === effectiveFilter;
    });
    perfEnd(m, { n: res.length });
    return res;
  }, [sortedTxs, effectiveFilter, creditAccIds, getEffectiveCat, dayFilter]);

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
  const [todayDayKey] = useState(() =>
    dayKeyFromTx(Math.floor(Date.now() / 1000)),
  );
  const [dayOverrides, setDayOverrides] = useState(() => readDayCollapse());

  // Sync with other tabs: another Finyk tab toggling the same day should
  // immediately reflect here, matching how the rest of the module treats
  // localStorage as the single source of truth.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== DAY_COLLAPSE_KEY) return;
      const next = readDayCollapse();
      // Diff before committing — a cross-tab event that doesn't actually
      // change our overrides shouldn't force a re-render (page-audit-05 F18).
      setDayOverrides((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
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

  // B6 · Щойно доданий ручний запис не має «зникати» у згорнутій групі.
  // Дні лишаються згорнутими за замовчуванням (inbox-style — свідоме
  // рішення нижче), але саме день створеного запису розгортаємо, щоб
  // людина побачила свою транзакцію одразу після тосту «Витрату додано».
  //
  // Чому тут, а не в місці збереження (`FinykApp` → `ManualExpenseSheet`):
  // стан розгортання живе в цьому хуці, тож ефект дивиться на прихід
  // нового запису в `manualExpenses` і покриває будь-яке джерело
  // додавання (FAB-шит, quick-add, HubChat) без прокидання коллбеків
  // через три файли.
  //
  // Розгортаємо день САМОЇ транзакції (у формі є «Не сьогодні? Змінити
  // дату»), а не сьогоднішній, і через той самий `dayOverrides` /
  // `writeDayCollapse` — стан переживає перезавантаження, а наступний
  // тап користувача по хедеру знову згортає день (ручний override
  // перемагає, бо ефект спрацьовує лише на НОВИЙ id).
  const knownManualExpenseIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const list = manualExpenses ?? [];
    const known = knownManualExpenseIdsRef.current;
    knownManualExpenseIdsRef.current = new Set(list.map((e) => e.id));
    // Перший прогін — лише baseline: список, з яким екран змонтувався,
    // не є «щойно доданим».
    if (!known) return;
    const dayKey = findAddedManualExpenseDayKey(known, list);
    if (!dayKey) return;
    setDayOverrides((prev) => {
      if (prev[dayKey]) return prev;
      const next = { ...prev, [dayKey]: true };
      writeDayCollapse(next);
      return next;
    });
  }, [manualExpenses]);

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
    filter: effectiveFilter,
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
    hasTransactionsOutsideMonth,
    creditAccIds,
    hiddenTxIdSet,
    catSpends,
    activeCategoryLabel,
    filtered,
    groupedByDate,
    daySummaries,
    collapsedKeys,
    groupCounts,
    flatItems,
    toggleDay,
  };
}
