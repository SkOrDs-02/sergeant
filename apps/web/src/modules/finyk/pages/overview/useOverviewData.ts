import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../../core/observability/analytics";
import {
  calcDebtRemaining,
  calcReceivableRemaining,
  calcCategorySpent,
  calcFinykSpendingTotal,
  getMonoTotals,
} from "../../utils";
import type { useStorage } from "../../hooks/useStorage";
import type { useUnifiedFinanceData } from "../../hooks/useUnifiedFinanceData";

import { getSubscriptionAmountMeta } from "@sergeant/finyk-domain/domain/subscriptionUtils";
import { getMonthlySummary } from "@sergeant/finyk-domain/domain/selectors";
import {
  getLimitBudgets,
  isBudgetAlert,
  getCurrentMonthContext,
} from "@sergeant/finyk-domain/domain/budget";
import { filterStatTransactions } from "@sergeant/finyk-domain/domain/transactions";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { THEME_HEX } from "@shared/lib/ui/themeHex";

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

// ── Pure helpers ────────────────────────────────────────────────────

const parseLocalDate = (isoDate: string | null | undefined): Date => {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  return new Date(y!, (m || 1) - 1, d || 1);
};

const formatDaysLeft = (days: number): string => {
  if (days === 0) return "сьогодні";
  if (days === 1) return "завтра";
  if (days <= 3) return `через ${days} дн`;
  return `через ${days} дн`;
};

const getNextBillingDate = (billingDay: number, now: Date): Date => {
  const y = now.getFullYear(),
    m = now.getMonth();
  let d = new Date(y, m, Math.min(billingDay, new Date(y, m + 1, 0).getDate()));
  if (d < new Date(y, m, now.getDate()))
    d = new Date(
      y,
      m + 1,
      Math.min(billingDay, new Date(y, m + 2, 0).getDate()),
    );
  return d;
};

// ── Hook ────────────────────────────────────────────────────────────

export interface UseOverviewDataParams {
  mono: MergedMonoLike;
  storage: StorageLike;
  onNavigate?: (page: string) => void;
}

