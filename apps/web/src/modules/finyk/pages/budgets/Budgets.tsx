import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Skeleton, SkeletonBudgetBar } from "@shared/components/ui/Skeleton";
import { HIGHLIGHT_CLEAR_MS } from "@shared/lib/ui/timeouts";
import { motionScrollBehavior } from "@shared/lib/ui/motion";
import {
  DataState,
  type DataStateQueryLike,
} from "@shared/components/ui/DataState";
import { calcCategorySpent } from "../../utils";
import {
  calcLimitCategoryBreakdown,
  calcLimitCategorySpent,
} from "./limitCategorySpend";
import {
  currentKyivMonthPrefix,
  filterToKyivMonth,
} from "../../lib/monthWindow";
import { buildExpenseCategoryList } from "@sergeant/finyk-domain/domain/categories";
import {
  getLimitBudgets,
  getGoalBudgets,
  getCurrentMonthContext,
  getMonthlyPlanUsage,
  calculateTotalExpenseFact,
  filterTransactionsForLimitPeriod,
  limitBudgetCategoryIds,
} from "@sergeant/finyk-domain/domain/budget";
import {
  filterStatTransactions,
  manualExpenseToTransaction,
} from "@sergeant/finyk-domain/domain/transactions";
import { getMonthlySummary } from "@sergeant/finyk-domain/domain/selectors";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import { MonthlyPlanCard } from "../../components/budgets/MonthlyPlanCard";
import { AddBudgetForm } from "../../components/budgets/AddBudgetForm";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { useToast } from "@shared/hooks/useToast";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../../core/observability/analytics";
import { readSignalContext } from "../../../../core/observability/valueSignalAttribution";
import { BudgetsLimitsSection } from "./BudgetsLimitsSection";
import { BudgetsGoalsSection } from "./BudgetsGoalsSection";
import { useProactiveAdvice } from "./useProactiveAdvice";
import type { NewBudgetDraft } from "../../components/budgets/AddBudgetForm";
import type {
  Budget,
  Category,
  LimitBudget,
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { MonoJarDto } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { Button } from "@shared/components/ui/Button";

// Mirrors `useStorage`'s MonthlyPlan shape (required income/expense/
// savings, each a raw input value). Replicated inline here to avoid
// importing the storage hook just for a type and to keep the slice
// interface decoupled from the hook's internal name.
type MonthlyPlan = {
  income: number | string;
  expense: number | string;
  savings: number | string;
};

/**
 * Slice of `useMonobank` (after `useUnifiedFinanceData` merging) that the
 * Budgets page reads. Defined inline to avoid a circular type import on
 * the lazy-loaded page module.
 */
export interface BudgetsMonoSlice {
  realTx: Transaction[];
  loadingTx: boolean;
  transactions?: Transaction[];
  /** Банки Monobank юзера — для прогресу і дропдауна привʼязки цілі. */
  jars?: MonoJarDto[];
}

/**
 * Slice of `useStorage` that the Budgets page reads. Defined inline for
 * the same reason as {@link BudgetsMonoSlice}.
 */
export interface BudgetsStorageSlice {
  budgets: Budget[];
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  excludedTxIds: Set<string>;
  monthlyPlan: MonthlyPlan | null | undefined;
  setMonthlyPlan: Dispatch<SetStateAction<MonthlyPlan>>;
  txCategories: TxCategoriesMap;
  txSplits: TxSplitsMap;
  customCategories: Category[] | undefined;
  subscriptions?: readonly unknown[];
  manualDebts?: readonly unknown[];
  receivables?: readonly unknown[];
  manualExpenses?: ManualExpense[];
}

export interface BudgetsProps {
  mono: BudgetsMonoSlice;
  storage: BudgetsStorageSlice;
  showBalance?: boolean;
  focusLimitCategoryId?: string | null;
  /**
   * When true, the embedded `MonthlyPlanCard` auto-opens its inline
   * editor and renders a `<FirstRunHintBanner />` framing the
   * income/expense/savings inputs as the canonical home of the user's
   * monthly plan. Set on the user's first Finyk entry by `FinykApp`
   * via `useModuleFirstRun`.
   */
  monthlyPlanFirstRunHint?: boolean;
  /** Dismiss callback for the first-run hint banner. */
  onDismissMonthlyPlanFirstRunHint?: () => void;
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
  focusLimitCategoryId = null,
  monthlyPlanFirstRunHint = false,
  onDismissMonthlyPlanFirstRunHint,
}: BudgetsProps) {
  const toast = useToast();
  const { realTx, loadingTx, jars = [] } = mono;
  const {
    budgets,
    setBudgets,
    excludedTxIds,
    monthlyPlan,
    setMonthlyPlan,
    txCategories,
    txSplits,
    customCategories,
    manualExpenses = [],
  } = storage;

  // eslint-disable-next-line no-restricted-syntax -- wall-clock instant passed straight into Kyiv-time helper getCurrentMonthContext
  const now = useMemo(() => new Date(), []);
  const { monthStart } = getCurrentMonthContext(now);

  // Manual expenses/income live in storage (LS + React state), not in the
  // bank tx stream — the fact-vs-plan selectors below must merge them in
  // explicitly, or a manually-added salary/expense never moves the Plan
  // card's progress. Mirrors the merge pattern `useOverviewData` uses for
  // Overview's own income/spent totals.
  const manualExpenseTxs = useMemo(
    () => manualExpenses.map((e) => manualExpenseToTransaction(e)),
    [manualExpenses],
  );

  // AI-DANGER: план і ліміти — місячні, тож факт мусить рахуватись рівно за
  // поточний київський місяць. `realTx` не є month-scoped (mirror-overlay), а
  // `getMonthlySummary` / `calcCategorySpent` не мають вбудованого вікна —
  // без цього клампу картка Плану показувала all-time суми. Повний контекст:
  // `../../lib/monthWindow.ts`.
  const kyivMonthPrefix = useMemo(() => currentKyivMonthPrefix(now), [now]);

  const allTx = useMemo(
    () =>
      manualExpenseTxs.length > 0 ? [...realTx, ...manualExpenseTxs] : realTx,
    [realTx, manualExpenseTxs],
  );

  const txForStats = useMemo(
    () => filterToKyivMonth(allTx, kyivMonthPrefix),
    [allTx, kyivMonthPrefix],
  );

  /**
   * Exclusion-filtered but NOT month-clamped.
   *
   * AI-DANGER: limit budgets must be scored against this list, not the
   * month-clamped one. `LimitBudget.period` is `month | week | one_time`, and
   * `filterTransactionsForLimitPeriod` applies its own window — a `week`
   * budget looked at on a Wednesday 2-го числа starts on Monday of the
   * previous month, and `one_time` starts at `budget.createdAt`, arbitrarily
   * far back. Pre-clamping to the current month silently drops those rows and
   * understates spend against the limit.
   */
  const allStatTx = useMemo(
    () => filterStatTransactions(allTx, excludedTxIds),
    [allTx, excludedTxIds],
  );

  /** Month-clamped counterpart — for the monthly plan-vs-fact card only. */
  const statTx = useMemo(
    () => filterStatTransactions(txForStats, excludedTxIds),
    [txForStats, excludedTxIds],
  );
  const monthlySummary = useMemo(
    () => getMonthlySummary(txForStats, { excludedTxIds, txSplits }),
    [txForStats, excludedTxIds, txSplits],
  );
  const factIncome = monthlySummary.income;
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const expenseCategoryList = useMemo(
    () => buildExpenseCategoryList(customCategories, { excludeIncome: false }),
    [customCategories],
  );
  // Both branches read the unclamped list on purpose: limit budgets carry
  // their own period window (see `allStatTx`), and goal budgets accumulate
  // across the whole history — neither is a "цього місяця" number.
  const calcSpent = useCallback(
    (budget: Budget) => {
      if (budget.type !== "limit") {
        return calcCategorySpent(
          allStatTx,
          "",
          txCategories,
          txSplits,
          customCategories,
        );
      }
      // `calcLimitCategorySpent`, а не `calcCategorySpent`: ліміт живе в
      // словнику MCC, а ручна витрата — у детальнішій ручній таксономії,
      // і кілька її слагів (`groceries`, `cafe`, `tech`) мають ІНШИЙ
      // канонічний id. Буквальне порівняння id давало нуль у ліміті при
      // видимих витратах в Аналітиці — див. `./limitCategorySpend.ts`.
      return calcLimitCategorySpent(
        filterTransactionsForLimitPeriod(allStatTx, budget, now),
        limitBudgetCategoryIds(budget),
        txCategories,
        txSplits,
        customCategories,
      );
    },
    [customCategories, now, allStatTx, txCategories, txSplits],
  );
  // Розбивка факту комбо-ліміту по категоріях — те саме period-вікно, що й
  // calcSpent; секція викликає її лише для лімітів із 2+ категоріями.
  const calcLimitBreakdown = useCallback(
    (budget: LimitBudget) =>
      calcLimitCategoryBreakdown(
        filterTransactionsForLimitPeriod(allStatTx, budget, now),
        limitBudgetCategoryIds(budget),
        txCategories,
        txSplits,
        customCategories,
      ),
    [customCategories, now, allStatTx, txCategories, txSplits],
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
  // секцію лімітів і просимо потрібну картку проскролитись у вʼюпорт.
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
        node.scrollIntoView({
          behavior: motionScrollBehavior(),
          block: "center",
        });
        setHighlightedCategoryId(focusLimitCategoryId);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [focusLimitCategoryId, limitsOpen]);
  useEffect(() => {
    if (!highlightedCategoryId) return;
    const t = setTimeout(
      () => setHighlightedCategoryId(null),
      HIGHLIGHT_CLEAR_MS,
    );
    return () => clearTimeout(t);
  }, [highlightedCategoryId]);
  const toggleGoals = useCallback(() => {
    setGoalsOpen((v) => !v);
  }, [setGoalsOpen]);
  const dismissAdvice = useCallback(
    (categoryKey: string, monthKey: string, text: string) => {
      if (!text) return;
      setDismissedAdvice((prev) => ({
        ...prev,
        [`${monthKey}_${categoryKey}`]: text,
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

  // Item #8 round-13: AddBudgetForm власняє форм-state через `useApiForm` +
  // zod (дві окремі схеми для limit/goal); калл-сайт лиш отримує normalized
  // draft із вже перевіреними number-ами. dedup-чек (`Ліміт для цієї
  // категорії вже існує`) живе в схемі через superRefine із closure на
  // `existingBudgets`, тож результат отриманий тут вже безпечно додавати без
  // додаткової валідації.
  const handleAddBudget = useCallback(
    (draft: NewBudgetDraft) => {
      setBudgets((b) => [
        ...b,
        draft.type === "goal"
          ? // Нова ціль стартує з порожнього логу поповнень — savedAmount
            // більше не вводиться при створенні (goal-progress-auto-sync).
            {
              ...draft,
              id: crypto.randomUUID(),
              savedAmount: 0,
              contributions: [],
            }
          : { ...draft, id: crypto.randomUUID() },
      ]);
      // Хвиля 2: подія переюзана як є — додані лише поля атрибуції петлі,
      // щоб «бюджет після сигналу про перевитрату» став вимірюваним без
      // нової події і без ренейму наявної.
      trackEvent(ANALYTICS_EVENTS.BUDGET_SET, {
        ...(draft.type === "limit"
          ? {
              type: "limit",
              categoryId: draft.categoryId,
              categoryCount: draft.categoryIds.length,
            }
          : { type: "goal" }),
        ...readSignalContext("finyk"),
      });
      setShowForm(false);
    },
    [setBudgets],
  );

  const handleCancelForm = useCallback(() => {
    setShowForm(false);
  }, []);

  // DataState contract: `data === undefined` triggers the skeleton slot.
  // First-paint of the Budgets page treats "loading and no realTx yet" as
  // initial-load; once data lands we keep rendering even on background
  // refetches so the page never blanks out.
  const budgetsQuery: DataStateQueryLike<readonly Transaction[]> = {
    data: loadingTx && realTx.length === 0 ? undefined : realTx,
    isLoading: loadingTx,
  };

  const budgetsLoadingSkeleton = (
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

  const {
    remaining: remaining2,
    safePerDay,
    pctExpense,
    isOver,
    daysLeft: daysLeft2,
  } = getMonthlyPlanUsage(
    { planIncome, planExpense, totalFact: totalExpenseFact },
    // eslint-disable-next-line no-restricted-syntax -- wall-clock instant passed straight into Kyiv-time helper getMonthlyPlanUsage
    new Date(),
  );

  return (
    // See comment in Overview.tsx — FinykApp's tab body is a vertical
    // flex chain, so `<DataState>`'s wrapper div needs to participate in
    // it (`flex-1 flex flex-col min-h-0`) for the inner `flex-1
    // overflow-y-auto` scroller to size against the viewport. Without
    // these classes the page becomes unscrollable on Budgets too.
    <DataState
      query={budgetsQuery}
      skeleton={budgetsLoadingSkeleton}
      className="flex-1 flex flex-col min-h-0"
    >
      {() => (
        <div className="flex-1 overflow-y-auto">
          <h1 className="sr-only">Бюджети</h1>
          <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
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
              firstRunHint={monthlyPlanFirstRunHint}
              onDismissFirstRunHint={onDismissMonthlyPlanFirstRunHint}
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
              calcBreakdown={calcLimitBreakdown}
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
              jars={jars}
            />

            {showForm ? (
              <AddBudgetForm
                existingBudgets={budgets}
                expenseCategoryList={expenseCategoryList}
                jars={jars}
                onSubmit={handleAddBudget}
                onCancel={handleCancelForm}
              />
            ) : (
              <Button
                type="button"
                variant="finyk-soft"
                onClick={() => setShowForm(true)}
                className="group w-full rounded-2xl shadow-soft"
              >
                {messages.finyk.addLimitOrGoal}
              </Button>
            )}
          </div>
        </div>
      )}
    </DataState>
  );
}
