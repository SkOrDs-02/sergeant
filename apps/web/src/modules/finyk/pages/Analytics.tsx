import { messages } from "@shared/i18n";
import { useState, useEffect, useMemo, Suspense } from "react";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { useAnalytics } from "../hooks/useAnalytics";
import { useAnalyticsPeriodData } from "../hooks/useAnalyticsPeriodData";
import { formatHistoryStart } from "../lib/analyticsPeriodLabel";
import {
  periodOf,
  type AnalyticsPeriod,
} from "@sergeant/finyk-domain/domain/analyticsPeriod";
import { AccountBars, CategoryBars, TagBars } from "../components/charts/lazy";
import { filterByAccountKey } from "@sergeant/finyk-domain/domain/accountBreakdown";
import {
  filterByTagKey,
  type TxTagsMap,
} from "@sergeant/finyk-domain/domain/tags";
import { ChartFallback } from "../components/charts/ChartFallback";
import { AnalyticsSection as Section } from "../components/analytics/AnalyticsSection";
import { AnalyticsSummary } from "../components/analytics/AnalyticsSummary";
import { ComparisonRow } from "../components/analytics/ComparisonRow";
import { AnalyticsPeriodNav } from "../components/analytics/PeriodNav";
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
    /** Теги операцій для блоку «За тегами» і фільтра (Р6.4). */
    txTags?: TxTagsMap;
  };
  /**
   * Дрил-даун із кільця категорій у список операцій. Саме він робить
   * Аналітику не глухим кутом: доти вона казала «скільки», але дійти від
   * числа до самих операцій було ніяк.
   */
  onSelectCategory?: (categoryId: string, period: AnalyticsPeriod) => void;
  /**
   * «Приховати суми» (PR-F3 founder-UX audit 2026-09-13): доти сторінка
   * не приймала цей проп узагалі, тож перемикач з Огляду не діяв тут —
   * маскує підсумок місяця, порівняння, кільце категорій і топ продавців.
   */
  showBalance?: boolean;
}

const NO_TAGS: TxTagsMap = {};

