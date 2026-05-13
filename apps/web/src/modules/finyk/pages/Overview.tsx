import { Skeleton } from "@shared/components/ui/Skeleton";
import {
  DataState,
  type DataStateQueryLike,
} from "@shared/components/ui/DataState";
import { SyncStatusBadge } from "../components/SyncStatusBadge";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { useStorage } from "../hooks/useStorage";
import type { useUnifiedFinanceData } from "../hooks/useUnifiedFinanceData";

import { FirstInsightBanner } from "./overview/FirstInsightBanner";
import { HeroCard } from "./overview/HeroCard";
import { MonthPulseCard } from "./overview/MonthPulseCard";
import { NetworthSection } from "./overview/NetworthSection";
import { BudgetAlertsList } from "./overview/BudgetAlertsList";
import { PlannedFlowsCard } from "./overview/PlannedFlowsCard";
import { useOverviewData } from "./overview/useOverviewData";
import { messages } from "@shared/i18n/uk";

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

interface OverviewProps {
  mono: MergedMonoLike;
  storage: StorageLike;
  onNavigate?: (page: string) => void;
  showBalance?: boolean;
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
}: OverviewProps) {
  const d = useOverviewData({ mono, storage, onNavigate });

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

            {d.showFirstInsight && d.hasAnyData && (
              <FirstInsightBanner
                onSetBudget={d.handleSetBudgetFromInsight}
                onDismiss={d.dismissFirstInsight}
              />
            )}

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
              forecastTrendPct={d.forecastTrendPct}
              forecastBarClass={d.forecastBarClass}
              recurringOutThisMonth={d.recurringOutThisMonth}
              recurringInThisMonth={d.recurringInThisMonth}
              unknownOutCount={d.unknownOutCount}
            />

            <NetworthSection networthHistory={d.networthHistory} />

            <BudgetAlertsList
              budgetAlerts={d.budgetAlerts}
              statTx={d.statTx}
              txCategories={d.txCategories}
              txSplits={d.txSplits}
              customCategories={d.customCategories}
            />

            <PlannedFlowsCard
              plannedFlows={d.plannedFlows}
              onNavigate={onNavigate ?? (() => {})}
              showBalance={showBalance}
            />

            {d.loadingTx && (
              <p className="text-center text-xs text-subtle py-4">
                {messages.status.updating}
              </p>
            )}
          </div>
        </div>
      )}
    </DataState>
  );
}
