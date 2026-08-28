/**
 * Last validated: 2026-05-14
 * Status: Active
 */
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
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Money, Delta } from "@shared/components/ui/Money";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { filterToKyivMonth } from "../lib/monthWindow";
import { isMonoNotConnectedError } from "../lib/monoBankErrors";
import { useAnalytics } from "../hooks/useAnalytics";
import { CategoryPieChart } from "../components/charts/lazy";
import { ChartFallback } from "../components/charts/ChartFallback";
import { MerchantList } from "../components/analytics/MerchantList";
import { getTrendComparison } from "@sergeant/finyk-domain/domain/selectors";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type {
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
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

export interface AnalyticsProps {
  mono: {
    realTx?: Transaction[];
    loadingTx?: boolean;
    fetchMonth: (year: number, month0Based: number) => Promise<Transaction[]>;
  };
  storage: {
    excludedTxIds: Set<string> | Iterable<string>;
    txSplits: TxSplitsMap;
    manualExpenses?: ManualExpense[];
  };
  /**
   * Дрил-даун із кільця категорій у список операцій. Саме він робить
   * Аналітику не глухим кутом: доти вона казала «скільки», але дійти від
   * числа до самих операцій було ніяк.
   */
  onSelectCategory?: (categoryId: string) => void;
}

// Презентаційний контейнер-секція. memo, бо приймає лише `title/className/children`
// і не має побічних ефектів — уникаємо рендеру при оновленнях, не повʼязаних з пропсами.
const Section = memo(function Section({
  title,
  children,
  className,
}: SectionProps) {
  return (
    <Card radius="lg" padding="lg" className={className}>
      <SectionHeading as="div" size="xs" className="mb-4" variant="finyk">
        {title}
      </SectionHeading>
      {children}
    </Card>
  );
});

// Навігація між місяцями. memo — пропси (year/month/onChange) змінюються рідко,
// а сторінка Analytics ре-рендериться при кожному завантаженні історії.
const MonthNav = memo(function MonthNav({
  year,
  month,
  onChange,
}: MonthNavProps) {
  // Use Kyiv-local year/month so "current month" matches Europe/Kyiv day boundaries.
  const nowKyiv = getKyivDateParts();
  const isCurrentMonth = year === nowKyiv.year && month === nowKyiv.month;
  const label = new Date(year, month - 1, 1).toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });

  const go = (delta: number) => {
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
        className="min-w-[44px] min-h-[44px] rounded-xl border border-line flex items-center justify-center text-muted hover:text-text hover:bg-panelHi transition-colors"
        aria-label="Попередній місяць"
      >
        <Icon name="chevron-left" size="sm" />
      </button>
      <span className="text-style-label text-text capitalize">{label}</span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={isCurrentMonth}
        className="min-w-[44px] min-h-[44px] rounded-xl border border-line flex items-center justify-center text-muted hover:text-text hover:bg-panelHi transition-colors disabled:opacity-30"
        aria-label="Наступний місяць"
      >
        <Icon name="chevron-right" size="sm" />
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

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <Money amount={current} className="text-text font-medium" />
        {prev > 0 && pct !== null && (
          /* Полярність задає `kind`, а не знак: зростання доходу — добре,
             зростання витрат — ні. Рівно те розділення, заради якого
             `Delta` бере `polarity` окремим пропом. */
          <Delta
            value={pct}
            symbol="%"
            polarity={kind === "income" ? "positive" : "negative"}
            className="text-style-caption font-normal"
          />
        )}
      </div>
    </div>
  );
});

