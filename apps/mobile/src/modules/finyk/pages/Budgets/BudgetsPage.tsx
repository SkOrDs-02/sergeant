/**
 * Sergeant Finyk — BudgetsPage (React Native)
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/Budgets.tsx`.
 *
 * Scope of this PR:
 *  - Monthly Plan card (income / expense / savings) with progress and
 *    "safe to spend" hint, edited via PlanEditSheet.
 *  - Limit budgets list (per category) with progress bars; edit via
 *    LimitEditSheet, create via AddBudgetSheet.
 *  - Goal budgets list (savings goals) with progress; edit via
 *    GoalEditSheet, create via AddBudgetSheet.
 *  - Forecast cards rendering `calcForecast` output through
 *    `BudgetForecastCard` + `BudgetTrendChart` (victory-native).
 *  - Subscriptions list with next-billing badge + edit/create sheet.
 *
 * Out of scope (mirrors the web file but deferred to follow-up PRs):
 *  - AI proactive advice + AI explain — chat API is web-only today.
 *  - Custom-category management — mobile has no editor for it yet;
 *    customCategories are read-through from FINYK_CUSTOM_CATEGORIES via
 *    `useFinykTransactionsStore`.
 *  - Recurring-detector "Suggested subscriptions" CTA.
 */
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  type Budget,
  type LimitBudget,
  buildExpenseCategoryList,
  calcCategorySpent,
  calculateGoalProgress,
  calculateLimitUsage,
  calculateTotalExpenseFact,
  filterStatTransactions,
  getGoalBudgets,
  getGoalMonthlyLabel,
  getLimitBudgets,
  getMonthlyPlanUsage,
  getMonthlySummary,
  getSubscriptionAmountMeta,
} from "@sergeant/finyk-domain/domain";
import { calcForecast } from "@sergeant/finyk-domain/lib";

import {
  useFinykBudgetsStore,
  type FinykBudgetsSeed,
  type Subscription,
} from "@/modules/finyk/lib/budgetsStore";
import {
  useFinykTransactionsStore,
  type FinykTransactionsSeed,
} from "@/modules/finyk/lib/transactionsStore";

import { AddBudgetSheet } from "@/modules/finyk/components/budgets/AddBudgetSheet";
import { BudgetForecastCard } from "@/modules/finyk/components/budgets/BudgetForecastCard";
import { GoalBudgetRow } from "@/modules/finyk/components/budgets/GoalBudgetRow";
import {
  GoalEditSheet,
  type GoalBudget,
} from "@/modules/finyk/components/budgets/GoalEditSheet";
import { LimitBudgetRow } from "@/modules/finyk/components/budgets/LimitBudgetRow";
import { LimitEditSheet } from "@/modules/finyk/components/budgets/LimitEditSheet";
import { MonthlyPlanCard } from "@/modules/finyk/components/budgets/MonthlyPlanCard";
import { PlanEditSheet } from "@/modules/finyk/components/budgets/PlanEditSheet";
import { SubscriptionEditSheet } from "@/modules/finyk/components/budgets/SubscriptionEditSheet";
import { SubscriptionRow } from "@/modules/finyk/components/budgets/SubscriptionRow";

type BudgetsSheet =
  | { kind: "closed" }
  | { kind: "plan" }
  | { kind: "limit"; budget: LimitBudget }
  | { kind: "goal"; budget: GoalBudget }
  | { kind: "add" }
  | { kind: "subscription"; subscription: Subscription | null };

const CLOSED: BudgetsSheet = { kind: "closed" };

export interface BudgetsPageProps {
  /** Seeds the MMKV slices owned by the budgets store. */
  seed?: FinykBudgetsSeed & FinykTransactionsSeed;
  /** Override `now` so deterministic tests can pin the calendar month. */
  now?: Date;
  testID?: string;
}

