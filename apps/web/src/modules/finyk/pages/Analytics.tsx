import {
  memo,
  useCallback,
  useState,
  useEffect,
  useMemo,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { cn } from "@shared/lib/cn";
import { signedDeltaClass } from "@shared/lib";
import { useAnalytics } from "../hooks/useAnalytics";
import { CategoryPieChart } from "../components/charts/lazy";
import { ChartFallback } from "../components/charts/ChartFallback";
import { MerchantList } from "../components/analytics/MerchantList";
import { getTrendComparison } from "@sergeant/finyk-domain/domain/selectors";
import type { TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import { readJSON } from "../lib/finykStorage";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";

interface SectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

interface MonthNavProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

interface ComparisonRowProps {
  label: string;
  current: number;
  prev: number;
  kind?: "expense" | "income";
}

export interface AnalyticsMonoAdapter {
  realTx?: unknown[];
  loadingTx?: boolean;
  fetchMonth: (year: number, month0Based: number) => Promise<unknown>;
}

export interface AnalyticsStorageAdapter {
  excludedTxIds: Set<string> | Iterable<string>;
  txSplits: TxSplitsMap;
}

interface AnalyticsProps {
  mono: AnalyticsMonoAdapter;
  storage: AnalyticsStorageAdapter;
}

// `fetchMonth` приймає 0-based місяць (як у `new Date(y, m, 1)`).
// Сторінка оперує 1-based (1..12), тож тут нормалізуємо.
function readTxCache(year: number, month1Based: number) {
  const m0 = month1Based - 1;
  const cache = readJSON<{ txs?: unknown } | null>(
    `finyk_tx_cache_${year}_${m0}`,
    null,
  );
  if (!cache || typeof cache !== "object") return null;
  return Array.isArray(cache.txs) ? cache.txs : null;
}

// Презентаційний контейнер-секція. memo, бо приймає лише `title/className/children`
// і не має побічних ефектів — уникаємо рендеру при оновленнях, не пов'язаних з пропсами.
const Section = memo(function Section({
  title,
  children,
  className,
}: SectionProps) {
  return (
    <div
      className={cn(
        "bg-panel border border-line rounded-2xl p-5 shadow-card",
        className,
      )}
    >
      <SectionHeading as="div" size="sm" className="mb-4">
        {title}
      </SectionHeading>
      {children}
    </div>
  );
});

// Навігація між місяцями. memo — пропси (year/month/onChange) змінюються рідко,
// а сторінка Analytics ре-рендериться при кожному завантаженні історії.
const MonthNav = memo(function MonthNav({
  year,
  month,
  onChange,
}: MonthNavProps) {
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const label = new Date(year, month - 1, 1).toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });

  const go = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (m < 1) {
      m = 12;
      y--;
    }
    onChange(y, m);
  };

  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => go(-1)}
        className="w-9 h-9 rounded-xl border border-line flex items-center justify-center text-muted hover:text-text hover:bg-panelHi transition-colors"
        aria-label="Попередній місяць"
      >
        ‹
      </button>
      <span className="text-sm font-semibold text-text capitalize">
        {label}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={isCurrentMonth}
        className="w-9 h-9 rounded-xl border border-line flex items-center justify-center text-muted hover:text-text hover:bg-panelHi transition-colors disabled:opacity-30"
        aria-label="Наступний місяць"
      >
        ›
      </button>
    </div>
  );
});

