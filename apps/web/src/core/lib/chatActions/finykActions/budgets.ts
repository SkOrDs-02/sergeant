import { ls, lsSet } from "../../hubChatUtils";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import type {
  SetBudgetLimitAction,
  SetMonthlyPlanAction,
  UpdateBudgetAction,
  Budget,
  BudgetLimit,
  BudgetGoal,
  MonthlyPlan,
  ChatActionResult,
} from "../types";

export function setBudgetLimit(action: SetBudgetLimitAction): ChatActionResult {
  const { category_id, limit } = action.input;
  const budgets = ls<Budget[]>("finyk_budgets", []);
  const idx = budgets.findIndex(
    (b) => b.type === "limit" && b.categoryId === category_id,
  );
  if (idx >= 0) {
    (budgets[idx] as BudgetLimit).limit = Number(limit);
  } else {
    budgets.push({
      id: `b_${Date.now()}`,
      type: "limit",
      categoryId: category_id,
      limit: Number(limit),
    });
  }
  lsSet("finyk_budgets", budgets);
  const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
  const cat = resolveExpenseCategoryMeta(category_id, customC);
  return `Ліміт ${cat?.label || category_id} встановлено: ${limit} грн`;
}

export function setMonthlyPlan(action: SetMonthlyPlanAction): ChatActionResult {
  const { income, expense, savings } = action.input;
  const cur = ls<MonthlyPlan>("finyk_monthly_plan", {});
  const next: MonthlyPlan = { ...cur };
  if (income != null && income !== "") next.income = String(income);
  if (expense != null && expense !== "") next.expense = String(expense);
  if (savings != null && savings !== "") next.savings = String(savings);
  lsSet("finyk_monthly_plan", next);
  return `Фінплан місяця оновлено: дохід ${next.income ?? "—"} / витрати ${next.expense ?? "—"} / заощадження ${next.savings ?? "—"} грн/міс`;
}

export function updateBudget(action: UpdateBudgetAction): ChatActionResult {
  const input = action.input;
  const scope = input.scope;
  const budgets = ls<Budget[]>("finyk_budgets", []);
  if (scope === "limit") {
    const categoryId = String(input.category_id || "").trim();
    const limitN = Number(input.limit);
    if (!categoryId) return "Для scope='limit' потрібен category_id.";
    if (!Number.isFinite(limitN) || limitN <= 0)
      return "Для scope='limit' потрібен додатний limit.";
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
    lsSet("finyk_budgets", budgets);
    const customC = ls<unknown[]>("finyk_custom_cats_v1", []);
    const cat = resolveExpenseCategoryMeta(categoryId, customC);
    return `Ліміт ${cat?.label || categoryId} оновлено: ${limitN} грн`;
  }
  if (scope === "goal") {
    const goalName = String(input.name || "").trim();
    const target = Number(input.target_amount);
    if (!goalName) return "Для scope='goal' потрібне name.";
    if (!Number.isFinite(target) || target <= 0)
      return "Для scope='goal' потрібен додатний target_amount.";
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
      g.savedAmount = saved;
      g.name = goalName;
    } else {
      budgets.push({
        id: `b_${Date.now()}`,
        type: "goal",
        name: goalName,
        targetAmount: target,
        savedAmount: saved,
      });
    }
    lsSet("finyk_budgets", budgets);
    return `Ціль "${goalName}" оновлено: ${saved}/${target} грн`;
  }
  return "Невідомий scope для update_budget (очікую 'limit' або 'goal').";
}
