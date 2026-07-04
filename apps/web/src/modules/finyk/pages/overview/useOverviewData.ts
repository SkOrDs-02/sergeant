/**
 * Last validated: 2026-05-14
 * Status: Active
 */
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
import {
  filterStatTransactions,
  manualExpenseToTransaction,
} from "@sergeant/finyk-domain/domain/transactions";
import { kyivCalendarDaysBetween } from "@sergeant/shared";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { getKyivDateParts, getDaysInMonth } from "@shared/lib/time/kyivTime";
import { THEME_HEX } from "@shared/lib/ui/themeHex";
import { logger } from "@shared/lib";

type StorageLike = ReturnType<typeof useStorage>;
type MergedMonoLike = ReturnType<typeof useUnifiedFinanceData>["mergedMono"];

// ── Pure helpers ────────────────────────────────────────────────────

const parseLocalDate = (isoDate: string | null | undefined): Date => {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  return new Date(y ?? 0, (m || 1) - 1, d || 1);
};

const formatDaysLeft = (days: number): string => {
  if (days === 0) return "сьогодні";
  if (days === 1) return "завтра";
  if (days <= 3) return `через ${days} дн`;
  return `через ${days} дн`;
};

// `today` carries the Kyiv-anchored calendar parts of "now" (year, 0-based
// month, day) so the billing rollover math stays on the Europe/Kyiv day
// boundary regardless of the device timezone.
const getNextBillingDate = (
  billingDay: number,
  today: { year: number; month: number; day: number },
): Date => {
  const { year: y, month: m, day } = today;
  let d = new Date(y, m, Math.min(billingDay, getDaysInMonth(y, m)));
  if (d < new Date(y, m, day))
    d = new Date(y, m + 1, Math.min(billingDay, getDaysInMonth(y, m + 1)));
  return d;
};

// ── Hook ────────────────────────────────────────────────────────────