export function Analytics({
  mono,
  storage,
  onSelectCategory,
  showBalance = true,
}: AnalyticsProps) {
  // Київський день: «поточний період» живе за межами доби Europe/Kyiv.
  const todayKey = getKyivDayKey();
  const [period, setPeriod] = useState<AnalyticsPeriod>(() =>
    periodOf("month", todayKey),
  );
  const copy = messages.finyk.analyticsPage;

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
    isCurrent,
    comparison: comparisonWindow,
    loading,
    fetchError,
    retry: retryCurrentMonth,
    bankTx,
    allActiveTx,
    allPrevTx,
    prevLoaded,
    periodLoaded,
    historyStartKey,
    neededMonths,
    pendingMonths,
  } = useAnalyticsPeriodData({
    period,
    todayKey,
    realTx: mono.realTx,
    fetchMonth: mono.fetchMonth,
    manualExpenses: storage.manualExpenses,
  });

  // Фільтр «За рахунками» (Р4.2) звужує всі блоки нижче, крім самого
  // розрізу і помісячного тренду (той читає всю історію з дзеркала).
  // Фільтр тегу (Р6.4) діє поверх рахунку.
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const txTags = storage.txTags ?? NO_TAGS;
  const accountTx = useMemo(
    () => filterByAccountKey(allActiveTx, accountFilter),
    [allActiveTx, accountFilter],
  );
  const accountPrevTx = useMemo(
    () => filterByAccountKey(allPrevTx, accountFilter),
    [allPrevTx, accountFilter],
  );
  // Кожен блок-фільтр бачить решту фільтрів, але не власний: інакше в ньому
  // лишився б один рядок і зняти чи змінити вибір було б нічим.
  const tagOnlyTx = useMemo(
    () => filterByTagKey(allActiveTx, txTags, tagFilter),
    [allActiveTx, txTags, tagFilter],
  );
  const tagOnlyPrevTx = useMemo(
    () => filterByTagKey(allPrevTx, txTags, tagFilter),
    [allPrevTx, txTags, tagFilter],
  );
  const activeTx = useMemo(
    () => filterByTagKey(accountTx, txTags, tagFilter),
    [accountTx, txTags, tagFilter],
  );
  const prevTx = useMemo(
    () => filterByTagKey(accountPrevTx, txTags, tagFilter),
    [accountPrevTx, txTags, tagFilter],
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

  // Р5.5: база порівняння мусить бути повною. Коли найраніший відомий
  // запис пізніший за початок вікна порівняння, база обрізана, і замість
  // відсотків секція чесно каже, з якої дати є дані.
  const historyGap =
    comparison && historyStartKey && historyStartKey > comparisonWindow.fromKey
      ? historyStartKey
      : null;
  const canCompare = Boolean(
    comparison && comparison.prevTxCount > 0 && !historyGap,
  );

  const { summary, distribution, topMerchants } = useAnalytics({
    mono: analyticsMono,
    storage: analyticsStorage,
    prevTx: canCompare ? prevTx : null,
  });

  const trend = useMonthlyTrend(
    { ...storage, merchantRules: storage.merchantRuleIndex },
    null,
    mono.fetchRange,
  );

  const categoryDeltas = useMemo(
    () =>
      canCompare
        ? getCategoryDeltas(activeTx, prevTx, {
            excludedTxIds: storage.excludedTxIds,
            txSplits: storage.txSplits,
            txCategories: analyticsStorage.txCategories,
            customCategories: storage.customCategories ?? [],
          })
        : [],
    [
      canCompare,
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
    allActiveTx.length === 0 &&
    ((isCurrent && mono.loadingTx) || (!periodLoaded && !fetchError));
  const sameDays = comparisonWindow.partial;
  const withSameDays = (title: string) =>
    sameDays ? `${title} ${copy.sameDays}` : title;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-5 pt-4 page-tabbar-pad space-y-7">
        <h1 className="text-style-headline text-text">
          {messages.finykRedesign.analyticsTitle}
        </h1>
        <AnalyticsPeriodNav
          period={period}
          todayKey={todayKey}
          onChange={setPeriod}
        />
        {/* Рік тягне до 25 місяців: прогрес замість мовчазно неповних сум. */}
        {pendingMonths > 0 && neededMonths > 3 && (
          <p role="status" className="text-style-caption text-muted">
            {copy.historyLoading
              .replace("{done}", String(neededMonths - pendingMonths))
              .replace("{total}", String(neededMonths))}
          </p>
        )}

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
          title={copy.summaryTitle[period.kind]}
          loading={pageLoading}
          summary={summary}
          savingsRate={savingsRate}
          // План фінплану місячний і діє лише на поточний місяць: для
          // минулих місяців його тоді ще не було.
          plannedSavings={
            period.kind === "month" && isCurrent ? plannedSavings : 0
          }
          showBalance={showBalance}
        />

        {/* Comparison */}
        {comparison && (
          <Section title={withSameDays(copy.comparisonTitle[period.kind])}>
            {!canCompare ? (
              <p className="text-style-label text-muted">
                {historyGap
                  ? copy.noComparisonSince.replace(
                      "{date}",
                      formatHistoryStart(historyGap),
                    )
                  : copy.noComparison}
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
              description={
                period.kind === "month"
                  ? "Цього місяця витрат ще немає. Додай першу або підключи Monobank."
                  : copy.emptyPeriod
              }
            />
          ) : (
            <Suspense fallback={<ChartFallback className="h-40" />}>
              <CategoryBars
                data={distribution}
                previous={categoryDeltas}
                showBalance={showBalance}
                categorySwatches
                {...(onSelectCategory
                  ? {
                      // Несемо обраний період Аналітики, інакше Операції
                      // відкриються на поточному місяці (PR-F6, Р5.6).
                      onSelectCategory: (categoryId: string) =>
                        onSelectCategory(categoryId, period),
                    }
                  : {})}
              />
            </Suspense>
          )}
        </Section>

        {!pageLoading && (
          <Suspense fallback={null}>
            <AccountBars
              transactions={tagOnlyTx}
              previousTransactions={
                prevLoaded && !historyGap ? tagOnlyPrevTx : null
              }
              excludedTxIds={storage.excludedTxIds}
              txSplits={storage.txSplits}
              accounts={mono.accounts ?? []}
              selected={accountFilter}
              onSelect={setAccountFilter}
              showBalance={showBalance}
              title={messages.finyk.cashOnHand.analyticsTitle}
            />
            <TagBars
              transactions={accountTx}
              previousTransactions={
                prevLoaded && !historyGap ? accountPrevTx : null
              }
              txTags={txTags}
              excludedTxIds={storage.excludedTxIds}
              txSplits={storage.txSplits}
              selected={tagFilter}
              onSelect={setTagFilter}
              showBalance={showBalance}
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
          <Section title={withSameDays(copy.categoryDeltasTitle[period.kind])}>
            <CategoryDeltaTable
              rows={categoryDeltas}
              showBalance={showBalance}
            />
          </Section>
        )}

        {/* Merchants */}
        {/* Дельти продавців рахуються з того ж `prevTx`, що й порівняння
            вище, тож у незавершеному періоді це теж «ті ж дні». */}
        <Section
          title={
            sameDays
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
              description={
                period.kind === "month"
                  ? "Витрат за цей місяць ще не записано."
                  : copy.emptyPeriodMerchants
              }
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
