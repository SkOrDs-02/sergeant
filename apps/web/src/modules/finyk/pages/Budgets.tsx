import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Skeleton, SkeletonBudgetBar } from "@shared/components/ui/Skeleton";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/cn";
import { calcCategorySpent, resolveExpenseCategoryMeta } from "../utils";
import { computeFinykSchedule, startOfToday } from "../lib/upcomingSchedule";
import { FinykStatsStrip } from "../components/FinykStatsStrip";
import { buildExpenseCategoryList } from "@sergeant/finyk-domain/domain/categories";
import {
  getLimitBudgets,
  getGoalBudgets,
  calculateLimitUsage,
  calculateGoalProgress,
  getGoalMonthlyLabel,
  shouldShowProactiveAdvice,
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
import { chatApi } from "@shared/api";
import { finykKeys } from "@shared/lib/queryKeys";
import { LimitBudgetCard } from "../components/budgets/LimitBudgetCard";
import { GoalBudgetCard } from "../components/budgets/GoalBudgetCard";
import { MonthlyPlanCard } from "../components/budgets/MonthlyPlanCard";
import { AddBudgetForm } from "../components/budgets/AddBudgetForm";
import { readJSON, writeJSON } from "../lib/finykStorage";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";

// ─── React Query integration for AI chat lookups ──────────────────────────
//
// The Budgets page issues two kinds of AI requests:
//
//  1. **Proactive advice** (one request per at-risk category on the current
//     month) — eligible for a 24h cache backed by localStorage. The query is
//     keyed by `[monthKey, categoryId]` so the cache rolls over naturally
//     when the month changes.
//  2. **On-demand forecast explanation** (user clicks "Пояснити" on a
//     forecast card) — fired through `useMutation`. The text is stored in
//     per-category local state; we don't cache across sessions because the
//     button wording ("🔄 Пояснити знову") makes regeneration explicit.

const PROACTIVE_CACHE_PREFIX = "finyk_proactive_v1_";
const PROACTIVE_CACHE_TTL = 24 * 60 * 60 * 1000;

const proactiveCacheKey = (categoryId, monthKey) =>
  `${PROACTIVE_CACHE_PREFIX}${categoryId}_${monthKey}`;

// Re-export from the centralized queryKeys module for callers that still
// import this name from the Budgets page.
export const proactiveAdviceQueryKey = finykKeys.proactiveAdvice;

function loadProactiveAdviceFromLS(categoryId, monthKey) {
  const cached = readJSON(proactiveCacheKey(categoryId, monthKey), null);
  if (!cached || typeof cached !== "object") return null;
  const { text, ts } = cached;
  if (!text || !ts || Date.now() - ts > PROACTIVE_CACHE_TTL) return null;
  return { text, ts };
}

function saveProactiveAdviceToLS(categoryId, monthKey, text) {
  writeJSON(proactiveCacheKey(categoryId, monthKey), {
    text,
    ts: Date.now(),
  });
}

async function fetchProactiveAdvice({
  categoryId,
  monthKey,
  catLabel,
  spent,
  limit,
  remaining,
  pct,
  daysRemaining,
}) {
  const prompt = `Категорія бюджету: ${catLabel}. Витрачено: ${spent.toLocaleString(
    "uk-UA",
  )} ₴ (${pct}% від ліміту ${limit.toLocaleString(
    "uk-UA",
  )} ₴). Залишок: ${remaining.toLocaleString(
    "uk-UA",
  )} ₴. До кінця місяця ${daysRemaining} днів. Дай конкретну коротку пораду (1-2 речення) що зробити, щоб не перевищити ліміт. Відповідь виключно українською.`;
  const data = await chatApi.send({
    context: `[Проактивна AI-порада] Категорія: ${catLabel}, витрачено: ${spent} ₴, ліміт: ${limit} ₴, залишок: ${remaining} ₴, днів до кінця місяця: ${daysRemaining}`,
    messages: [{ role: "user", content: prompt }],
  });
  const text = data.text || null;
  if (text) saveProactiveAdviceToLS(categoryId, monthKey, text);
  return text;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseBag = any;

interface BudgetsProps {
  mono: LooseBag;
  storage: LooseBag;
  showBalance?: boolean;
  focusLimitCategoryId?: string | null;
}

interface ProactiveItem {
  categoryId: string;
  monthKey: string;
  catLabel: string;
  spent: number;
  limit: number;
  remaining: number;
  pct: number;
  daysRemaining: number;
}

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
  const [formType, setFormType] = useState("limit");
  const [newB, setNewB] = useState({
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
    (budget) =>
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
    (categoryId, monthKey, text) => {
      if (!text) return;
      setDismissedAdvice((prev) => ({
        ...prev,
        [`${monthKey}_${categoryId}`]: text,
      }));
    },
    [setDismissedAdvice],
  );

  // At-risk advice fires for any limit where current usage ≥ 80% of limit
  // (see `shouldShowProactiveAdvice`). We key items by `(monthKey,
  // categoryId)` so cached advice rolls over naturally at month boundaries.
  const proactiveItems = useMemo(() => {
    if (limitBudgets.length === 0) return [];
    const { daysLeft: daysRemaining, monthStart: ms } =
      getCurrentMonthContext(now);
    const monthKey = `${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, "0")}`;
    const items: ProactiveItem[] = [];
    for (const b of limitBudgets) {
      const spent = calcSpent(b);
      const pctRaw = b.limit > 0 ? (spent / b.limit) * 100 : 0;
      if (!shouldShowProactiveAdvice({ pctRaw }, null)) continue;
      const cat = resolveExpenseCategoryMeta(b.categoryId, customCategories);
      const catLabel = cat?.label || b.categoryId;
      const remaining = Math.max(0, b.limit - spent);
      const pct = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
      items.push({
        categoryId: b.categoryId,
        monthKey,
        catLabel,
        spent,
        limit: b.limit,
        remaining,
        pct,
        daysRemaining,
      });
    }
    return items;
  }, [limitBudgets, customCategories, calcSpent, now]);

  // One query per at-risk category. Seeded synchronously from localStorage so
  // the UI paints cached advice with no spinner. `staleTime` is set to the
  // 24h TTL and `initialDataUpdatedAt` is the LS timestamp, so a cached entry
  // older than a day is considered stale and re-fetched automatically —
  // matching the pre-migration manual TTL check.
  const proactiveQueries = useQueries({
    queries: proactiveItems.map((item) => ({
      queryKey: proactiveAdviceQueryKey(item.monthKey, item.categoryId),
      queryFn: () => fetchProactiveAdvice(item),
      staleTime: PROACTIVE_CACHE_TTL,
      gcTime: PROACTIVE_CACHE_TTL,
      retry: false,
      initialData: () => {
        const cached = loadProactiveAdviceFromLS(
          item.categoryId,
          item.monthKey,
        );
        return cached?.text ?? undefined;
      },
      initialDataUpdatedAt: () => {
        const cached = loadProactiveAdviceFromLS(
          item.categoryId,
          item.monthKey,
        );
        return cached?.ts ?? undefined;
      },
    })),
  });

  const proactiveAdvice: Record<string, string | null> = {};
  const proactiveLoading: Record<string, boolean> = {};
  proactiveItems.forEach((item, i) => {
    const q = proactiveQueries[i];
    proactiveAdvice[item.categoryId] = q?.data ?? null;
    proactiveLoading[item.categoryId] = Boolean(q?.isFetching);
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
    setBudgets((b) => [...b, { ...normalized, id: crypto.randomUUID() }]);
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

        {/* Limits */}
        <button
          type="button"
          onClick={toggleLimits}
          aria-expanded={limitsOpen}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-panel border border-line rounded-2xl shadow-card hover:bg-panelHi transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-muted" aria-hidden>
              <Icon name="calendar" size={16} />
            </span>
            <SectionHeading
              as="span"
              size="sm"
              className="!mb-0 normal-case tracking-normal"
            >
              Ліміти ·{" "}
              {monthStart.toLocaleDateString("uk-UA", { month: "long" })}
              {limitBudgets.length > 0 && (
                <span className="ml-1 text-subtle font-normal">
                  ({limitBudgets.length})
                </span>
              )}
            </SectionHeading>
          </span>
          <Icon
            name="chevron-down"
            size={14}
            className={cn(
              "transition-transform text-muted shrink-0",
              limitsOpen ? "rotate-180" : "",
            )}
          />
        </button>
        {limitsOpen && limitBudgets.length === 0 && (
          <EmptyState
            compact
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            }
            title="Немає лімітів"
            description="Встанови ліміт витрат на категорію, щоб не виходити за межі бюджету"
          />
        )}
        {limitsOpen &&
          limitBudgets.map((b, i) => {
            const cat = resolveExpenseCategoryMeta(
              b.categoryId,
              customCategories,
            );
            const bspent = calcSpent(b);
            const usage = calculateLimitUsage(b, bspent);
            const globalIdx = budgets.indexOf(b);
            const showAdvice = shouldShowProactiveAdvice(usage, null);
            const isEditing = editIdx === globalIdx;
            const catLabel = cat?.label || "—";
            const isHighlighted = highlightedCategoryId === b.categoryId;
            return (
              <div
                key={b.id || i}
                ref={(node) => {
                  if (node) {
                    limitCardRefs.current.set(b.categoryId, node);
                  } else {
                    limitCardRefs.current.delete(b.categoryId);
                  }
                }}
                className={cn(
                  "rounded-2xl transition-shadow duration-300",
                  isHighlighted &&
                    "ring-2 ring-finyk/60 ring-offset-2 ring-offset-bg",
                )}
              >
                <LimitBudgetCard
                  budget={b}
                  categoryLabel={catLabel}
                  spent={usage.spent}
                  pctRaw={usage.pctRaw}
                  pctRounded={usage.pctRounded}
                  remaining={usage.remaining}
                  isEditing={isEditing}
                  showProactiveAdvice={showAdvice}
                  proactiveLoading={proactiveLoading[b.categoryId]}
                  proactiveText={
                    proactiveAdvice[b.categoryId] &&
                    dismissedAdvice[
                      `${proactiveItems.find((it) => it.categoryId === b.categoryId)?.monthKey ?? ""}_${b.categoryId}`
                    ] === proactiveAdvice[b.categoryId]
                      ? null
                      : proactiveAdvice[b.categoryId]
                  }
                  onDismissAdvice={
                    proactiveAdvice[b.categoryId]
                      ? () => {
                          const mk =
                            proactiveItems.find(
                              (it) => it.categoryId === b.categoryId,
                            )?.monthKey ?? "";
                          if (mk) {
                            dismissAdvice(
                              b.categoryId,
                              mk,
                              proactiveAdvice[b.categoryId],
                            );
                          }
                        }
                      : undefined
                  }
                  onBeginEdit={() => setEditIdx(globalIdx)}
                  onChangeLimit={(nextLimit) =>
                    setBudgets((bs) =>
                      bs.map((x, j) =>
                        j === globalIdx
                          ? { ...x, limit: Number(nextLimit) }
                          : x,
                      ),
                    )
                  }
                  onSave={() => setEditIdx(null)}
                  onDelete={() => {
                    const removed = b;
                    const removedIdx = globalIdx;
                    setBudgets((bs) => bs.filter((_, j) => j !== removedIdx));
                    setEditIdx(null);
                    showUndoToast(toast, {
                      msg: "Видалено ліміт",
                      onUndo: () =>
                        setBudgets((bs) => {
                          const next = [...bs];
                          next.splice(removedIdx, 0, removed);
                          return next;
                        }),
                    });
                  }}
                />
              </div>
            );
          })}

        {/* Goals */}
        <button
          type="button"
          onClick={toggleGoals}
          aria-expanded={goalsOpen}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-panel border border-line rounded-2xl shadow-card hover:bg-panelHi transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-muted" aria-hidden>
              <Icon name="target" size={16} />
            </span>
            <SectionHeading
              as="span"
              size="sm"
              className="!mb-0 normal-case tracking-normal"
            >
              Цілі накопичення
              {goalBudgets.length > 0 && (
                <span className="ml-1 text-subtle font-normal">
                  ({goalBudgets.length})
                </span>
              )}
            </SectionHeading>
          </span>
          <Icon
            name="chevron-down"
            size={14}
            className={cn(
              "transition-transform text-muted shrink-0",
              goalsOpen ? "rotate-180" : "",
            )}
          />
        </button>
        {goalsOpen && goalBudgets.length === 0 && (
          <EmptyState
            compact
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            title="Немає цілей"
            description="Постав ціль накопичення і відстежуй прогрес"
          />
        )}
        {goalsOpen &&
          goalBudgets.map((b, i) => {
            const progress = calculateGoalProgress(b, now);
            const globalIdx = budgets.indexOf(b);
            const isEditing = editIdx === globalIdx;
            return (
              <GoalBudgetCard
                key={b.id || i}
                budget={b}
                saved={progress.saved}
                pct={progress.pct}
                daysLeft={progress.daysLeft}
                monthlyLabel={getGoalMonthlyLabel(progress)}
                isEditing={isEditing}
                onBeginEdit={() => setEditIdx(globalIdx)}
                onChangeSaved={(nextSaved) =>
                  setBudgets((bs) =>
                    bs.map((x, j) =>
                      j === globalIdx
                        ? { ...x, savedAmount: Number(nextSaved) }
                        : x,
                    ),
                  )
                }
                onSave={() => setEditIdx(null)}
                onDelete={() => {
                  const removed = b;
                  const removedIdx = globalIdx;
                  setBudgets((bs) => bs.filter((_, j) => j !== removedIdx));
                  setEditIdx(null);
                  showUndoToast(toast, {
                    msg: "Видалено ціль",
                    onUndo: () =>
                      setBudgets((bs) => {
                        const next = [...bs];
                        next.splice(removedIdx, 0, removed);
                        return next;
                      }),
                  });
                }}
              />
            );
          })}

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
