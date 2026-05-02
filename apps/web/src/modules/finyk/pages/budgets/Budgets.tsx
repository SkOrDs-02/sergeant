import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Skeleton, SkeletonBudgetBar } from "@shared/components/ui/Skeleton";
import { calcCategorySpent } from "../../utils";
import { computeFinykSchedule, startOfToday } from "../../lib/upcomingSchedule";
import { FinykStatsStrip } from "../../components/FinykStatsStrip";
import { buildExpenseCategoryList } from "@sergeant/finyk-domain/domain/categories";
import {
  getLimitBudgets,
  getGoalBudgets,
  getCurrentMonthContext,
  getMonthlyPlanUsage,
  calculateTotalExpenseFact,
  validateLimitBudgetForm,
  validateGoalBudgetForm,
  type LimitFormInput,
  type GoalFormInput,
} from "@sergeant/finyk-domain/domain/budget";
import { filterStatTransactions } from "@sergeant/finyk-domain/domain/transactions";
import { getMonthlySummary } from "@sergeant/finyk-domain/domain/selectors";
import { MonthlyPlanCard } from "../../components/budgets/MonthlyPlanCard";
import { AddBudgetForm } from "../../components/budgets/AddBudgetForm";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { useToast } from "@shared/hooks/useToast";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../../core/observability/analytics";
import { BudgetsLimitsSection } from "./BudgetsLimitsSection";
import { BudgetsGoalsSection } from "./BudgetsGoalsSection";
import { useProactiveAdvice } from "./useProactiveAdvice";
import type {
  BudgetFormType,
  NewBudgetDraft,
} from "../../components/budgets/AddBudgetForm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseBag = any;

export interface BudgetsProps {
  mono: LooseBag;
  storage: LooseBag;
  showBalance?: boolean;
  focusLimitCategoryId?: string | null;
}

/**
 * Page shell for the Finyk Budgets tab. Composes:
 *   - {@link MonthlyPlanCard} — top-level plan vs fact summary
 *   - {@link BudgetsLimitsSection} — collapsible limits list
 *   - {@link BudgetsGoalsSection} — collapsible goals list
 *   - {@link AddBudgetForm} — inline create-new form
 *   - {@link useProactiveAdvice} — AI advice queries for at-risk limits
 *
 * `mono` and `storage` are passed in as opaque object bags because the
 * call-site (FinykApp) constructs them from many hooks; threading
 * per-field would change three more files. Each helper here picks out
 * exactly the slice it needs.
 */
