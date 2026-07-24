/**
 * Overview — Finyk dashboard index screen (mobile port).
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/Overview.tsx`. All
 * business logic lives in `@sergeant/finyk-domain` (pure selectors) +
 * local presentational cards — the screen is a thin orchestrator that:
 *
 *  1. Pulls a normalised view model from {@link useFinykOverviewData}.
 *  2. Runs the same selectors the web page uses (`getMonthlySummary`,
 *     `getCategorySpendList`, `buildPlannedFlows`, `computePulseStyle`,
 *     `aggregateMonthFlows`, …). The two apps share these helpers so
 *     numbers match between web and mobile.
 *  3. Renders each card from `./` using NativeWind + design tokens.
 *
 * The hook is currently a stub (`useFinykOverviewData`), so the screen
 * renders the empty-data branch until a follow-up PR wires MMKV + mono.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  calcCategorySpent,
  calcDebtRemaining,
  calcFinykSpendingTotal,
  calcReceivableRemaining,
  getMonoTotals,
} from "@sergeant/finyk-domain";
import {
  aggregateMonthFlows,
  buildDebtOutFlows,
  buildPlannedFlows,
  buildReceivableInFlows,
  buildSubscriptionFlows,
  deriveFirstName,
  getCategorySpendList,
  getCurrentMonthContext,
  getLimitBudgets,
  getMonthlySummary,
  isBudgetAlert,
  filterStatTransactions,
} from "@sergeant/finyk-domain/domain";

import { FinykNavGrid } from "../../components/FinykNavGrid";
import { BudgetAlertsList } from "./BudgetAlertsList";
import { CategoryChartSection } from "./CategoryChartSection";
import { FirstInsightBanner } from "./FirstInsightBanner";
import { HeroCard } from "./HeroCard";
import { MonthPulseCard } from "./MonthPulseCard";
import { NetworthSection } from "./NetworthSection";
import { PlanFactCard } from "./PlanFactCard";
import { PlannedFlowsCard } from "./PlannedFlowsCard";
import { useFinykOverviewData } from "./useFinykOverviewData";
import type { FinykOverviewData } from "./types";

export type OverviewNavRoute =
  | "transactions"
  | "budgets"
  | "subscriptions"
  | "analytics"
  | "assets";

export interface OverviewProps {
  /**
   * Optional dependency-injected data override — handy for jest tests
   * (snapshot / behavior) and for storybook fixtures. Production code
   * should leave this unset so `useFinykOverviewData()` runs.
   */
  data?: FinykOverviewData;
  onNavigate?: (route: OverviewNavRoute) => void;
  onCategoryClick?: (catId: string) => void;
  /** `Date.now()` seam for deterministic jest tests. */
  now?: Date;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