export function Analytics({ mono, storage, onSelectCategory }: AnalyticsProps) {
  // Use Kyiv-local year/month so "current month" tracks Europe/Kyiv day boundaries.
  const nowKyiv = getKyivDateParts();
  const [year, setYear] = useState(nowKyiv.year);
  const [month, setMonth] = useState(nowKyiv.month);

  // Fire-and-forget: record that the analytics view was opened. Intentionally
  // runs once on mount (no month dep) so re-selecting months doesn't spam.
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.ANALYTICS_OPENED, { module: "finyk" });
  }, []);

  const isCurrentMonth = year === nowKyiv.year && month === nowKyiv.month;

  // In-memory cache of fetched historical months. Keyed by "YYYY-MM".
  // No localStorage — source of truth is the server; React Query handles
  // HTTP-level caching so repeated navigations don't re-fetch.
  const [monthCache, setMonthCache] = useState<Record<string, Transaction[]>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  // Помилки читання ПО МІСЯЦЯХ, а не одна на сторінку. Дві причини.
  //
  // 1) Реєстр упалих місяців розриває нескінченний цикл: `mono` приходить
  //    новим обʼєктом на КОЖЕН рендер (`useMonobankWebhook` повертає
  //    літерал, `useUnifiedFinanceData` його перепаковує), тож `ensureMonth`
  //    міняв ідентичність, ефекти нижче перезапускались, місяця в кеші не
  //    було — і fetch стартував знову: реджект → `setFetchError` → рендер →
  //    новий fetch → реджект. Саме через цей цикл кнопка «Повторити»
  //    виглядала мертвою: вона таки перезапускала читання, але плашка
  //    поверталась за мілісекунди від наступної спроби.
  // 2) Ключ = місяць, тож провал ФОНОВОГО fetch-у попереднього місяця
  //    (його тягнуть лише заради секції «Порівняння») більше не малює
  //    червону плашку над місяцем, який завантажився нормально.
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  const fetchingRef = useRef(new Set<string>());

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const fetchError = fetchErrors[monthKey] ?? null;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  // `fetchMonth` — стабільний `useCallback` усередині `useMonobankWebhook`,
  // на відміну від обгортки `mono`. Тримаємось за саму функцію, щоб
  // ідентичність `ensureMonth` мінялась лише від реальних змін.
  const fetchMonth = mono.fetchMonth;

  // Fetch a month from the server (via mono.fetchMonth → React Query)
  // and store the result in the in-memory cache.
  const ensureMonth = useCallback(
    (y: number, m1: number, key: string) => {
      if (fetchingRef.current.has(key)) return;
      if (monthCache[key]) return;
      // Місяць уже впав — не перезапускаємо самі. Перезапуск робить
      // «Повторити», і лише він (див. цикл в описі `fetchErrors`).
      if (fetchErrors[key]) return;
      fetchingRef.current.add(key);
      void Promise.resolve().then(() => {
        setLoading(true);
      });
      fetchMonth(y, m1 - 1)
        .then((txs) => {
          setMonthCache((prev) => ({ ...prev, [key]: txs }));
          // Успіх гасить плашку саме цього місяця — доти вона лишалась на
          // екрані навіть після того, як дані приїхали.
          setFetchErrors((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        })
        .catch((err: unknown) => {
          if (isMonoNotConnectedError(err)) {
            // Банку просто немає — це порожній місяць, а не збій. Кладемо
            // порожній зріз у кеш, щоб секції показали empty-state, а не
            // червону плашку (у людини з самими ручними витратами вона
            // висіла назавжди й не зникала після «Повторити»).
            setMonthCache((prev) => ({ ...prev, [key]: [] }));
            return;
          }
          // Не отруюємо кеш порожнім масивом — тимчасовий збій має
          // лишатись перезапускним. Порожній ключ у кеші виглядав би як
          // чесний «0 ₴».
          setFetchErrors((prev) => ({
            ...prev,
            [key]: "Не вдалось завантажити транзакції",
          }));
        })
        .finally(() => {
          fetchingRef.current.delete(key);
          // Keep the loading indicator on while any other month fetch is
          // still in flight; flipping to `false` unconditionally would
          // hide loading whenever the first parallel fetch resolves.
          setLoading(fetchingRef.current.size > 0);
        });
    },
    [fetchMonth, monthCache, fetchErrors],
  );

  // «Повторити» = зняти позначку провалу і викинути кеш обраного місяця
  // (та попереднього, який живить «Порівняння»). Обидва `set*` віддають
  // НОВІ обʼєкти, тож `ensureMonth` міняє ідентичність і ефекти нижче
  // перезапускають читання — це і є справжній ретрай, а не лише ховання
  // плашки.
  const retryCurrentMonth = useCallback(() => {
    setFetchErrors((prev) => {
      if (!(monthKey in prev) && !(prevKey in prev)) return { ...prev };
      const next = { ...prev };
      delete next[monthKey];
      delete next[prevKey];
      return next;
    });
    setMonthCache((prev) => {
      const next = { ...prev };
      delete next[monthKey];
      delete next[prevKey];
      return next;
    });
  }, [monthKey, prevKey]);

  useEffect(() => {
    if (!isCurrentMonth) ensureMonth(year, month, monthKey);
  }, [isCurrentMonth, year, month, monthKey, ensureMonth]);

  useEffect(() => {
    ensureMonth(prevYear, prevMonth, prevKey);
  }, [prevYear, prevMonth, prevKey, ensureMonth]);

  // Manual expenses for the currently selected month.
  // storage (localStorage-backed), not in the server tx stream, so they
  // must be merged into `activeTx` explicitly — otherwise Analytics shows
  // 0 ₴ even when Transactions clearly lists them. See useTransactionFilters
  // for the source-of-truth merge pattern.
  const manualExpenseTxs = useMemo(() => {
    const list = storage.manualExpenses;
    if (!list || list.length === 0) return [] as Transaction[];
    const monthStart = new Date(year, month - 1, 1).getTime();
    const monthEnd = new Date(year, month, 1).getTime();
    return list
      .filter((e) => {
        const ts = new Date(e.date).getTime();
        return ts >= monthStart && ts < monthEnd;
      })
      .map((e) => manualExpenseToTransaction(e));
  }, [storage.manualExpenses, year, month]);

  const prevManualExpenseTxs = useMemo(() => {
    const list = storage.manualExpenses;
    if (!list || list.length === 0) return [] as Transaction[];
    const monthStart = new Date(prevYear, prevMonth - 1, 1).getTime();
    const monthEnd = new Date(prevYear, prevMonth, 1).getTime();
    return list
      .filter((e) => {
        const ts = new Date(e.date).getTime();
        return ts >= monthStart && ts < monthEnd;
      })
      .map((e) => manualExpenseToTransaction(e));
  }, [storage.manualExpenses, prevYear, prevMonth]);

  // AI-DANGER: банківський зріз ОБОВʼЯЗКОВО клампиться по місяцю, як в
  // Огляді (`useOverviewData`) і Бюджетах (`Budgets.tsx`). Ручні витрати
  // вище вже вікноавані, а банківські — ні, і саме ця асиметрія робила
  // Аналітику єдиною поверхнею Фініка без клампу.
  //
  // `mono.realTx` — це `overlayTransactions` із `useMonobankWebhook`: коли
  // мережевий зріз поточного місяця порожній (холодний старт, перше число
  // місяця), він підставляє ВЕСЬ SQLite-mirror. Відколи `fetchMonth`
  // backfill-ить дзеркало історією, цей overlay тягне сюди кожен
  // синхронізований місяць — і «Підсумок місяця» показував би суму за весь
  // час. Це той самий клас бага, що й founder-репорт 2026-07-31 («Витрати
  // 128 842 ₴ за серпень» першого числа), лише інша поверхня.
  //
  // Клампимо й `monthCache`-гілку: вона приходить із місяцевого fetch-у, але
  // його межі анкорені на фіксований `+03:00`, а `filterToKyivMonth` — на
  // справжній київський зсув, тож взимку краї місяця розходяться на годину.
  const activeTx = useMemo(() => {
    const bankTx = filterToKyivMonth(
      isCurrentMonth ? mono.realTx || [] : monthCache[monthKey] || [],
      monthKey,
    );
    if (manualExpenseTxs.length === 0) return bankTx;
    return [...bankTx, ...manualExpenseTxs];
  }, [isCurrentMonth, mono.realTx, monthCache, monthKey, manualExpenseTxs]);

  const prevTx = useMemo(() => {
    const bankTx = filterToKyivMonth(monthCache[prevKey] || [], prevKey);
    if (prevManualExpenseTxs.length === 0) return bankTx;
    return [...bankTx, ...prevManualExpenseTxs];
  }, [monthCache, prevKey, prevManualExpenseTxs]);

  const analyticsMono = useMemo(
    () => ({ ...mono, realTx: activeTx, loadingTx: mono.loadingTx || loading }),
    [mono, activeTx, loading],
  );

  const { summary, distribution, distributionTotal, topMerchants } =
    useAnalytics({
      mono: analyticsMono,
      storage,
    });

  const comparison = useMemo(() => {
    if (!(prevKey in monthCache)) return null;
    const c = getTrendComparison(activeTx, prevTx, {
      excludedTxIds: storage.excludedTxIds,
      txSplits: storage.txSplits,
    });
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
    monthCache,
    prevKey,
    storage.excludedTxIds,
    storage.txSplits,
  ]);

  const pageLoading =
    (isCurrentMonth ? mono.loadingTx : loading) && activeTx.length === 0;

  // useCallback — передається у memo(MonthNav); стабільне посилання дозволяє
  // уникати перерендеру навігації при оновленні інших частин сторінки.
  const handleMonthChange = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <h1 className="sr-only">Аналітика</h1>
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
        <MonthNav year={year} month={month} onChange={handleMonthChange} />

        {fetchError && activeTx.length === 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger-strong dark:text-danger">
            <span>{fetchError}</span>
            <button
              type="button"
              onClick={retryCurrentMonth}
              className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
            >
              Повторити
            </button>
          </div>
        )}

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
                <div className="text-style-caption text-subtle mb-1">
                  Витрати
                </div>
                <Money
                  amount={summary.spent}
                  tone="inherit"
                  className="block text-style-label text-danger-strong dark:text-danger"
                />
              </div>
              <div className="text-center">
                <div className="text-style-caption text-subtle mb-1">Дохід</div>
                <Money
                  amount={summary.income}
                  tone="inherit"
                  className="block text-style-label text-success-strong dark:text-success"
                />
              </div>
              <div className="text-center">
                <div className="text-style-caption text-subtle mb-1">
                  Баланс
                </div>
                {/* Баланс — підписана дельта, тож `Delta`, а не `Money`:
                    вона й знак ставить сама, і колір бере з того самого
                    `signedDeltaClass`, який тут стояв вручну. */}
                <Delta
                  value={summary.balance}
                  polarity="positive"
                  className="block text-style-label"
                />
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
              module="finyk"
              title="Поки немає витрат"
              description="За цей місяць транзакцій не знайдено, обери інший період зверху."
            />
          ) : (
            <Suspense fallback={<ChartFallback className="h-40" />}>
              <CategoryPieChart
                data={distribution}
                total={distributionTotal}
                className=""
                {...(onSelectCategory ? { onSelectCategory } : {})}
              />
            </Suspense>
          )}
        </Section>

        {/* Merchants */}
        <Section title="Топ продавці">
          {pageLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 rounded-xl" />
              ))}
            </div>
          ) : topMerchants.length === 0 ? (
            <EmptyState
              compact
              module="finyk"
              title="Поки немає продавців"
              description="Витрат за цей місяць ще не записано."
            />
          ) : (
            <MerchantList merchants={topMerchants} className="" />
          )}
        </Section>
      </div>
    </div>
  );
}