// Рядок порівняння метрики з попереднім місяцем. Чиста функція від пропсів —
// memo знімає перерендер при оновленнях сусідніх секцій Analytics.
// `kind` визначає семантику знаку: для "expense" зростання — погано
// (червоне), для "income" — добре (зелене).
const ComparisonRow = memo(function ComparisonRow({
  label,
  current,
  prev,
  kind = "expense",
}: ComparisonRowProps) {
  const diff = current - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  const up = diff > 0;
  const upIsGood = kind === "income";
  const good = diff === 0 ? null : up === upIsGood;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2 tabular-nums">
        <span className="text-text font-medium">
          {current.toLocaleString("uk-UA")} ₴
        </span>
        {prev > 0 && pct !== null && (
          <span
            className={cn(
              "text-xs",
              good === null
                ? "text-muted"
                : good
                  ? "text-success-strong dark:text-success"
                  : "text-danger",
            )}
          >
            {up ? "+" : ""}
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
});

export function Analytics({ mono, storage }: AnalyticsProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Fire-and-forget: record that the analytics view was opened. Intentionally
  // runs once on mount (no month dep) so re-selecting months doesn't spam.
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.ANALYTICS_OPENED, { module: "finyk" });
  }, []);

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  const [historyCache, setHistoryCache] = useState({});
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(new Set());

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  const ensureMonth = (y, m1, key) => {
    if (fetchingRef.current.has(key)) return;
    const cached = readTxCache(y, m1);
    if (cached) {
      setHistoryCache((prev) =>
        prev[key] ? prev : { ...prev, [key]: cached },
      );
      return;
    }
    fetchingRef.current.add(key);
    setLoading(true);
    // `fetchMonth` очікує 0-based місяць (як `Date.getMonth()`).
    mono
      .fetchMonth(y, m1 - 1)
      .then(() => {
        const txs = readTxCache(y, m1) || [];
        setHistoryCache((prev) => ({ ...prev, [key]: txs }));
      })
      .catch(() => {
        setHistoryCache((prev) => ({ ...prev, [key]: [] }));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!isCurrentMonth && !historyCache[monthKey]) {
      ensureMonth(year, month, monthKey);
    }
    // `ensureMonth`/`historyCache` excluded — `ensureMonth` is redefined
    // each render and `historyCache` changes after fetch, both would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, isCurrentMonth, monthKey]);

  useEffect(() => {
    if (!historyCache[prevKey]) {
      ensureMonth(prevYear, prevMonth, prevKey);
    }
    // `ensureMonth`/`historyCache` excluded — same reason as above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevYear, prevMonth, prevKey]);

  // Transactions for the selected month: live list for the current month,
  // on-demand cached list otherwise. Stable reference while month + cache
  // entry stay the same.
  const activeTx = useMemo(() => {
    if (isCurrentMonth) return mono.realTx || [];
    return historyCache[monthKey] || [];
  }, [isCurrentMonth, mono.realTx, historyCache, monthKey]);

  const prevTx = useMemo(
    () => historyCache[prevKey] || [],
    [historyCache, prevKey],
  );

  // Stable adapter object passed into useAnalytics. Rebuilding this on every
  // render would bust the hook's internal useMemo deps, so memoize it.
  const analyticsMono = useMemo(
    () => ({ ...mono, realTx: activeTx, loadingTx: mono.loadingTx || loading }),
    [mono, activeTx, loading],
  );

  const { summary, distribution, topMerchants } = useAnalytics({
    mono: analyticsMono,
    storage,
  });

  // Cache: month-over-month comparison for the picked month.
  // Depends on the selected month's tx list, the previous month's tx list
  // and the filters that actually affect totals (excluded ids + splits).
  const comparison = useMemo(() => {
    // Попередній місяць ще не вичитаний — не показувати секцію.
    if (!(prevKey in historyCache)) return null;
    const c = getTrendComparison(activeTx, prevTx, {
      excludedTxIds: storage.excludedTxIds,
      txSplits: storage.txSplits,
    });
    // Обидві сторони порожні — порівнювати немає чого.
    if (
      c.currentSpent === 0 &&
      c.prevSpent === 0 &&
      c.currentIncome === 0 &&
      c.prevIncome === 0
    ) {
      return null;
    }
    return c;
  }, [
    activeTx,
    prevTx,
    historyCache,
    prevKey,
    storage.excludedTxIds,
    storage.txSplits,
  ]);

  const pageLoading =
    (isCurrentMonth ? mono.loadingTx : loading) && activeTx.length === 0;

  // useCallback — передається у memo(MonthNav); стабільне посилання дозволяє
  // уникати перерендеру навігації при оновленні інших частин сторінки.
  const handleMonthChange = useCallback((y, m) => {
    setYear(y);
    setMonth(m);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
        <MonthNav year={year} month={month} onChange={handleMonthChange} />

        {/* Summary */}
        <Section title="Підсумок місяця">
          {pageLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-2xs text-subtle mb-1">Витрати</div>
                <div className="text-sm font-bold tabular-nums text-danger">
                  {summary.spent.toLocaleString("uk-UA")} ₴
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xs text-subtle mb-1">Дохід</div>
                <div className="text-sm font-bold tabular-nums text-success-strong dark:text-success">
                  {summary.income.toLocaleString("uk-UA")} ₴
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xs text-subtle mb-1">Баланс</div>
                <div
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    signedDeltaClass(summary.balance),
                  )}
                >
                  {summary.balance >= 0 ? "+" : ""}
                  {summary.balance.toLocaleString("uk-UA")} ₴
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Comparison */}
        {comparison && (
          <Section title="Порівняння з попереднім місяцем">
            <div className="space-y-2">
              <ComparisonRow
                label="Витрати"
                current={comparison.currentSpent}
                prev={comparison.prevSpent}
              />
              <ComparisonRow
                label="Дохід"
                current={comparison.currentIncome}
                prev={comparison.prevIncome}
                kind="income"
              />
            </div>
          </Section>
        )}

        {/* Categories */}
        <Section title="Категорії">
          {pageLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : distribution.length === 0 ? (
            <EmptyState
              compact
              title="Немає витрат"
              description="Транзакцій за цей місяць не знайдено"
            />
          ) : (
            <Suspense fallback={<ChartFallback className="h-40" />}>
              <CategoryPieChart data={distribution} className="" />
            </Suspense>
          )}
        </Section>

        {/* Merchants */}
        <Section title="Топ мерчанти">
          {pageLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 rounded-xl" />
              ))}
            </div>
          ) : topMerchants.length === 0 ? (
            <EmptyState
              compact
              title="Немає даних"
              description="Транзакцій ще немає"
            />
          ) : (
            <MerchantList merchants={topMerchants} className="" />
          )}
        </Section>
      </div>
    </div>
  );
}
