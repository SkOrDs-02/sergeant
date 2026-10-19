import { messages } from "@shared/i18n";
import { useCallback, useState, useEffect, useMemo, Suspense } from "react";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { useAnalytics } from "../hooks/useAnalytics";
import { useAnalyticsMonthData } from "../hooks/useAnalyticsMonthData";
import { AccountBars, CategoryBars } from "../components/charts/lazy";
import { filterByAccountKey } from "@sergeant/finyk-domain/domain/accountBreakdown";
import { ChartFallback } from "../components/charts/ChartFallback";
import { AnalyticsSection as Section } from "../components/analytics/AnalyticsSection";
import { AnalyticsSummary } from "../components/analytics/AnalyticsSummary";
import { ComparisonRow } from "../components/analytics/ComparisonRow";
import { MonthNav } from "../components/analytics/MonthNav";
import { MerchantList } from "../components/analytics/MerchantList";
import { MonthlyTrendBars } from "../components/analytics/MonthlyTrendBars";
import { CategoryDeltaTable } from "../components/analytics/CategoryDeltaTable";
import { useMonthlyTrend, type FetchBankRange } from "../hooks/useMonthlyTrend";
import { getTrendComparison } from "@sergeant/finyk-domain/domain/selectors";
import {
  getCategoryDeltas,
  getSavingsRate,
} from "@sergeant/finyk-domain/domain/trends";
import { withMerchantRuleOverrides } from "@sergeant/finyk-domain/lib/merchantRuleOverrides";
import type { MerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type {
  Category,
  Transaction,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";
import { markFinykAnalyticsViewed } from "../../../core/onboarding/useChecklistSignals";

export interface AnalyticsProps {
  mono: {
    realTx?: Transaction[];
    loadingTx?: boolean;
    fetchMonth: (year: number, month0Based: number) => Promise<Transaction[]>;
    /** Діапазон у дзеркало для тренду (Р11); без банку відсутній. */
    fetchRange?: FetchBankRange;
    /** Підписи рахунків для розрізу «За рахунками» (Р4 v3). */
    accounts?: readonly {
      id?: string | undefined;
      type?: string | undefined;
    }[];
  };
  storage: {
    excludedTxIds: Set<string> | Iterable<string>;
    txSplits: TxSplitsMap;
    manualExpenses?: ManualExpense[];
    txCategories?: Record<string, string | undefined>;
    /** Правила «Завжди так для цього магазину»: категорії тут мусять збігатися зі списком. */
    merchantRuleIndex?: MerchantRuleIndex;
    customCategories?: Category[];
    /** Фінплан: план накопичень ставиться поруч із фактом (Р15). */
    monthlyPlan?: { savings?: string | number };
  };
  /**
   * Дрил-даун із кільця категорій у список операцій. Саме він робить
   * Аналітику не глухим кутом: доти вона казала «скільки», але дійти від
   * числа до самих операцій було ніяк.
   */
  onSelectCategory?: (
    categoryId: string,
    period: { year: number; month: number },
  ) => void;
  /**
   * «Приховати суми» (PR-F3 founder-UX audit 2026-09-13): доти сторінка
   * не приймала цей проп узагалі, тож перемикач з Огляду не діяв тут —
   * маскує підсумок місяця, порівняння, кільце категорій і топ продавців.
   */
  showBalance?: boolean;
}

export function Analytics({
  mono,
  storage,
  onSelectCategory,
  showBalance = true,
}: AnalyticsProps) {
  // Use Kyiv-local year/month so "current month" tracks Europe/Kyiv day boundaries.
  const nowKyiv = getKyivDateParts();
  const [year, setYear] = useState(nowKyiv.year);
  const [month, setMonth] = useState(nowKyiv.month);

  // Fire-and-forget: record that the analytics view was opened. Intentionally
  // runs once on mount (no month dep) so re-selecting months doesn't spam.
  //
  // AI-DANGER: `markFinykAnalyticsViewed` latches the «Переглянути
  // аналітику» крок чекліста НАЗАВЖДИ, тож ставити його можна рівно
  // там, де екран справді відкрився — тобто тут. Спершу він стояв у
  // `HubHeroBlock` перед диспатчем навігації, і це було хибно: подія
  // веде в `useAppEffects`, який передає далі лише `module`, а не
  // `action`, тож Фінік відкривався на ДЕФОЛТНІЙ сторінці (огляд), і
  // `FinykApp` споживає з усіх дій саму `add_expense`. Відмітка
  // ставилась, аналітика не відкривалась — чекліст брехав знову, тільки
  // іншими дверима (знахідка рев'ю до PR #1106). Звідси ж випливає
  // побічна користь: сигнал тепер чесний для БУДЬ-ЯКОГО шляху сюди —
  // нижній нав, пряме посилання, чекліст, — а не лише для одного
  // викликача.
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.ANALYTICS_OPENED, { module: "finyk" });
    markFinykAnalyticsViewed();
  }, []);

  const {
    isCurrentMonth,
    loading,
    fetchError,
    retry: retryCurrentMonth,
    bankTx,
    allActiveTx,
    allPrevTx,
    prevLoaded,
  } = useAnalyticsMonthData({
    year,
    month,
    realTx: mono.realTx,
    fetchMonth: mono.fetchMonth,
    manualExpenses: storage.manualExpenses,
  });

  // Фільтр «За рахунками» (Р4.2) звужує всі блоки нижче, крім самого
  // розрізу і помісячного тренду (той читає всю історію з дзеркала).
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const activeTx = useMemo(
    () => filterByAccountKey(allActiveTx, accountFilter),
    [allActiveTx, accountFilter],
  );
  const prevTx = useMemo(
    () => filterByAccountKey(allPrevTx, accountFilter),
    [allPrevTx, accountFilter],
  );

  const analyticsMono = useMemo(
    () => ({ ...mono, realTx: activeTx, loadingTx: mono.loadingTx || loading }),
    [mono, activeTx, loading],
  );

  // Явні override-и + виведене правилами мерчантів: кільце категорій і дельти
  // рахуються тією самою категорією, що намальована в списку. Лише читання.
  const analyticsStorage = useMemo(
    () => ({
      ...storage,
      txCategories: withMerchantRuleOverrides(
        prevLoaded ? [...activeTx, ...prevTx] : activeTx,
        storage.txCategories ?? {},
        storage.merchantRuleIndex,
        storage.customCategories ?? [],
      ),
    }),
    [storage, activeTx, prevTx, prevLoaded],
  );

  const { summary, distribution, topMerchants } = useAnalytics({
    mono: analyticsMono,
    storage: analyticsStorage,
    prevTx: prevLoaded ? prevTx : null,
  });

  const comparison = useMemo(() => {
    if (!prevLoaded) return null;
    const c = getTrendComparison(activeTx, prevTx, {
      excludedTxIds: storage.excludedTxIds,
      txSplits: storage.txSplits,
    });
    // Обидва місяці порожні: порівнювати нема що і нема з чим. Коли записи
    // є лише в поточному, секція каже «Немає з чим порівняти» (Р4).
    if (c.prevTxCount === 0 && c.currentSpent === 0 && c.currentIncome === 0) {
      return null;
    }
    return c;
  }, [activeTx, prevTx, prevLoaded, storage.excludedTxIds, storage.txSplits]);

  const trend = useMonthlyTrend(
    { ...storage, merchantRules: storage.merchantRuleIndex },
    null,
    mono.fetchRange,
  );

  const categoryDeltas = useMemo(
    () =>
      comparison && comparison.prevTxCount > 0
        ? getCategoryDeltas(activeTx, prevTx, {
            excludedTxIds: storage.excludedTxIds,
            txSplits: storage.txSplits,
            txCategories: analyticsStorage.txCategories,
            customCategories: storage.customCategories ?? [],
          })
        : [],
    [
      comparison,
      activeTx,
      prevTx,
      storage.excludedTxIds,
      storage.txSplits,
      analyticsStorage.txCategories,
      storage.customCategories,
    ],
  );

  const savingsRate = getSavingsRate(summary.incomeMinor, summary.spentMinor);
  const plannedSavings = Number(storage.monthlyPlan?.savings) || 0;

  const pageLoading =
    (isCurrentMonth ? mono.loadingTx : loading) && allActiveTx.length === 0;

  // useCallback — передається у memo(MonthNav); стабільне посилання дозволяє
  // уникати перерендеру навігації при оновленні інших частин сторінки.
  const handleMonthChange = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-5 pt-4 page-tabbar-pad space-y-7">
        <h1 className="text-style-headline text-text">
          {messages.finykRedesign.analyticsTitle}
        </h1>
        <MonthNav year={year} month={month} onChange={handleMonthChange} />

        {fetchError && bankTx.length === 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-panel border border-danger/20 text-style-label text-danger-strong dark:text-danger">
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

        <AnalyticsSummary
          title="Підсумок місяця"
          loading={pageLoading}
          summary={summary}
          savingsRate={savingsRate}
          // План фінплану діє лише на поточний місяць: для минулих
          // місяців його тоді ще не було.
          plannedSavings={isCurrentMonth ? plannedSavings : 0}
          showBalance={showBalance}
        />

        {/* Comparison */}
        {comparison && (
          <Section
            title={
              isCurrentMonth
                ? "Порівняння з попереднім місяцем за ті ж дні"
                : "Порівняння з попереднім місяцем"
            }
          >
            {comparison.prevTxCount === 0 ? (
              <p className="text-style-label text-muted">
                Немає з чим порівняти
              </p>
            ) : (
              <div className="space-y-2">
                <ComparisonRow
                  label="Витрати"
                  current={comparison.currentSpent}
                  diff={comparison.diff}
                  pct={comparison.diffPct}
                  showBalance={showBalance}
                />
                <ComparisonRow
                  label="Дохід"
                  current={comparison.currentIncome}
                  diff={comparison.incomeDiff}
                  pct={comparison.incomeDiffPct}
                  kind="income"
                  showBalance={showBalance}
                />
              </div>
            )}
          </Section>
        )}

        {/* Categories */}
        <Section title="Категорії">
          {pageLoading ? (
            <Skeleton className="h-40 rounded-panel" />
          ) : distribution.length === 0 ? (
            <EmptyState
              compact
              title="Поки немає витрат"
              description="Цього місяця витрат ще немає. Додай першу або підключи Monobank."
            />
          ) : (
            <Suspense fallback={<ChartFallback className="h-40" />}>
              <CategoryBars
                data={distribution}
                previous={categoryDeltas}
                showBalance={showBalance}
                {...(onSelectCategory
                  ? {
                      // Несемо вибраний місяць Аналітики (month 1-based),
                      // інакше Операції відкриються на поточному (PR-F6).
                      onSelectCategory: (categoryId: string) =>
                        onSelectCategory(categoryId, { year, month }),
                    }
                  : {})}
              />
            </Suspense>
          )}
        </Section>

        {!pageLoading && (
          <Suspense fallback={null}>
            <AccountBars
              transactions={allActiveTx}
              previousTransactions={prevLoaded ? allPrevTx : null}
              excludedTxIds={storage.excludedTxIds}
              txSplits={storage.txSplits}
              accounts={mono.accounts ?? []}
              selected={accountFilter}
              onSelect={setAccountFilter}
              showBalance={showBalance}
              title={messages.finyk.cashOnHand.analyticsTitle}
            />
          </Suspense>
        )}

        {trend.points.length > 0 && (
          <Section title="Витрати за місяцями">
            <MonthlyTrendBars
              points={trend.points}
              averageMinor={trend.averageMinor}
              perDayMinor={trend.perDayMinor}
              showBalance={showBalance}
            />
          </Section>
        )}

        {categoryDeltas.length > 0 && (
          <Section
            title={
              isCurrentMonth
                ? "Категорії проти минулого місяця за ті ж дні"
                : "Категорії проти минулого місяця"
            }
          >
            <CategoryDeltaTable
              rows={categoryDeltas}
              showBalance={showBalance}
            />
          </Section>
        )}

        {/* Merchants */}
        {/* Дельти продавців рахуються з того ж `prevTx`, що й порівняння
            вище, тож у незавершеному місяці це теж «ті ж дні». */}
        <Section
          title={
            isCurrentMonth
              ? "Найбільші витрати: зміна за ті ж дні"
              : "Найбільші витрати"
          }
        >
          {pageLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 rounded-lg" />
              ))}
            </div>
          ) : topMerchants.length === 0 ? (
            <EmptyState
              compact
              title="Поки немає продавців"
              description="Витрат за цей місяць ще не записано."
            />
          ) : (
            <MerchantList
              merchants={topMerchants}
              showBalance={showBalance}
              className=""
            />
          )}
        </Section>
      </div>
    </div>
  );
}