export function useOverviewData({
  mono,
  storage,
  onNavigate,
}: UseOverviewDataParams) {
  const {
    realTx,
    loadingTx,
    clientInfo,
    accounts,
    transactions,
    syncState,
    lastUpdated,
    error: monoError,
    refresh: monoRefresh,
    privatTotal = 0,
  } = mono;
  const {
    budgets,
    subscriptions,
    manualDebts,
    receivables,
    hiddenAccounts,
    excludedTxIds,
    monthlyPlan,
    networthHistory,
    saveNetworthSnapshot,
    txCategories,
    txSplits,
    manualAssets,
    customCategories,
    manualExpenses = [],
  } = storage;

  const now = new Date();
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
    () =>
      getMonoTotals(
        accounts
          .filter(
            (a): a is Extract<typeof a, { _source: "monobank" }> =>
              a._source === "monobank",
          )
          .filter(
            (a): a is typeof a & { balance: number } =>
              typeof a.balance === "number",
          ),
        hiddenAccounts,
      ),
    [accounts, hiddenAccounts],
  );
  const monoTotal = monoOnlyTotal + privatTotal;
  const manualDebtTotal = useMemo(
    () =>
      manualDebts.reduce(
        (s: number, d) => s + calcDebtRemaining(d, transactions),
        0,
      ),
    [manualDebts, transactions],
  );
  const totalDebt = monoTotalDebt + manualDebtTotal;
  const totalReceivable = useMemo(
    () =>
      receivables.reduce(
        (s: number, r) => s + calcReceivableRemaining(r, transactions),
        0,
      ),
    [receivables, transactions],
  );
  const manualAssetTotal = useMemo(
    () =>
      (manualAssets || [])
        .filter((a) => a.currency === "UAH")
        .reduce((s: number, a) => s + Number(a.amount), 0),
    [manualAssets],
  );
  const networth = monoTotal + manualAssetTotal + totalReceivable - totalDebt;

  const limitBudgets = useMemo(() => getLimitBudgets(budgets), [budgets]);

  useEffect(() => {
    if (loadingTx && realTx.length === 0) return;
    if (networth !== 0 && accounts.length > 0) {
      saveNetworthSnapshot(networth);
    }
  }, [
    networth,
    loadingTx,
    realTx.length,
    accounts.length,
    saveNetworthSnapshot,
  ]);

  // First-insight banner
  const hasAnyData = manualExpenses.length > 0 || realTx.length > 0;
  const [showFirstInsight, setShowFirstInsight] = useState(
    () => safeReadStringLS("finyk_first_insight_seen_v1", null) === null,
  );
  const insightFiredRef = useRef(false);
  useEffect(() => {
    if (insightFiredRef.current) return;
    if (!showFirstInsight || !hasAnyData) return;
    insightFiredRef.current = true;
    safeWriteLS("finyk_first_insight_seen_v1", "1");
    trackEvent(ANALYTICS_EVENTS.FIRST_INSIGHT_SEEN, {
      source: manualExpenses.length > 0 ? "manual" : "bank",
    });
  }, [showFirstInsight, hasAnyData, manualExpenses.length]);
  const dismissFirstInsight = useCallback(() => setShowFirstInsight(false), []);
  const handleSetBudgetFromInsight = useCallback(() => {
    dismissFirstInsight();
    onNavigate?.("budgets");
  }, [dismissFirstInsight, onNavigate]);

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

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const subscriptionFlows = useMemo(
    () =>
      subscriptions.map((sub) => {
        const { amount, currency } = getSubscriptionAmountMeta(
          sub,
          transactions,
        );
        const dueDate = getNextBillingDate(Number(sub.billingDay) || 1, now);
        const daysLeft = Math.ceil(
          (dueDate.getTime() - todayStart.getTime()) / 86400000,
        );
        return {
          id: `sub-${sub.id}`,
          title: `${sub.emoji} ${sub.name}`,
          amount,
          sign: "-",
          color: THEME_HEX.danger,
          daysLeft,
          hint: formatDaysLeft(daysLeft),
          currency,
          dueDate,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subscriptions, transactions, todayStart.getTime()],
  );

  const debtOutFlows = useMemo(
    () =>
      manualDebts
        .map((d) => ({ ...d, remaining: calcDebtRemaining(d, transactions) }))
        .filter((d) => d.dueDate && d.remaining > 0)
        .map((d) => {
          const daysLeft = Math.ceil(
            (parseLocalDate(d.dueDate).getTime() - todayStart.getTime()) /
              86400000,
          );
          return {
            id: `debt-${d.id}`,
            title: `${d.emoji || "💸"} ${d.name}`,
            amount: d.remaining,
            sign: "-",
            color: THEME_HEX.danger,
            daysLeft,
            hint: formatDaysLeft(daysLeft),
            currency: "₴",
            dueDate: parseLocalDate(d.dueDate),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manualDebts, transactions, todayStart.getTime()],
  );

  const debtInFlows = useMemo(
    () =>
      receivables
        .map((r) => ({
          ...r,
          remaining: calcReceivableRemaining(r, transactions),
        }))
        .filter((r) => r.dueDate && r.remaining > 0)
        .map((r) => {
          const daysLeft = Math.ceil(
            (parseLocalDate(r.dueDate).getTime() - todayStart.getTime()) /
              86400000,
          );
          return {
            id: `recv-${r.id}`,
            title: `${r.emoji || "💰"} ${r.name}`,
            amount: r.remaining,
            sign: "+",
            color: THEME_HEX.success,
            daysLeft,
            hint: formatDaysLeft(daysLeft),
            currency: "₴",
            dueDate: parseLocalDate(r.dueDate),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [receivables, transactions, todayStart.getTime()],
  );

  const plannedFlows = useMemo(
    () =>
      [...subscriptionFlows, ...debtOutFlows, ...debtInFlows]
        .filter((x) => x.daysLeft >= 0 && x.daysLeft <= 10)
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [subscriptionFlows, debtOutFlows, debtInFlows],
  );

  const planExpense = Number(monthlyPlan?.expense || 0);
  const remainingDays = Math.max(1, daysInMonth - daysPassed + 1);
  const expenseTarget = planExpense > 0 ? planExpense : projectedSpend;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthFlows = useMemo(
    () =>
      [...subscriptionFlows, ...debtOutFlows, ...debtInFlows].filter(
        (f) =>
          f.daysLeft >= 0 &&
          f.dueDate &&
          f.dueDate <= new Date(currentYear, currentMonth + 1, 0),
      ),
    [subscriptionFlows, debtOutFlows, debtInFlows, currentYear, currentMonth],
  );

  const recurringOutThisMonth = monthFlows
    .filter(
      (f): f is typeof f & { amount: number } =>
        f.sign === "-" && typeof f.amount === "number",
    )
    .reduce((sum, f) => sum + f.amount, 0);
  const recurringInThisMonth = monthFlows
    .filter(
      (f): f is typeof f & { amount: number } =>
        f.sign === "+" && typeof f.amount === "number",
    )
    .reduce((sum, f) => sum + f.amount, 0);
  const unknownOutCount = monthFlows.filter(
    (f) => f.sign === "-" && f.amount === null,
  ).length;
  const expenseLeft =
    expenseTarget - spent - recurringOutThisMonth + recurringInThisMonth;
  const dayBudget = expenseLeft / remainingDays;

  const showMonthForecast = daysPassed > 0 && projectedSpend > 0;
  const forecastTrendPct = showMonthForecast
    ? Math.min(100, Math.round((spent / projectedSpend) * 100))
    : 0;
  const forecastBarClass =
    forecastTrendPct > 75
      ? "bg-danger"
      : forecastTrendPct > 50
        ? "bg-warning"
        : "bg-emerald-500";

  const spendPlanRatio = expenseTarget > 0 ? spent / expenseTarget : 0;
  const hasExpensePlan = expenseTarget > 0;

  const dateLabel = now.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
  });

  return {
    // Mono state
    realTx,
    loadingTx,
    clientInfo,
    syncState,
    lastUpdated,
    monoError,
    monoRefresh,
    // Computed values
    networth,
    monoTotal,
    totalDebt,
    daysInMonth,
    daysPassed,
    dayBudget,
    hasExpensePlan,
    spendPlanRatio,
    dateLabel,
    spent,
    income,
    showMonthForecast,
    projectedSpend,
    planExpense,
    forecastTrendPct,
    forecastBarClass,
    recurringOutThisMonth,
    recurringInThisMonth,
    unknownOutCount,
    // Collections
    networthHistory,
    budgetAlerts,
    statTx,
    txCategories,
    txSplits,
    customCategories,
    plannedFlows,
    // First-insight banner
    showFirstInsight,
    hasAnyData,
    handleSetBudgetFromInsight,
    dismissFirstInsight,
  };
}
