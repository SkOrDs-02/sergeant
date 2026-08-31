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
  calcFinykSpendingTotal,
} from "../../utils";
import type { useStorage } from "../../hooks/useStorage";
import type { useUnifiedFinanceData } from "../../hooks/useUnifiedFinanceData";

import { getSubscriptionAmountMeta } from "@sergeant/finyk-domain/domain/subscriptionUtils";
import { getMonthlySummary } from "@sergeant/finyk-domain/domain/selectors";
import {
  getLimitBudgets,
  isBudgetAlert,
  getCurrentMonthContext,
  limitBudgetCategoryIds,
} from "@sergeant/finyk-domain/domain/budget";
import { calcLimitCategorySpent } from "@sergeant/finyk-domain/lib/limitCategorySpend";
import {
  filterStatTransactions,
  withManualExpenses,
} from "@sergeant/finyk-domain/domain/transactions";
import { kyivCalendarDaysBetween } from "@sergeant/shared";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import {
  getKyivDateParts,
  getDaysInMonth,
  getKyivDayKey,
} from "@shared/lib/time/kyivTime";
import { logger } from "@shared/lib";
import { computeAssetsSummary } from "@sergeant/finyk-domain/domain/assets/aggregates";
import { filterToKyivMonth, txEpochMs } from "../../lib/monthWindow";

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
    privatDebt = 0,
    jars,
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
  const [nowMs] = useState(() => Date.now());
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

  // `YYYY-MM` prefix of the current Kyiv month — the single window every
  // "цього місяця" aggregate below is clamped to.
  const kyivMonthPrefix = `${kyivYear}-${String(kyivMonth + 1).padStart(2, "0")}`;

  // Той самий потік, що годує місячні агрегати нижче, але БЕЗ місячного
  // clamp-у: інсайт-хуки мають власні вікна (`useCoffeeLimitInsight`
  // порівнює два місяці), тож звузити тут означало б їх зламати. Виключення
  // застосовані, бо картка ліміту в `BudgetAlertsList` теж їх застосовує -
  // на одному екрані два числа про ті самі гроші мають збігатись.
  const insightTx = useMemo(
    () =>
      filterStatTransactions(
        withManualExpenses(realTx, manualExpenses),
        excludedTxIds,
      ),
    [realTx, manualExpenses, excludedTxIds],
  );

  // AI-DANGER: this clamp is what makes every "цього місяця" number on Огляд
  // actually mean the current month. Do not drop it — the Finyk selectors
  // carry no implicit window and `realTx` is not month-scoped. Full rationale
  // and the founder report it came from: `../../lib/monthWindow.ts`.
  const txForStats = useMemo(
    () =>
      filterToKyivMonth(
        withManualExpenses(realTx, manualExpenses),
        kyivMonthPrefix,
      ),
    [realTx, manualExpenses, kyivMonthPrefix],
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
  const todaySummary = useMemo(() => {
    const todayKey = getKyivDayKey(nowMs);
    const todayTransactions = txForStats.filter((tx) => {
      const ms = txEpochMs(tx);
      return ms != null && getKyivDayKey(ms) === todayKey;
    });
    return getMonthlySummary(todayTransactions, {
      excludedTxIds,
      txSplits,
    });
  }, [txForStats, excludedTxIds, txSplits, nowMs]);
  const projectedSpend =
    daysPassed > 0 ? (spent / daysPassed) * daysInMonth : 0;

  const assetsSummary = useMemo(
    () =>
      computeAssetsSummary({
        accounts: accounts
          .filter(
            (a): a is Extract<typeof a, { _source: "monobank" }> =>
              a._source === "monobank",
          )
          .filter(
            (a): a is typeof a & { balance: number } =>
              typeof a.balance === "number",
          ),
        hiddenAccounts,
        manualAssets: (manualAssets || []).map((asset) => ({
          id: asset.id,
          name: asset.name ?? "",
          amount: asset.amount,
          currency: asset.currency ?? "",
          ...(asset.emoji !== undefined ? { emoji: asset.emoji } : {}),
        })),
        manualDebts,
        receivables,
        transactions,
        jars,
      }),
    [
      accounts,
      hiddenAccounts,
      manualAssets,
      manualDebts,
      receivables,
      transactions,
      jars,
    ],
  );
  const monoTotal = assetsSummary.monoBalance + privatTotal;
  // §1.3: PrivatBank overdrafts used to vanish from «Пасиви» entirely.
  // `privatDebt` now goes through the same `getMonoTotals` creditLimit/
  // overdraft rule as Monobank's `totalLiabilities`.
  const totalDebt = assetsSummary.totalLiabilities + privatDebt;
  const nonUahManualAssetCount = useMemo(() => {
    const all = manualAssets || [];
    return all.filter((a) => a.currency !== "UAH").length;
  }, [manualAssets]);
  useEffect(() => {
    if (nonUahManualAssetCount > 0) {
      logger.warn(
        `[finyk/overview] ${nonUahManualAssetCount} non-UAH manual asset(s) excluded from networth (F17)`,
      );
    }
  }, [nonUahManualAssetCount]);
  const networth = assetsSummary.networth + privatTotal - privatDebt;

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
      // `calcLimitCategorySpent`, а не `calcCategorySpent`: та сама
      // bucket-агрегація ручної таксономії, що й на картці ліміту, плюс
      // сума по ВСІХ категоріях мульти-категорійного ліміту.
      limitBudgets.filter((b) =>
        isBudgetAlert(
          calcLimitCategorySpent(
            statTx,
            limitBudgetCategoryIds(b),
            txCategories,
            txSplits,
            customCategories,
          ),
          b.limit,
        ),
      ),
    [limitBudgets, statTx, txCategories, txSplits, customCategories],
  );

  // Memoize the Kyiv day-start epoch so it is a stable primitive: it only
  // changes when the calendar day rolls over. Deriving it inline from a `new
  // Date(...)` each render makes React Compiler treat the Date-derived value as
  // potentially-mutable and skip memoization of every flow that depends on it;
  // the wrapped primitive keeps the dependency arrays below simple expressions
  // and lets the debt/subscription flow memos below preserve cleanly.

  const todayStartMs = useMemo(
    () => new Date(kyivYear, kyivMonth, kyivDay).getTime(),
    [kyivYear, kyivMonth, kyivDay],
  );

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
          // AI-CONTEXT (2026-08-21): тут клеївся `sub.emoji`. Поле
          // ЖОДНОГО разу не редагується користувачем — форма підписки
          // не має для нього поля, тож у ньому завжди лежав засіяний
          // дефолт «📱». Тобто це був не вибір людини, а хардкод
          // емодзі, який малювався системним шрифтом. Рядок потоку
          // показує назву; гліф йому не потрібен.
          title: sub.name,
          amount,
          sign: "-",
          daysLeft,
          hint: formatDaysLeft(daysLeft),
          currency,
          dueDate,
        };
      }),
    [subscriptions, transactions, todayStartMs, kyivYear, kyivMonth, kyivDay],
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
            title: d.name || "Борг",
            amount: d.remaining,
            sign: "-",
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
            title: r.name || "Дебіторка",
            amount: r.remaining,
            sign: "+",
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
  // "Has a plan" must reflect a real user-set monthly plan. It gates both the
  // plan progress bar and the day-budget number below.
  const hasExpensePlan = planExpense > 0;
  const dailyPlan = hasExpensePlan ? planExpense / daysInMonth : null;
  const remainingDays = Math.max(1, daysInMonth - daysPassed + 1);
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
  // AI-DANGER: `dayBudget` is `null` — not a fallback number — when the user
  // has не задав місячний план. Do not resurrect a projected-spend fallback.
  //
  // AI-CONTEXT: it used to be `expenseTarget = planExpense > 0 ? planExpense
  // : projectedSpend`, and `projectedSpend` is itself
  // `spent / daysPassed * daysInMonth`. Substituting it makes `spent` the only
  // real input, and the whole expression collapses to
  //
  //     dayBudget ≈ spent · (daysInMonth − daysPassed)
  //                 ─────────────────────────────────────────
  //                 daysPassed · (daysInMonth − daysPassed + 1)
  //
  // i.e. on day 1 of a 31-day month `dayBudget ≈ spent · 30/31` — the card
  // literally told the user "ти можеш витратити сьогодні приблизно стільки,
  // скільки вже витратив". Founder saw «124 686 ₴/день · В нормі» over a
  // 128 842 ₴ month total on 1 серпня 2026 with «Денний план: не задано»
  // right below it. Same self-cancelling defect already documented for
  // `forecastTrendPct` below: a budget needs an independent reference
  // (a user plan), and without one there is no honest number to show — the
  // hero renders a "постав план" CTA instead.
  const dayBudget = hasExpensePlan
    ? (planExpense - spent - recurringOutThisMonth + recurringInThisMonth) /
      remainingDays
    : null;

  const showMonthForecast = daysPassed > 0 && projectedSpend > 0;
  // No `forecastTrendPct` here on purpose. It used to be
  // `spent / projectedSpend`, but `projectedSpend` is itself
  // `spent / daysPassed * daysInMonth`, so `spent` cancels and the value
  // collapsed to `daysPassed / daysInMonth` — a progress bar that tracked the
  // calendar while claiming to track spending. A forecast bar needs an
  // independent reference (a plan, or available funds) to mean anything.

  // `hasExpensePlan` (declared next to `planExpense` above) must reflect a
  // real user-set monthly plan. Otherwise the plan progress bar renders
  // "N% з плану 0 ₴" — a percentage against a zero plan — and the Hero status
  // claims "Понад 50% запланованого" with nothing planned.
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
    todaySpent: todaySummary.spent,
    todayIncome: todaySummary.income,
    dailyPlan,
    showMonthForecast,
    projectedSpend,
    planExpense,
    recurringOutThisMonth,
    recurringInThisMonth,
    unknownOutCount,
    // Collections
    networthHistory,
    budgetAlerts,
    statTx,
    insightTx,
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