export interface UseOverviewDataParams {
  mono: MergedMonoLike;
  storage: StorageLike;
  onNavigate?: ((page: string) => void) | undefined;
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
    // `manualExpenses` is always a concrete array from the storage slots
    // (useFinykStorageSlots types it `ManualExpense[]`), so no default is
    // needed. A `= []` default would mint a fresh literal in component scope
    // that the React Compiler treats as a locally-created mutable value and
    // refuses to preserve as a memo dependency
    // (react-hooks/preserve-manual-memoization).
    manualExpenses,
  } = storage;

  // The raw current instant is captured once as a primitive epoch and
  // immediately routed through Kyiv helpers (getKyivDateParts below +
  // getCurrentMonthContext), so no host-local day boundary ever leaks out of
  // this hook. Using `Date.now()` (a number) instead of a `new Date()` object
  // keeps this instant a scalar the React Compiler can track — a component-scope
  // `Date` reads as a locally-created mutable value that poisons every derived
  // memo dependency (react-hooks/preserve-manual-memoization).
  const nowMs = Date.now();
  // Anchor every calendar-window computation below to Europe/Kyiv (the
  // domain time invariant) instead of host-local Date getters, so month and
  // day boundaries never drift off-by-one on a non-Kyiv device. getKyivDateParts
  // returns month as 1-12; convert to the 0-based form the Date constructor and
  // the window math expect.
  const kyivToday = getKyivDateParts(nowMs);
  const kyivYear = kyivToday.year;
  const kyivMonth = kyivToday.month - 1;
  const kyivDay = kyivToday.day;
  const { daysInMonth, daysPassed } = getCurrentMonthContext(new Date(nowMs));

  // Manual expenses live in storage (LS + React state), not in the bank tx
  // stream, so the spend/summary selectors must merge them in explicitly —
  // otherwise the Overview totals ignore a manually added expense entirely
  // and the page looks frozen after the add/edit sheet closes. Mirrors the
  // merge pattern Transactions/Analytics already use; scoped to the current
  // calendar month to match `getMonthlySummary`'s implicit window.
  const manualExpenseTxs = useMemo(() => {
    const monthStart = new Date(kyivYear, kyivMonth, 1).getTime();
    const monthEnd = new Date(kyivYear, kyivMonth + 1, 1).getTime();
    return manualExpenses
      .filter((e) => {
        const ts = new Date(e.date).getTime();
        return ts >= monthStart && ts < monthEnd;
      })
      .map((e) => manualExpenseToTransaction(e));
    // Depend on the Kyiv month primitives (stable within a render pass) so the
    // memo doesn't thrash on `now` being recreated each render.
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- `manualExpenses` is a storage-slots array the React Compiler conservatively flags as "may be modified later" (it is reassigned via setManualExpenses in a sibling hook); the manual memo is correct and behaviour-preserving here. Compiler is not enabled at runtime, so this useMemo does real work — dropping it would recompute the filtered/mapped list every render.
  }, [manualExpenses, kyivYear, kyivMonth]);

  const txForStats = useMemo(
    () =>
      manualExpenseTxs.length > 0 ? [...realTx, ...manualExpenseTxs] : realTx,
    [realTx, manualExpenseTxs],
  );

  const statTx = useMemo(
    () => filterStatTransactions(txForStats, excludedTxIds),
    [txForStats, excludedTxIds],
  );
  const spent = useMemo(
    () => calcFinykSpendingTotal(statTx, { txSplits }),
    [statTx, txSplits],
  );
  const monthlySummary = useMemo(
    () => getMonthlySummary(txForStats, { excludedTxIds, txSplits }),
    [txForStats, excludedTxIds, txSplits],
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
  const { manualAssetTotal, nonUahManualAssetCount } = useMemo(() => {
    const all = manualAssets || [];
    const uah = all.filter((a) => a.currency === "UAH");
    return {
      manualAssetTotal: uah.reduce((s: number, a) => s + Number(a.amount), 0),
      nonUahManualAssetCount: all.length - uah.length,
    };
  }, [manualAssets]);
  useEffect(() => {
    if (nonUahManualAssetCount > 0) {
      logger.warn(
        `[finyk/overview] ${nonUahManualAssetCount} non-UAH manual asset(s) excluded from networth (F17)`,
      );
    }
  }, [nonUahManualAssetCount]);
  const networth = monoTotal + manualAssetTotal + totalReceivable - totalDebt;

  const limitBudgets = useMemo(() => getLimitBudgets(budgets), [budgets]);

  useEffect(() => {
    if (loadingTx && realTx.length === 0) return;
    // Audit 05 F8: the prior `networth !== 0` guard silently dropped the
    // break-even snapshot — a real scenario after paying off a loan that
    // exactly matches current cash. `accounts.length > 0` is the real
    // "data available" gate; zero net worth is a legitimate data point.
    if (accounts.length > 0) {
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

  const todayStart = new Date(kyivYear, kyivMonth, kyivDay);
  // Hoist the epoch primitive so the memo dependency arrays below stay simple
  // expressions (react-hooks/use-memo) rather than `todayStart.getTime()` calls.
  const todayStartMs = todayStart.getTime();

  const subscriptionFlows = useMemo(
    () =>
      subscriptions.map((sub) => {
        const { amount, currency } = getSubscriptionAmountMeta(
          sub,
          transactions,
        );
        const dueDate = getNextBillingDate(Number(sub.billingDay) || 1, {
          year: kyivYear,
          month: kyivMonth,
          day: kyivDay,
        });
        const daysLeft = kyivCalendarDaysBetween(
          dueDate.getTime(),
          todayStartMs,
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
    // kyivYear/Month/Day and txCategories are derived from
    // subscriptions/transactions/todayStartMs — adding them would only
    // duplicate the dep; todayStartMs already changes when the day rolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subscriptions, transactions, todayStartMs],
  );

  const debtOutFlows = useMemo(
    () =>
      manualDebts
        .map((d) => ({ ...d, remaining: calcDebtRemaining(d, transactions) }))
        .filter((d) => d.dueDate && d.remaining > 0)
        .map((d) => {
          const daysLeft = kyivCalendarDaysBetween(
            parseLocalDate(d.dueDate).getTime(),
            todayStartMs,
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
    [manualDebts, transactions, todayStartMs],
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
          const daysLeft = kyivCalendarDaysBetween(
            parseLocalDate(r.dueDate).getTime(),
            todayStartMs,
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
    [receivables, transactions, todayStartMs],
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
  const currentYear = kyivYear;
  const currentMonth = kyivMonth;
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
        : "bg-success";

  // "Has a plan" must reflect a real user-set monthly plan, not the
  // forecast fallback baked into `expenseTarget` (which is only for the
  // day-budget math). Otherwise the plan progress bar renders "N% з плану
  // 0 ₴" — a percentage against a zero plan — and the Hero status claims
  // "Понад 50% запланованого" with nothing planned.
  const hasExpensePlan = planExpense > 0;
  const spendPlanRatio = hasExpensePlan ? spent / planExpense : 0;

  const dateLabel = new Date(nowMs).toLocaleDateString("uk-UA", {
    timeZone: "Europe/Kyiv",
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
    nonUahManualAssetCount,
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