export function Overview({
  data: injected,
  onNavigate,
  onCategoryClick,
  now: nowOverride,
}: OverviewProps) {
  const hookData = useFinykOverviewData();
  const data = injected ?? hookData;
  const {
    realTx,
    loadingTx,
    clientInfo,
    accounts,
    transactions,
    privatTotal,
    budgets,
    subscriptions,
    manualDebts,
    receivables,
    hiddenAccounts,
    excludedTxIds,
    monthlyPlan,
    networthHistory,
    txCategories,
    txSplits,
    manualAssets,
    customCategories,
    manualExpenses,
    showBalance,
  } = data;

  // Pin `now` per render — all time-sensitive selectors receive the
  // same instant so the card set stays internally consistent.
  const now = useMemo(() => nowOverride ?? new Date(), [nowOverride]);
  const { daysInMonth, daysPassed } = getCurrentMonthContext(now);

  const statTx = useMemo(
    () => filterStatTransactions(realTx, excludedTxIds),
    [realTx, excludedTxIds],
  );
  const spent = useMemo(
    () => calcFinykSpendingTotal(statTx, { txSplits }),
    [statTx, txSplits],
  );
  const monthlySummary = useMemo(
    () => getMonthlySummary(realTx, { excludedTxIds, txSplits }),
    [realTx, excludedTxIds, txSplits],
  );
  const income = monthlySummary.income;
  const projectedSpend =
    daysPassed > 0 ? (spent / daysPassed) * daysInMonth : 0;

  const { balance: monoOnlyTotal, debt: monoTotalDebt } = useMemo(
    () => getMonoTotals(accounts, hiddenAccounts),
    [accounts, hiddenAccounts],
  );
  const monoTotal = monoOnlyTotal + privatTotal;
  const manualDebtTotal = useMemo(
    () =>
      manualDebts.reduce((s, d) => s + calcDebtRemaining(d, transactions), 0),
    [manualDebts, transactions],
  );
  const totalDebt = monoTotalDebt + manualDebtTotal;
  const totalReceivable = useMemo(
    () =>
      receivables.reduce(
        (s, r) => s + calcReceivableRemaining(r, transactions),
        0,
      ),
    [receivables, transactions],
  );
  const manualAssetTotal = useMemo(
    () =>
      (manualAssets || [])
        .filter((a) => a.currency === "UAH")
        .reduce((s, a) => s + Number(a.amount), 0),
    [manualAssets],
  );
  const networth = monoTotal + manualAssetTotal + totalReceivable - totalDebt;

  const limitBudgets = useMemo(() => getLimitBudgets(budgets), [budgets]);
  const catSpends = useMemo(
    () =>
      getCategorySpendList(statTx, {
        txCategories,
        txSplits,
        customCategories,
      }),
    [statTx, txCategories, txSplits, customCategories],
  );

  const budgetAlerts = useMemo(
    () =>
      limitBudgets.filter((b) =>
        isBudgetAlert(
          calcCategorySpent(
            statTx,
            b.categoryId,
            txCategories,
            txSplits,
            customCategories,
          ),
          b.limit,
        ),
      ),
    [limitBudgets, statTx, txCategories, txSplits, customCategories],
  );

  // Planned flows — subscriptions + debts + receivables, pre-aggregated
  // in the domain package so web and mobile share identical math.
  const subscriptionFlows = useMemo(
    () => buildSubscriptionFlows(subscriptions, transactions, now),
    [subscriptions, transactions, now],
  );
  const debtOutFlows = useMemo(
    () => buildDebtOutFlows(manualDebts, transactions, now),
    [manualDebts, transactions, now],
  );
  const debtInFlows = useMemo(
    () => buildReceivableInFlows(receivables, transactions, now),
    [receivables, transactions, now],
  );
  const plannedFlows = useMemo(
    () =>
      buildPlannedFlows([subscriptionFlows, debtOutFlows, debtInFlows], {
        windowDays: 10,
      }),
    [subscriptionFlows, debtOutFlows, debtInFlows],
  );
  const { recurringOutThisMonth, recurringInThisMonth, unknownOutCount } =
    useMemo(
      () =>
        aggregateMonthFlows(
          [...subscriptionFlows, ...debtOutFlows, ...debtInFlows],
          now,
        ),
      [subscriptionFlows, debtOutFlows, debtInFlows, now],
    );

  // --- First-insight banner ------------------------------------------
  const hasAnyData = manualExpenses.length > 0 || realTx.length > 0;
  const [showFirstInsight, setShowFirstInsight] = useState(true);
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    if (!showFirstInsight || !hasAnyData) return;
    firedRef.current = true;
  }, [showFirstInsight, hasAnyData]);
  const dismissFirstInsight = useCallback(() => setShowFirstInsight(false), []);
  const handleSetBudgetFromInsight = useCallback(() => {
    dismissFirstInsight();
    onNavigate?.("budgets");
  }, [dismissFirstInsight, onNavigate]);

  // --- Derived display values ----------------------------------------
  const planIncome = Number(monthlyPlan?.income || 0);
  const planExpense = Number(monthlyPlan?.expense || 0);
  const planSavings = Number(monthlyPlan?.savings || 0);
  const factSavings = income - spent;
  const remainingDays = Math.max(1, daysInMonth - daysPassed + 1);
  const expenseTarget = planExpense > 0 ? planExpense : projectedSpend;
  const expenseLeft =
    expenseTarget - spent - recurringOutThisMonth + recurringInThisMonth;
  const dayBudget = expenseLeft / remainingDays;

  const monthBalance = income - spent;
  const spendPct = Math.min(100, income > 0 ? (spent / income) * 100 : 0);
  const expenseFromIncomeBarClass =
    spendPct > 75
      ? "bg-rose-500"
      : spendPct > 50
        ? "bg-amber-500"
        : "bg-emerald-500";
  const showMonthForecast = showBalance && daysPassed > 0 && projectedSpend > 0;
  const forecastTrendPct = showMonthForecast
    ? Math.min(100, Math.round((spent / projectedSpend) * 100))
    : 0;
  const forecastBarClass =
    forecastTrendPct > 75
      ? "bg-rose-500"
      : forecastTrendPct > 50
        ? "bg-amber-500"
        : "bg-emerald-500";

  const spendPlanRatio = expenseTarget > 0 ? spent / expenseTarget : 0;
  const hasExpensePlan = expenseTarget > 0;

  const firstName = deriveFirstName(clientInfo?.name);
  const dateLabel = formatDateLabel(now);

  const handleOverviewNavigate = useCallback(
    (route: OverviewNavRoute) => {
      onNavigate?.(route);
    },
    [onNavigate],
  );

  // --- Loading skeleton ----------------------------------------------
  if (loadingTx && realTx.length === 0) {
    return (
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-24 gap-4"
        testID="finyk-overview-loading"
      >
        <View className="h-[168px] rounded-3xl bg-cream-100" />
        <View className="h-[120px] rounded-2xl bg-cream-100 opacity-80" />
        <View className="h-[110px] rounded-2xl bg-cream-100 opacity-60" />
        <View className="h-[90px] rounded-2xl bg-cream-100 opacity-40" />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-4 pt-4 pb-24 gap-4"
      testID="finyk-overview-scroll"
    >
      {showFirstInsight && hasAnyData && (
        <FirstInsightBanner
          onSetBudget={handleSetBudgetFromInsight}
          onDismiss={dismissFirstInsight}
        />
      )}

      <HeroCard
        networth={networth}
        monoTotal={monoTotal}
        totalDebt={totalDebt}
        monthBalance={monthBalance}
        firstName={firstName}
        dateLabel={dateLabel}
        showBalance={showBalance}
      />

      <Text className="text-xs text-fg-muted px-1 -mt-1">
        Огляд, категорії та бюджети на цій сторінці — у гривні (UAH). Інші
        валюти рахунків у загальному балансі не конвертуються автоматично.
      </Text>

      <FinykNavGrid />

      <MonthPulseCard
        dateLabel={dateLabel}
        daysInMonth={daysInMonth}
        daysPassed={daysPassed}
        spent={spent}
        income={income}
        showBalance={showBalance}
        showMonthForecast={showMonthForecast}
        projectedSpend={projectedSpend}
        spendPct={spendPct}
        expenseFromIncomeBarClass={expenseFromIncomeBarClass}
        forecastTrendPct={forecastTrendPct}
        forecastBarClass={forecastBarClass}
        dayBudget={dayBudget}
        monthBalance={monthBalance}
        spendPlanRatio={spendPlanRatio}
        hasExpensePlan={hasExpensePlan}
        recurringOutThisMonth={recurringOutThisMonth}
        recurringInThisMonth={recurringInThisMonth}
        unknownOutCount={unknownOutCount}
      />

      <NetworthSection networthHistory={networthHistory} />

      <BudgetAlertsList
        budgetAlerts={budgetAlerts}
        statTx={statTx}
        txCategories={txCategories}
        txSplits={txSplits}
        customCategories={customCategories}
      />

      <PlanFactCard
        planIncome={planIncome}
        planExpense={planExpense}
        planSavings={planSavings}
        income={income}
        spent={spent}
        factSavings={factSavings}
        onNavigate={() => handleOverviewNavigate("budgets")}
      />

      <PlannedFlowsCard
        plannedFlows={plannedFlows}
        onNavigate={handleOverviewNavigate}
        showBalance={showBalance}
      />

      <CategoryChartSection
        catSpends={catSpends}
        onNavigate={handleOverviewNavigate}
        onCategoryClick={onCategoryClick}
      />

      {realTx.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Усі операції (${realTx.length})`}
          onPress={() => handleOverviewNavigate("transactions")}
          className="w-full py-4 rounded-2xl border border-dashed border-cream-300 active:opacity-70"
        >
          <Text className="text-sm font-medium text-fg-muted text-center">
            Усі операції ({realTx.length}) →
          </Text>
        </Pressable>
      )}
      {loadingTx && (
        <Text className="text-center text-xs text-fg-muted py-4">
          Оновлення…
        </Text>
      )}
    </ScrollView>
  );
}
