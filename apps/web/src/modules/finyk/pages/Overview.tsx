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

import { FirstInsightBanner } from "./overview/FirstInsightBanner";
import { FinykInsightsBlock } from "../components/FinykInsightsBlock";
import { HeroCard } from "./overview/HeroCard";
import { TodaySummaryCard } from "./overview/TodaySummaryCard";
import { MonthPulseCard } from "./overview/MonthPulseCard";
import { NetworthSection } from "./overview/NetworthSection";
import { BudgetAlertsList } from "./overview/BudgetAlertsList";
import { PlannedFlowsCard } from "./overview/PlannedFlowsCard";
import { useOverviewData } from "./overview/useOverviewData";
import { pluralize } from "../../../core/hub/useHubDashboardState";
import { messages } from "@shared/i18n/uk";
import { ModuleEmptyState } from "@shared/components/ui/EmptyState";
import { getOnboardingGoals } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { MonoStalenessBanner } from "./overview/MonoStalenessBanner";
import { LocalOnlyDataBanner } from "../../../core/durability/LocalOnlyDataBanner";
import { useMonoStaleness } from "./overview/useMonoStaleness";
import { ImportReminderBanner } from "./overview/ImportReminderBanner";
import { useImportReminder } from "./overview/useImportReminder";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { isSyncableUserId } from "../../../core/syncEngine/syncableUserId";
import { useFlag } from "../../../core/lib/featureFlags";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

interface OverviewProps {
  mono: MergedMonoLike;
  storage: StorageLike;
  onNavigate?: (page: string) => void;
  showBalance?: boolean;
  /** Відкриває аркуш масового імпорту — той самий, що дія FAB. */
  onOpenBulkImport?: (() => void) | undefined;
}

const overviewLoadingSkeleton = (
  <div className="flex-1 overflow-y-auto">
    <div className="px-4 pt-4 page-tabbar-pad space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-[168px] rounded-3xl" />
      <Skeleton className="h-[120px] opacity-80 rounded-2xl" />
      <Skeleton className="h-[110px] opacity-60 rounded-2xl" />
      <Skeleton className="h-[90px] opacity-40 rounded-2xl" />
    </div>
  </div>
);

