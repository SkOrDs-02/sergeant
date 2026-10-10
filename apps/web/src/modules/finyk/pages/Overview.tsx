import { TodayOperations } from "./overview/TodayOperations";
import { useMemo } from "react";
import { Skeleton } from "@shared/components/ui/Skeleton";
import {
  DataState,
  type DataStateQueryLike,
} from "@shared/components/ui/DataState";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import { useNavigate } from "react-router-dom";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { useStorage } from "../hooks/useStorage";
import type { useUnifiedFinanceData } from "../hooks/useUnifiedFinanceData";

import { FinykInsightsBlock } from "../components/FinykInsightsBlock";
import { HeroCard } from "./overview/HeroCard";
import { OverviewTextRows } from "./overview/OverviewTextRows";
import { NetworthSection } from "./overview/NetworthSection";
import { BudgetAlertsList } from "./overview/BudgetAlertsList";
import { useOverviewData } from "./overview/useOverviewData";
import { pluralize } from "../../../core/hub/useHubDashboardState";
import { messages } from "@shared/i18n/uk";
import { ModuleEmptyState } from "@shared/components/ui/EmptyState";
import { getOnboardingGoals } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { MonoStalenessBanner } from "./overview/MonoStalenessBanner";
import { LocalOnlyDataBanner } from "../../../core/durability/LocalOnlyDataBanner";
import { useMonoStaleness } from "./overview/useMonoStaleness";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { isSyncableUserId } from "../../../core/syncEngine/syncableUserId";

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

interface OverviewProps {
  mono: MergedMonoLike;
  storage: StorageLike;
  onNavigate?: (page: string) => void;
  /**
   * Opens account sign-in; distinct from the Finyk bank-connection
   * overlay. Required (A1, аудит 2026-09-11 хвиля 2): раніше опційність
   * тут ховала мовчазний фолбек на `/auth` — зайвий редірект-хоп замість
   * прямого SPA-переходу на `/sign-in`. Кожен рендерер `Overview`
   * (`FinykApp.tsx`) тепер зобов'язаний передати справжній обробник —
   * канонічно `useOpenSignIn()`.
   */
  onOpenAuth: () => void;
  showBalance?: boolean;
  /**
   * Відкриває Налаштування Hub на секції Фініка (`FinykWebhookServiceSection`
   * — саме там живе форма перепідключення токена). Без нього CTA staleness-
   * банера («Перевірити підключення», канон §6.3) не рендериться — раніше
   * банер тихо кликав `onNavigate("settings")`, а сегмента `settings` у
   * `finykRouter.ts` не існує, тож тап фолбечив на `overview` й нічого не
   * робив (аудит 2026-09-13, PR-F1).
   */
  onOpenSettings?: (() => void) | undefined;
}

const overviewLoadingSkeleton = (
  <div className="flex-1 overflow-y-auto">
    <div className="px-5 pt-4 page-tabbar-pad space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-[168px] rounded-xl" />
      <Skeleton className="h-[120px] opacity-80 rounded-xl" />
      <Skeleton className="h-[110px] opacity-60 rounded-xl" />
      <Skeleton className="h-[90px] opacity-40 rounded-xl" />
    </div>
  </div>
);