export function BudgetsPage({ seed, now, testID }: BudgetsPageProps) {
  const budgetsStore = useFinykBudgetsStore(seed);
  const txStore = useFinykTransactionsStore(seed);

  const today = useMemo(() => now ?? new Date(), [now]);

  const [sheet, setSheet] = useState<BudgetsSheet>(CLOSED);
  const closeSheet = useCallback(() => setSheet(CLOSED), []);

  const limitBudgets = useMemo(
    () => getLimitBudgets(budgetsStore.budgets),
    [budgetsStore.budgets],
  );
  const goalBudgets = useMemo(
    () => getGoalBudgets(budgetsStore.budgets),
    [budgetsStore.budgets],
  );

  const statTx = useMemo(
    () => filterStatTransactions(txStore.realTx, txStore.hiddenTxIds),
    [txStore.realTx, txStore.hiddenTxIds],
  );

  const totalExpenseFact = useMemo(
    () => calculateTotalExpenseFact(statTx, txStore.txSplits),
    [statTx, txStore.txSplits],
  );

  // Actual income + derived factual savings for the unified Plan/Fact
  // table inside `MonthlyPlanCard`. Uses the same `getMonthlySummary`
  // selector as the Overview page so numbers stay consistent between
  // tabs.
  const factIncome = useMemo(
    () =>
      getMonthlySummary(txStore.realTx, {
        excludedTxIds: txStore.hiddenTxIds,
        txSplits: txStore.txSplits,
      }).income,
    [txStore.realTx, txStore.hiddenTxIds, txStore.txSplits],
  );
  const factSavings = factIncome - totalExpenseFact;

  const planUsage = useMemo(
    () =>
      getMonthlyPlanUsage(
        {
          planIncome: budgetsStore.monthlyPlan?.income,
          planExpense: budgetsStore.monthlyPlan?.expense,
          totalFact: totalExpenseFact,
        },
        today,
      ),
    [budgetsStore.monthlyPlan, totalExpenseFact, today],
  );

  const expenseCategoryList = useMemo(
    () =>
      buildExpenseCategoryList(txStore.customCategories ?? [], {
        excludeIncome: false,
      }),
    [txStore.customCategories],
  );
  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of expenseCategoryList) map.set(c.id, c.label);
    return map;
  }, [expenseCategoryList]);

  const forecasts = useMemo(() => {
    if (limitBudgets.length === 0) return [];
    return calcForecast(
      statTx,
      limitBudgets,
      today,
      txStore.txCategories,
      txStore.txSplits,
      txStore.customCategories ?? [],
    );
  }, [
    statTx,
    limitBudgets,
    today,
    txStore.txCategories,
    txStore.txSplits,
    txStore.customCategories,
  ]);

  /**
   * Map of `categoryId → daily actual spend (current month)` derived
   * from the forecast result. Used to render per-row sparklines on
   * `LimitBudgetRow` so each limit shows its own trend.
   */
  const limitTrends = useMemo(() => {
    const out = new Map<string, number[]>();
    for (const fc of forecasts) {
      const series = (fc.dailyData ?? [])
        .map((d) =>
          typeof d.actual === "number"
            ? d.actual
            : typeof d.forecast === "number"
              ? d.forecast
              : 0,
        )
        .filter((v): v is number => Number.isFinite(v));
      out.set(fc.categoryId, series);
    }
    return out;
  }, [forecasts]);

  const calcSpent = useCallback(
    (categoryId: string) =>
      calcCategorySpent(
        statTx,
        categoryId,
        txStore.txCategories,
        txStore.txSplits,
        txStore.customCategories ?? [],
      ),
    [statTx, txStore.txCategories, txStore.txSplits, txStore.customCategories],
  );

  // Budget mutations -------------------------------------------------------
  const upsertBudget = useCallback(
    (next: Budget) => {
      budgetsStore.setBudgets((prev) => {
        const idx = prev.findIndex((b) => b.id === next.id);
        if (idx === -1) return [...prev, next];
        const out = prev.slice();
        out[idx] = next;
        return out;
      });
    },
    [budgetsStore],
  );
  const deleteBudget = useCallback(
    (id: string) => {
      budgetsStore.setBudgets((prev) => prev.filter((b) => b.id !== id));
    },
    [budgetsStore],
  );

  // Subscription mutations -------------------------------------------------
  const upsertSubscription = useCallback(
    (next: Subscription) => {
      budgetsStore.setSubscriptions((prev) => {
        const idx = prev.findIndex((s) => s.id === next.id);
        if (idx === -1) return [...prev, next];
        const out = prev.slice();
        out[idx] = next;
        return out;
      });
    },
    [budgetsStore],
  );
  const deleteSubscription = useCallback(
    (id: string) => {
      budgetsStore.setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    },
    [budgetsStore],
  );

  /**
   * Compute the **next** billing Date for a recurring subscription,
   * rolling forward to the following month when the billing day has
   * already passed in the current one. Caps the day to the last day
   * of the target month to handle 31 → February correctly.
   */
  function nextBillingDate(billingDay: number): Date {
    const day = Math.max(1, Math.min(31, Math.round(billingDay) || 1));
    const dom = today.getDate();
    const inThisMonth = day >= dom;
    const year = today.getFullYear();
    const monthIdx = today.getMonth() + (inThisMonth ? 0 : 1);
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const safeDay = Math.min(day, lastDay);
    return new Date(year, monthIdx, safeDay);
  }
  function daysToBilling(billingDay: number): number {
    const next = nextBillingDate(billingDay);
    // Compare day-boundaries so same-day charges always read as 0,
    // never -1 due to time-of-day offsets.
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const nextMidnight = new Date(
      next.getFullYear(),
      next.getMonth(),
      next.getDate(),
    ).getTime();
    return Math.max(
      0,
      Math.round((nextMidnight - todayMidnight) / (24 * 60 * 60 * 1000)),
    );
  }

  const planMonthlyValue = budgetsStore.monthlyPlan;

  return (
    <SafeAreaView
      className="flex-1 bg-cream-50"
      edges={["top"]}
      testID={testID}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-1">
        <Text className="text-[22px]">📅</Text>
        <Text className="text-[22px] font-bold text-fg flex-1">Планування</Text>
      </View>
      <Text className="px-4 text-sm text-fg-muted leading-snug mb-2">
        Місячний план, ліміти, цілі та підписки.
      </Text>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 16 }}
      >
        <MonthlyPlanCard
          monthlyPlan={planMonthlyValue}
          totalExpenseFact={planUsage.totalFact}
          factIncome={factIncome}
          factSavings={factSavings}
          remaining={planUsage.remaining}
          pctExpense={planUsage.pctExpense}
          isOver={planUsage.isOver}
          safePerDay={planUsage.safePerDay}
          daysLeft={planUsage.daysLeft}
          onEdit={() => setSheet({ kind: "plan" })}
          testID={testID ? `${testID}-plan` : "finyk-budgets-plan"}
        />

        {/* Limits section */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-sm font-semibold text-fg">
              🔴 Ліміти за категоріями
            </Text>
            <Pressable
              onPress={() => setSheet({ kind: "add" })}
              accessibilityRole="button"
              accessibilityLabel="Додати бюджет"
              testID="finyk-budgets-add"
              className="px-3 py-1.5 rounded-full bg-brand-500"
            >
              <Text className="text-xs font-semibold text-white">+ Додати</Text>
            </Pressable>
          </View>
          {limitBudgets.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-cream-300 px-4 py-6">
              <Text
                className="text-sm text-fg-muted text-center"
                testID="finyk-budgets-limits-empty"
              >
                Ще немає лімітів. Додай перший — і Finyk покаже, скільки
                залишилось до кінця місяця.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {limitBudgets.map((b) => {
                const spent = calcSpent(b.categoryId ?? "");
                const usage = calculateLimitUsage(b, spent);
                return (
                  <LimitBudgetRow
                    key={b.id}
                    budget={b}
                    categoryLabel={
                      labelById.get(b.categoryId ?? "") ?? b.categoryId ?? "—"
                    }
                    spent={usage.spent}
                    pctRaw={usage.pctRaw}
                    pctRounded={usage.pctRounded}
                    remaining={usage.remaining}
                    overLimit={usage.overLimit}
                    warnLimit={usage.warnLimit}
                    trend={limitTrends.get(b.categoryId ?? "") ?? []}
                    onEdit={() => setSheet({ kind: "limit", budget: b })}
                    testID={`finyk-budgets-limit-${b.id}`}
                  />
                );
              })}
            </View>
          )}
        </View>

        {/* Forecast */}
        {forecasts.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-fg px-1">
              📈 Прогноз на кінець місяця
            </Text>
            {forecasts.map((fc) => (
              <BudgetForecastCard
                key={fc.categoryId}
                categoryLabel={
                  labelById.get(fc.categoryId) ?? fc.categoryId ?? "—"
                }
                spent={fc.spent}
                limit={fc.limit}
                forecast={fc.forecast}
                overLimit={Boolean(fc.overLimit)}
                overPercent={fc.overPercent ?? 0}
                dailyData={fc.dailyData ?? []}
                testID={`finyk-budgets-forecast-${fc.categoryId}`}
              />
            ))}
          </View>
        ) : null}

        {/* Goals */}
        <View className="gap-2">
          <Text className="text-sm font-semibold text-fg px-1">
            🟢 Цілі накопичень
          </Text>
          {goalBudgets.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-cream-300 px-4 py-6">
              <Text
                className="text-sm text-fg-muted text-center"
                testID="finyk-budgets-goals-empty"
              >
                Ще немає цілей. Додай ціль — і відстежуй прогрес місяць за
                місяцем.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {goalBudgets.map((b) => {
                const goal = b as GoalBudget;
                const progress = calculateGoalProgress(goal, today);
                const monthlyLabel = getGoalMonthlyLabel(progress);
                return (
                  <GoalBudgetRow
                    key={goal.id}
                    budget={goal}
                    saved={progress.saved}
                    pct={progress.pct}
                    daysLeft={progress.daysLeft}
                    monthlyLabel={monthlyLabel}
                    onEdit={() => setSheet({ kind: "goal", budget: goal })}
                    testID={`finyk-budgets-goal-${goal.id}`}
                  />
                );
              })}
            </View>
          )}
        </View>

        {/* Subscriptions */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-sm font-semibold text-fg">🔁 Підписки</Text>
            <Pressable
              onPress={() =>
                setSheet({ kind: "subscription", subscription: null })
              }
              accessibilityRole="button"
              accessibilityLabel="Додати підписку"
              testID="finyk-budgets-sub-add"
              className="px-3 py-1.5 rounded-full bg-brand-500"
            >
              <Text className="text-xs font-semibold text-white">+ Додати</Text>
            </Pressable>
          </View>
          <View className="rounded-2xl border border-cream-300 bg-white">
            {budgetsStore.subscriptions.length === 0 ? (
              <Text
                className="text-sm text-fg-muted py-4 text-center"
                testID="finyk-budgets-subs-empty"
              >
                Ще немає підписок
              </Text>
            ) : (
              budgetsStore.subscriptions.map((s) => {
                const meta = getSubscriptionAmountMeta(s, txStore.realTx ?? []);
                const explicit =
                  s.monthlyCost != null && Number.isFinite(s.monthlyCost)
                    ? `${s.monthlyCost.toLocaleString("uk-UA")} ${meta.currency}`
                    : null;
                const fromTx =
                  meta.amount != null
                    ? `${meta.amount.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ${meta.currency}`
                    : null;
                const nextDate = nextBillingDate(s.billingDay);
                const nextChargeLabel = nextDate.toLocaleDateString("uk-UA", {
                  day: "numeric",
                  month: "short",
                });
                return (
                  <SubscriptionRow
                    key={s.id}
                    subscription={s}
                    daysToNext={daysToBilling(s.billingDay)}
                    nextChargeLabel={nextChargeLabel}
                    amountLabel={explicit ?? fromTx}
                    onPress={() =>
                      setSheet({ kind: "subscription", subscription: s })
                    }
                    testID={`finyk-budgets-sub-${s.id}`}
                  />
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      <PlanEditSheet
        open={sheet.kind === "plan"}
        onClose={closeSheet}
        initial={planMonthlyValue}
        onSubmit={(next) => budgetsStore.setMonthlyPlan(next)}
        testID="finyk-budgets-plan-sheet"
      />
      <LimitEditSheet
        open={sheet.kind === "limit"}
        onClose={closeSheet}
        budget={sheet.kind === "limit" ? sheet.budget : null}
        categoryLabel={
          sheet.kind === "limit"
            ? (labelById.get(sheet.budget.categoryId ?? "") ??
              sheet.budget.categoryId ??
              "")
            : ""
        }
        onSubmit={upsertBudget}
        onDelete={deleteBudget}
        testID="finyk-budgets-limit-sheet"
      />
      <GoalEditSheet
        open={sheet.kind === "goal"}
        onClose={closeSheet}
        budget={sheet.kind === "goal" ? sheet.budget : null}
        onSubmit={upsertBudget}
        onDelete={deleteBudget}
        testID="finyk-budgets-goal-sheet"
      />
      <AddBudgetSheet
        open={sheet.kind === "add"}
        onClose={closeSheet}
        existingBudgets={budgetsStore.budgets}
        categories={expenseCategoryList}
        onAdd={upsertBudget}
        testID="finyk-budgets-add-sheet"
      />
      <SubscriptionEditSheet
        open={sheet.kind === "subscription"}
        onClose={closeSheet}
        subscription={sheet.kind === "subscription" ? sheet.subscription : null}
        onSubmit={upsertSubscription}
        onDelete={deleteSubscription}
        testID="finyk-budgets-sub-sheet"
      />
    </SafeAreaView>
  );
}

export default BudgetsPage;