export function Overview({
  mono,
  storage,
  onNavigate,
  showBalance = true,
  onOpenBulkImport,
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

  // Плашка «залий документи» (спека finyk-import-reminders.md). Той самий
  // предикат, яким `LocalOnlyDataBanner` вирішує показ, служить тут двом
  // цілям: у незасинхронізованого користувача немає серверної історії
  // імпортів (питати нема про що), і саме його банер має пріоритет над
  // цією плашкою.
  const localUserId = useLocalUserId();
  const isSynced = localUserId !== null && isSyncableUserId(localUserId);
  const importRemindersEnabled = useFlag("finyk_import_reminder");
  const importReminder = useImportReminder({
    enabled: isSynced && importRemindersEnabled,
  });

  // Бюджет плашок угорі Огляду — рівно одна. Порядок за незворотністю
  // втрати: «дані можуть зникнути назавжди» > «банк мовчить» > «картина
  // неповна» > FTUX-підказка. Четверта плашка перетворила б верх сторінки
  // на стіну попереджень, де не читають жодної.
  const showLocalOnlyBanner = localUserId !== null && !isSynced;
  const showStalenessBanner =
    !showLocalOnlyBanner && monoStaleness.stale && monoStaleness.days !== null;
  const showImportReminder =
    !showLocalOnlyBanner &&
    !showStalenessBanner &&
    importReminder.reminder !== null &&
    onOpenBulkImport !== undefined;

  const overviewQuery: DataStateQueryLike<readonly Transaction[]> = {
    data: d.loadingTx && d.realTx.length === 0 ? undefined : d.realTx,
    isLoading: d.loadingTx,
  };

  return (
    <DataState
      query={overviewQuery}
      skeleton={overviewLoadingSkeleton}
      className="flex-1 flex flex-col min-h-0"
    >
      {() => (
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 pt-4 page-tabbar-pad space-y-4 max-w-4xl mx-auto">
            <h1 className="sr-only">{messages.nav.finykOverview}</h1>
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
            <LocalOnlyDataBanner onSignIn={() => onNavigate?.("settings")} />

            {showStalenessBanner && monoStaleness.days !== null && (
              <MonoStalenessBanner
                days={monoStaleness.days}
                onReconnect={
                  onNavigate ? () => onNavigate("settings") : undefined
                }
              />
            )}

            {showImportReminder && importReminder.reminder && (
              <ImportReminderBanner
                source={importReminder.reminder.source}
                daysSince={importReminder.reminder.daysSince}
                expectedIntervalDays={
                  importReminder.reminder.expectedIntervalDays
                }
                onAddDocuments={() => {
                  trackEvent(ANALYTICS_EVENTS.FINYK_IMPORT_REMINDER_CLICKED, {
                    source: importReminder.reminder?.source,
                    daysSince: importReminder.reminder?.daysSince,
                  });
                  onOpenBulkImport?.();
                }}
                onSnooze={importReminder.snooze}
                onMute={importReminder.mute}
              />
            )}

            {d.showFirstInsight && d.hasAnyData && (
              <FirstInsightBanner
                onSetBudget={d.handleSetBudgetFromInsight}
                onDismiss={d.dismissFirstInsight}
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
              <ModuleEmptyState module="finyk" goalContext={onboardingGoals} />
            ) : (
              <>
                <HeroCard
                  networth={d.networth}
                  monoTotal={d.monoTotal}
                  totalDebt={d.totalDebt}
                  daysInMonth={d.daysInMonth}
                  daysPassed={d.daysPassed}
                  dayBudget={d.dayBudget}
                  hasExpensePlan={d.hasExpensePlan}
                  spendPlanRatio={d.spendPlanRatio}
                  showBalance={showBalance}
                  onSetPlan={
                    onNavigate ? () => onNavigate("budgets") : undefined
                  }
                />

                <TodaySummaryCard
                  spent={d.todaySpent}
                  income={d.todayIncome}
                  dailyPlan={d.dailyPlan}
                  showBalance={showBalance}
                  onOpen={() => navigate("/finyk/transactions?date=today")}
                />

                <FinykInsightsBlock
                  transactions={d.insightTx}
                  budgets={storage.budgets}
                  subscriptions={storage.subscriptions}
                  dismissedRecurring={storage.dismissedRecurring}
                  txCategories={d.txCategories}
                  txSplits={d.txSplits}
                  customCategories={d.customCategories}
                  excludedTxIds={storage.excludedTxIds}
                />

                <MonthPulseCard
                  dateLabel={d.dateLabel}
                  daysPassed={d.daysPassed}
                  spent={d.spent}
                  income={d.income}
                  showBalance={showBalance}
                  showMonthForecast={d.showMonthForecast && showBalance}
                  projectedSpend={d.projectedSpend}
                  hasExpensePlan={d.hasExpensePlan}
                  spendPlanRatio={d.spendPlanRatio}
                  planExpense={d.planExpense}
                  recurringOutThisMonth={d.recurringOutThisMonth}
                  recurringInThisMonth={d.recurringInThisMonth}
                  unknownOutCount={d.unknownOutCount}
                />

                <NetworthSection networthHistory={d.networthHistory} />

                {d.nonUahManualAssetCount > 0 && (
                  <div className="rounded-2xl px-4 py-3 border bg-warning/8 border-warning/20">
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
                  statTx={d.statTx}
                  txCategories={d.txCategories}
                  txSplits={d.txSplits}
                  customCategories={d.customCategories}
                  onOpenLimit={(categoryId) =>
                    navigate(
                      `/finyk/budgets?cat=${encodeURIComponent(categoryId)}`,
                    )
                  }
                />

                <PlannedFlowsCard
                  plannedFlows={d.plannedFlows}
                  onNavigate={onNavigate ?? (() => {})}
                  showBalance={showBalance}
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
  );
}