export function Overview({
  mono,
  storage,
  onNavigate,
  onOpenAuth,
  showBalance = true,
  onOpenSettings,
}: OverviewProps) {
  const navigate = useNavigate();
  const d = useOverviewData({ mono, storage, onNavigate });
  // Цілі з онбордингу підбирають копію порожнього стану під те, по що
  // людина прийшла. Читаються один раз — вони не змінюються за час сесії.
  const onboardingGoals = useMemo(() => getOnboardingGoals(webKVStore), []);

  // Staleness банку (канон §6.3). `webhookSyncState` приїжджає з
  // `useMonobankWebhook` крізь спред у `mergedMono`; поріг і вся логіка —
  // у доменній функції, тут лише читання.
  // `webhookActive` беремо з контракту (`MonoSyncStateSchema`), а не
  // виводимо зі зведеного `syncState.status`: той злитий із Приватом, і
  // помилка Привату гасила б staleness Monobank без жодного стосунку.
  const webhookSyncState = (
    mono as {
      webhookSyncState?: {
        lastEventAt?: string | null;
        webhookActive?: boolean;
      } | null;
    }
  ).webhookSyncState;
  const monoStaleness = useMonoStaleness({
    lastEventAt: webhookSyncState?.lastEventAt ?? null,
    webhookActive: webhookSyncState?.webhookActive ?? false,
  });

  const localUserId = useLocalUserId();
  const isSynced = localUserId !== null && isSyncableUserId(localUserId);

  // Над Оглядом щонайбільше один системний сигнал: «дані можуть зникнути
  // назавжди» важливіше за «банк мовчить».
  const showLocalOnlyBanner = localUserId !== null && !isSynced;
  const showStalenessBanner =
    !showLocalOnlyBanner && monoStaleness.stale && monoStaleness.days !== null;

  const overviewQuery: DataStateQueryLike<readonly Transaction[]> = {
    data: d.loadingTx && d.realTx.length === 0 ? undefined : d.realTx,
    isLoading: d.loadingTx,
  };

  return (
    <>
      {/* `<h1>` СТОЇТЬ ПОЗА `DataState` навмисно. Доки він жив усередині
          `children`, сторінка мала заголовок лише в одному стані з
          чотирьох: `DEFAULT_EMPTY` рахує `[]` порожнім, тож у скелетоні,
          порожньому стані й помилці h1 не рендерився взагалі — а це рівно
          те, що бачить новий користувач без жодної операції. axe
          `page-has-heading-one` на `/finyk`, замір браузерного свіпу
          2026-09-16.

          Видимий, а не `sr-only` (рішення власника 2026-09-17). Стиль —
          `text-style-title text-text`, єдиний у репо зразок видимого
          сторінкового заголовка (`fizruk/pages/Programs.tsx`,
          `fizruk/components/workouts/WorkoutsHeader.tsx`).

          Назва модуля в шапці при цьому лишається `<p>` (#527) — цей h1
          її не дублює: шапка каже «Фінік», заголовок — «Огляд».

          Відступи: власний `pt-4` тут і `pt-4` у контейнерах нижче дають
          16px між заголовком і першою карткою — однаково для скелетона й
          для завантаженого стану, бо обидва лежать під цим блоком.
          `shrink-0`, щоб flex-колонка не стискала рядок. */}
      <div className="shrink-0 w-full max-w-4xl mx-auto px-5 pt-4">
        <h1 className="text-style-title text-text">
          {messages.nav.finykOverview}
        </h1>
      </div>
      <DataState
        query={overviewQuery}
        skeleton={overviewLoadingSkeleton}
        className="flex-1 flex flex-col min-h-0"
      >
        {() => (
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 pt-4 page-tabbar-pad space-y-4 max-w-4xl mx-auto">
              {(d.clientInfo ||
                d.syncState?.status === "error" ||
                d.syncState?.status === "loading" ||
                d.monoError) && (
                <SyncStatusBadge
                  syncState={d.syncState}
                  lastUpdated={d.lastUpdated}
                  error={d.monoError}
                  onRetry={d.monoRefresh}
                  loading={d.loadingTx}
                />
              )}

              {/* Канон §6.2 — durability. Банер сам вирішує, чи показуватись:
                лише коли поточний id несинхронізований (той самий предикат,
                що вимикає запис у outbox). Ставимо ВИЩЕ staleness-банера:
                «твої дані можуть зникнути назавжди» важливіше за «дані
                банку не оновлювались N днів». */}
              <LocalOnlyDataBanner onSignIn={onOpenAuth} />

              {showStalenessBanner && monoStaleness.days !== null && (
                <MonoStalenessBanner
                  days={monoStaleness.days}
                  onReconnect={onOpenSettings}
                />
              )}

              {!d.hasAnyData ? (
                // Рішення founder-а 2026-07-25: перший вхід у finyk — порожній
                // екран із ненавʼязливими підказками. До цього новачок бачив
                // стіну карток по ₴0 (нетворт, пульс місяця, алерти бюджетів,
                // планові потоки) — усі порожні, всі однаково безмовні.
                // Інлайн-CTA тут свідомо НЕМА: глобальний FAB «+ Додати
                // витрату» вже висить на цьому екрані, а дублювати його
                // всередині empty-state — антипатерн із docs/design/
                // empty-states.md (той самий коментар у TransactionList).
                <ModuleEmptyState
                  module="finyk"
                  goalContext={onboardingGoals}
                />
              ) : (
                <>
                  <HeroCard
                    networth={d.networth}
                    monoTotal={d.monoTotal}
                    totalDebt={d.totalDebt}
                    daysInMonth={d.daysInMonth}
                    daysPassed={d.daysPassed}
                    dayBudget={d.dayBudget}
                    todayRemaining={d.todayRemaining}
                    todaySpent={d.todaySpent}
                    dailySpend={d.dailySpend}
                    todayKey={d.todayKey}
                    spent={d.spent}
                    planExpense={d.planExpense}
                    hasExpensePlan={d.hasExpensePlan}
                    spendPlanRatio={d.spendPlanRatio}
                    showBalance={showBalance}
                    onSetPlan={
                      onNavigate ? () => onNavigate("budgets") : undefined
                    }
                    onOpenDay={(dayKey) =>
                      navigate(`/finyk/transactions?date=${dayKey}`)
                    }
                  />

                  <TodayOperations
                    transactions={d.todayTransactions}
                    showBalance={showBalance}
                    onOpenToday={() =>
                      navigate("/finyk/transactions?date=today")
                    }
                  />

                  <OverviewTextRows
                    income={d.income}
                    showMonthForecast={d.showMonthForecast && showBalance}
                    projectedSpend={d.projectedSpend}
                    projectedSpendCapped={d.projectedSpendCapped}
                    hasExpensePlan={d.hasExpensePlan}
                    recurringOutThisMonth={d.recurringOutThisMonth}
                    recurringInThisMonth={d.recurringInThisMonth}
                    unknownOutCount={d.unknownOutCount}
                    showBalance={showBalance}
                  />

                  <FinykInsightsBlock
                    transactions={d.insightTx}
                    recurringTransactions={d.recurringTx}
                    budgets={storage.budgets}
                    subscriptions={storage.subscriptions}
                    dismissedRecurring={storage.dismissedRecurring}
                    txCategories={d.txCategories}
                    txSplits={d.txSplits}
                    customCategories={d.customCategories}
                    excludedTxIds={storage.excludedTxIds}
                  />

                  <NetworthSection networthHistory={d.networthHistory} />

                  {d.nonUahManualAssetCount > 0 && (
                    <div className="rounded-xl px-4 py-3 border bg-panel border-warning/20">
                      <span className="text-style-caption text-warning-strong dark:text-warning">
                        {d.nonUahManualAssetCount}{" "}
                        {pluralize(
                          d.nonUahManualAssetCount,
                          messages.finyk.nonUahAssetsExcluded.one,
                          messages.finyk.nonUahAssetsExcluded.few,
                          messages.finyk.nonUahAssetsExcluded.many,
                        )}
                      </span>
                    </div>
                  )}

                  <BudgetAlertsList
                    budgetAlerts={d.budgetAlerts}
                    customCategories={d.customCategories}
                    onOpenLimit={(categoryId) =>
                      navigate(
                        `/finyk/budgets?cat=${encodeURIComponent(categoryId)}`,
                      )
                    }
                  />
                </>
              )}

              {d.loadingTx && (
                <p className="text-center text-style-caption text-subtle py-4">
                  {messages.status.updating}
                </p>
              )}
            </div>
          </div>
        )}
      </DataState>
    </>
  );
}
