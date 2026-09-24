/* eslint-disable sergeant-design/no-raw-storage-key --
   Chat-action executors run outside React; storage key strings are used
   directly here. Same pattern as queryFinykActions.ts. */
import { ls } from "../../hubChatUtils";
import { finykChatWrite } from "./dualWriteBridge";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import {
  finykCategoryExists,
  normalizeFinykId,
  unknownCategoryMessage,
} from "./entityLookup";
import { validatePositiveAmount } from "./amountValidation";
import { toLocalISODate } from "@sergeant/shared";
import type {
  SetBudgetLimitAction,
  SetMonthlyPlanAction,
  UpdateBudgetAction,
  Budget,
  BudgetLimit,
  BudgetGoal,
  GoalContribution,
  MonthlyPlan,
  ChatActionResult,
} from "../types";

// Ціль накопичення більше не має редагованого числа «Відкладено» —
// AI-екшн `update_budget(scope: "goal")` й далі приймає `saved_amount` як
// абсолютну суму (той самий контракт, що й раніше), але тепер записує її
// як єдиний запис логу поповнень замість прямого поля (goal-progress-
// auto-sync). Порожній `saved_amount` (0) → порожній лог, як і раніше.
function buildAiContribution(saved: number): GoalContribution[] {
  if (saved <= 0) return [];
  return [
    {
      id: `contrib_${Date.now()}`,
      amountUah: saved,

      date: toLocalISODate(new Date()),
      note: "Через Сержанта",
    },
  ];
}

export function setBudgetLimit(action: SetBudgetLimitAction): ChatActionResult {
  const { limit, period = "month" } = action.input;
  const categoryId = normalizeFinykId(action.input.category_id);
  if (!finykCategoryExists(categoryId))
    return unknownCategoryMessage(categoryId);
  const limitCheck = validatePositiveAmount(limit, "limit");
  if (!limitCheck.ok) return limitCheck.message;
  const limitN = limitCheck.value;
  const budgets = ls<Budget[]>("finyk_budgets", []);
  // B39: reversible overwrite (canon §8 / founder decision) — snapshot the
  // ENTIRE array before mutating, since entries are mutated in place below
  // and `ls()` re-parses storage on every call (so re-reading after the
  // write would return the already-mutated state, not the previous one).
  const prevBudgets = structuredClone(budgets);
  const idx = budgets.findIndex(
    (b) => b.type === "limit" && b.categoryId === categoryId,
  );
  if (idx >= 0) {
    (budgets[idx] as BudgetLimit).limit = limitN;
    (budgets[idx] as BudgetLimit).period = period;
    if (period === "one_time" && !(budgets[idx] as BudgetLimit).createdAt) {
      (budgets[idx] as BudgetLimit).createdAt = new Date().toISOString();
    }
  } else {
    budgets.push({
      id: `b_${Date.now()}`,
      type: "limit",
      categoryId,
      limit: limitN,
      period,
      createdAt: new Date().toISOString(),
    });
  }
  finykChatWrite("finyk_budgets", budgets);
  const customC = getCachedFinykSqliteState().customCategories;
  const cat = resolveExpenseCategoryMeta(categoryId, customC);
  const periodLabel =
    period === "week"
      ? "на тиждень"
      : period === "one_time"
        ? "одноразово"
        : "на місяць";
  const result = `Ліміт ${cat?.label || categoryId} встановлено: ${limitN} грн ${periodLabel}`;
  return {
    result,
    undo: () => finykChatWrite("finyk_budgets", prevBudgets),
  };
}