export function Budgets({
  mono,
  storage,
  showBalance = true,
  focusLimitCategoryId = null,
}: BudgetsProps) {
  const toast = useToast();
  const { realTx, loadingTx, transactions } = mono;
  const {
    budgets,
    setBudgets,
    excludedTxIds,
    monthlyPlan,
    setMonthlyPlan,
    txCategories,
    txSplits,
    customCategories,
    subscriptions = [],
    manualDebts = [],
    receivables = [],
  } = storage;
  const statTx = useMemo(
    () => filterStatTransactions(realTx, excludedTxIds),
    [realTx, excludedTxIds],
  );
  const monthlySummary = useMemo(
    () => getMonthlySummary(realTx, { excludedTxIds, txSplits }),
    [realTx, excludedTxIds, txSplits],
  );
  const factIncome = monthlySummary.income;
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<BudgetFormType>("limit");
  const [newB, setNewB] = useState<NewBudgetDraft>({
    type: "limit",
    categoryId: "",
    limit: "",
    name: "",
    emoji: "🎯",
    targetAmount: "",
    targetDate: "",
    savedAmount: "",
  });

  const now = useMemo(() => new Date(), []);
  const { monthStart } = getCurrentMonthContext(now);
  const expenseCategoryList = useMemo(
    () => buildExpenseCategoryList(customCategories, { excludeIncome: false }),
    [customCategories],
  );
  const calcSpent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (budget: any) =>
      calcCategorySpent(
        statTx,
        budget.categoryId,
        txCategories,
        txSplits,
        customCategories,
      ),
    [customCategories, statTx, txCategories, txSplits],
  );
  const limitBudgets = useMemo(() => getLimitBudgets(budgets), [budgets]);
  const goalBudgets = useMemo(() => getGoalBudgets(budgets), [budgets]);
  const planIncome = Number(monthlyPlan?.income || 0);
  const planExpense = Number(monthlyPlan?.expense || 0);
  const planSavings = Number(monthlyPlan?.savings || 0);

  const totalExpenseFact = useMemo(
    () => calculateTotalExpenseFact(statTx, txSplits),
    [statTx, txSplits],
  );
  const factSavings = factIncome - totalExpenseFact;

  const [formError, setFormError] = useState("");

  // Upcoming-schedule feed for the stats strip (reuses the same
  // computation as the Активи page so Сума підписок + Наступний платіж
  // stay consistent across tabs).
  const [todayStart] = useState<Date>(startOfToday);
  const schedule = useMemo(
    () =>
      computeFinykSchedule({
        subscriptions,
        manualDebts,
        receivables,
        transactions: transactions ?? [],
        todayStart,
      }),
    [subscriptions, manualDebts, receivables, transactions, todayStart],
  );

  // Per-(month, category) dismissed-advice registry. Persisted under a
  // dedicated localStorage namespace so it survives reloads but doesn't
  // collide with the 24h proactive-advice cache. Value is the dismissed
  // text itself — when React Query returns a *different* text (next
  // month, manual refetch), the card shows the advice again automatically.
  const [dismissedAdvice, setDismissedAdvice] = useLocalStorageState<
    Record<string, string>
  >("finyk_proactive_dismissed_v1", {});

  // Collapsible state for Limits / Goals sections. Default closed per
  // product feedback (списком із можливістю згорнути, згорнуто за замовчуванням).
  // Persist last choice to localStorage so the user's open/closed pref
  // survives reloads and tab switches; still resets to closed only on
  // first ever visit.
  const [limitsOpen, setLimitsOpen] = useLocalStorageState<boolean>(
    "finyk_budgets_limits_open_v1",
    false,
  );
  const [goalsOpen, setGoalsOpen] = useLocalStorageState<boolean>(
    "finyk_budgets_goals_open_v1",
    false,
  );
  const toggleLimits = useCallback(() => {
    setLimitsOpen((v) => !v);
  }, [setLimitsOpen]);

  // Якщо прийшов deep-link з Hub-інсайту (`#budgets?cat=…`), розгортаємо
  // секцію лімітів і просимо потрібну картку проскролитись у в'юпорт.
  // Підсвітка живе коротко (3 с) — досить, щоб око зачепилось, але не
  // лишається назавжди й не плутає, коли користувач уже з нею взаємодіяв.
  const limitCardRefs = useRef(new Map<string, HTMLDivElement | null>());
  const [highlightedCategoryId, setHighlightedCategoryId] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (!focusLimitCategoryId) return;
    if (!limitsOpen) setLimitsOpen(true);
  }, [focusLimitCategoryId, limitsOpen, setLimitsOpen]);
  useEffect(() => {
    if (!focusLimitCategoryId) return;
    if (!limitsOpen) return;
    // Дочекатись рендеру картки після відкриття секції.
    const raf = requestAnimationFrame(() => {
      const node = limitCardRefs.current.get(focusLimitCategoryId);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedCategoryId(focusLimitCategoryId);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [focusLimitCategoryId, limitsOpen]);
  useEffect(() => {
    if (!highlightedCategoryId) return;
    const t = setTimeout(() => setHighlightedCategoryId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightedCategoryId]);
  const toggleGoals = useCallback(() => {
    setGoalsOpen((v) => !v);
  }, [setGoalsOpen]);
  const dismissAdvice = useCallback(
    (categoryId: string, monthKey: string, text: string) => {
      if (!text) return;
      setDismissedAdvice((prev) => ({
        ...prev,
        [`${monthKey}_${categoryId}`]: text,
      }));
    },
    [setDismissedAdvice],
  );

  const { proactiveItems, proactiveAdvice, proactiveLoading } =
    useProactiveAdvice({
      limitBudgets,
      calcSpent,
      customCategories,
      now,
    });

  const resetForm = () => {
    setNewB({
      type: "limit",
      categoryId: "",
      limit: "",
      name: "",
      emoji: "🎯",
      targetAmount: "",
      targetDate: "",
      savedAmount: "",
    });
    setFormType("limit");
    setFormError("");
    setShowForm(false);
  };

  const addBudget = () => {
    setFormError("");
    const { error, normalized } =
      newB.type === "limit"
        ? validateLimitBudgetForm(newB as LimitFormInput, budgets)
        : validateGoalBudgetForm(newB as GoalFormInput);
    if (error || !normalized) {
      setFormError(error || "Помилка валідації");
      return;
    }
    setBudgets(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any[]) => [...b, { ...normalized, id: crypto.randomUUID() }],
    );
    trackEvent(
      ANALYTICS_EVENTS.BUDGET_SET,
      normalized.type === "limit"
        ? { type: "limit", categoryId: normalized.categoryId }
        : { type: "goal" },
    );
    resetForm();
  };

  if (loadingTx && realTx.length === 0) {
    return (
      <div
        className="flex-1 overflow-y-auto px-4 pt-4 page-tabbar-pad space-y-3 max-w-4xl mx-auto w-full"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Shape-aware: header bar + 3 budget rows so the layout doesn't
            reflow when data lands. */}
        <Skeleton className="h-28 rounded-2xl" />
        <SkeletonBudgetBar />
        <SkeletonBudgetBar className="opacity-80" />
        <SkeletonBudgetBar className="opacity-60" />
      </div>
    );
  }

  const {
    remaining: remaining2,
    safePerDay,
    pctExpense,
    isOver,
    daysLeft: daysLeft2,
  } = getMonthlyPlanUsage(
    { planIncome, planExpense, totalFact: totalExpenseFact },
    new Date(),
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
        {/* Сума підписок + Наступний платіж з тих самих даних, що й на
            сторінці Активи — без пасив-з-дедлайном тайлу (у Плануванні
            це не релевантно). Зникає цілком, якщо обидва слоти пусті. */}
        <FinykStatsStrip
          subsMonthly={schedule.subsMonthly}
          subsCount={schedule.subsCount}
          nextCharge={schedule.nextCharge}
          urgentLiability={null}
          todayStart={todayStart}
          showBalance={showBalance}
        />

        <MonthlyPlanCard
          monthlyPlan={monthlyPlan}
          onChangeMonthlyPlan={setMonthlyPlan}
          planIncome={planIncome}
          planExpense={planExpense}
          planSavings={planSavings}
          totalExpenseFact={totalExpenseFact}
          factIncome={factIncome}
          factSavings={factSavings}
          remaining={remaining2}
          safePerDay={safePerDay}
          pctExpense={pctExpense}
          isOver={isOver}
          daysLeft={daysLeft2}
        />

        <BudgetsLimitsSection
          limitsOpen={limitsOpen}
          toggleLimits={toggleLimits}
          monthStart={monthStart}
          limitBudgets={limitBudgets}
          budgets={budgets}
          setBudgets={setBudgets}
          editIdx={editIdx}
          setEditIdx={setEditIdx}
          customCategories={customCategories}
          calcSpent={calcSpent}
          proactiveItems={proactiveItems}
          proactiveAdvice={proactiveAdvice}
          proactiveLoading={proactiveLoading}
          dismissedAdvice={dismissedAdvice}
          dismissAdvice={dismissAdvice}
          highlightedCategoryId={highlightedCategoryId}
          limitCardRefs={limitCardRefs}
          toast={toast}
        />

        <BudgetsGoalsSection
          goalsOpen={goalsOpen}
          toggleGoals={toggleGoals}
          goalBudgets={goalBudgets}
          budgets={budgets}
          setBudgets={setBudgets}
          editIdx={editIdx}
          setEditIdx={setEditIdx}
          now={now}
          toast={toast}
        />

        {showForm ? (
          <AddBudgetForm
            formType={formType}
            newB={newB}
            onChangeFormType={setFormType}
            onChangeNewB={setNewB}
            expenseCategoryList={expenseCategoryList}
            formError={formError}
            onSubmit={addBudget}
            onCancel={resetForm}
          />
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-3 text-sm text-muted border border-dashed border-line rounded-xl hover:border-primary hover:text-primary transition-colors"
          >
            + Додати ліміт або ціль
          </button>
        )}
      </div>
    </div>
  );
}