export function setMonthlyPlan(action: SetMonthlyPlanAction): ChatActionResult {
  const { income, expense, savings } = action.input;
  // Each field is optional — a call may only touch one of the three — but
  // whichever ARE provided must survive the same finite/positive/ceiling
  // guard as everything else, not a bare `String(x)` of whatever the model
  // sent (previously NaN/negative/"1e12" all landed verbatim).
  const fields: ReadonlyArray<
    readonly [key: keyof MonthlyPlan, raw: typeof income, label: string]
  > = [
    ["income", income, "income"],
    ["expense", expense, "expense"],
    ["savings", savings, "savings"],
  ];
  const cur = ls<MonthlyPlan>("finyk_monthly_plan", {});
  // B39: reversible overwrite — snapshot the previous plan before writing
  // the merged one; `undo` writes it back verbatim.
  const prevPlan = structuredClone(cur);
  const next: MonthlyPlan = { ...cur };
  for (const [key, raw, label] of fields) {
    if (raw == null || raw === "") continue;
    const check = validatePositiveAmount(raw, label);
    if (!check.ok) return check.message;
    next[key] = String(check.value);
  }
  finykChatWrite("finyk_monthly_plan", next);
  const result = `Фінплан місяця оновлено: дохід ${next.income ?? "—"} / витрати ${next.expense ?? "—"} / заощадження ${next.savings ?? "—"} грн/міс`;
  return {
    result,
    undo: () => finykChatWrite("finyk_monthly_plan", prevPlan),
  };
}

export function updateBudget(action: UpdateBudgetAction): ChatActionResult {
  const input = action.input;
  const scope = input.scope;
  const budgets = ls<Budget[]>("finyk_budgets", []);
  // B39: reversible overwrite — snapshot BEFORE either branch mutates an
  // entry in place. Taken unconditionally (validation returns below don't
  // write anything, so the snapshot is simply unused in that path).
  const prevBudgets = structuredClone(budgets);
  if (scope === "limit") {
    const categoryId = normalizeFinykId(input.category_id);
    if (!categoryId) return "Для scope='limit' потрібен category_id.";
    const limitCheck = validatePositiveAmount(input.limit, "limit");
    if (!limitCheck.ok) return limitCheck.message;
    const limitN = limitCheck.value;
    if (!finykCategoryExists(categoryId))
      return unknownCategoryMessage(categoryId);
    const idx = budgets.findIndex(
      (b) => b.type === "limit" && b.categoryId === categoryId,
    );
    if (idx >= 0) {
      (budgets[idx] as BudgetLimit).limit = limitN;
    } else {
      budgets.push({
        id: `b_${Date.now()}`,
        type: "limit",
        categoryId,
        limit: limitN,
      });
    }
    finykChatWrite("finyk_budgets", budgets);
    const customC = getCachedFinykSqliteState().customCategories;
    const cat = resolveExpenseCategoryMeta(categoryId, customC);
    const result = `Ліміт ${cat?.label || categoryId} оновлено: ${limitN} грн`;
    return {
      result,
      undo: () => finykChatWrite("finyk_budgets", prevBudgets),
    };
  }
  if (scope === "goal") {
    const goalName = String(input.name || "").trim();
    if (!goalName) return "Для scope='goal' потрібне name.";
    const targetCheck = validatePositiveAmount(
      input.target_amount,
      "target_amount",
    );
    if (!targetCheck.ok) return targetCheck.message;
    const target = targetCheck.value;
    const saved =
      input.saved_amount != null && Number.isFinite(Number(input.saved_amount))
        ? Number(input.saved_amount)
        : 0;
    const idx = budgets.findIndex(
      (b) =>
        b.type === "goal" &&
        (b as BudgetGoal).name.trim().toLowerCase() === goalName.toLowerCase(),
    );
    if (idx >= 0) {
      const g = budgets[idx] as BudgetGoal;
      g.targetAmount = target;
      g.name = goalName;
      g.contributions = buildAiContribution(saved);
    } else {
      budgets.push({
        id: `b_${Date.now()}`,
        type: "goal",
        name: goalName,
        targetAmount: target,
        savedAmount: 0,
        contributions: buildAiContribution(saved),
      });
    }
    finykChatWrite("finyk_budgets", budgets);
    const result = `Ціль "${goalName}" оновлено: ${saved}/${target} грн`;
    return {
      result,
      undo: () => finykChatWrite("finyk_budgets", prevBudgets),
    };
  }
  return "Невідомий scope для update_budget (очікую 'limit' або 'goal').";
}
