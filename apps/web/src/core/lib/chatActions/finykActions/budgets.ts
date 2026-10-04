// Chat-action executors run outside React. Стан читається з SQLite warm
// cache (`warmFinykCache`), а не з kv — див. warmCache.ts (data-08).
import { finykChatWrite } from "./dualWriteBridge";
import { FINYK_COLD_CACHE_MESSAGE, warmFinykCache } from "./warmCache";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import {
  finykCategoryExists,
  normalizeFinykId,
  unknownCategoryMessage,
} from "./entityLookup";
import { validatePositiveAmount } from "./amountValidation";
import {
  formatNumberUk,
  generatePrefixedId,
  toKyivISODate,
} from "@sergeant/shared";
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
      id: generatePrefixedId("contrib"),
      amountUah: saved,

      date: toKyivISODate(new Date()),
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
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  // B39: reversible overwrite (canon §8 / founder decision). `cache.budgets`
  // лишається недоторканим знімком (undo), мутації йдуть у глибокій копії.
  const prevBudgets = cache.budgets as Budget[];
  const budgets = structuredClone(prevBudgets);
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
      id: generatePrefixedId("b"),
      type: "limit",
      categoryId,
      limit: limitN,
      period,
      createdAt: new Date().toISOString(),
    });
  }
  finykChatWrite("finyk_budgets", budgets);
  const cat = resolveExpenseCategoryMeta(categoryId, cache.customCategories);
  const periodLabel =
    period === "week"
      ? "на тиждень"
      : period === "one_time"
        ? "одноразово"
        : "на місяць";
  const result = `Ліміт ${cat?.label || categoryId} встановлено: ${formatNumberUk(limitN)}\u202F₴ ${periodLabel}`;
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
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  // data-08: база — канонічний план із SQLite (там його пише UI, у т.ч. з
  // іншого пристрою), а не порожній kv: інакше частковий виклик стирав решту
  // полів, а undo — увесь план.
  // B39: reversible overwrite — знімок попереднього плану беремо звідти ж;
  // `undo` пише його назад дослівно.
  const prevPlan: MonthlyPlan = structuredClone(
    (cache.monthlyPlan ?? {}) as MonthlyPlan,
  );
  const next: MonthlyPlan = { ...prevPlan };
  for (const [key, raw, label] of fields) {
    if (raw == null || raw === "") continue;
    const check = validatePositiveAmount(raw, label);
    if (!check.ok) return check.message;
    next[key] = String(check.value);
  }
  finykChatWrite("finyk_monthly_plan", next);
  const fmtField = (v: string | undefined): string => {
    if (v === undefined) return "—";
    const n = Number(v);
    return Number.isFinite(n) ? formatNumberUk(n) : v;
  };
  const result = `План місяця оновлено: дохід ${fmtField(next.income)} / витрати ${fmtField(next.expense)} / заощадження ${fmtField(next.savings)}\u202F₴/міс`;
  return {
    result,
    undo: () => finykChatWrite("finyk_monthly_plan", prevPlan),
  };
}

export function updateBudget(action: UpdateBudgetAction): ChatActionResult {
  const input = action.input;
  const scope = input.scope;
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  // B39: reversible overwrite — `cache.budgets` лишається недоторканим
  // знімком, обидві гілки мутують глибоку копію.
  const prevBudgets = cache.budgets as Budget[];
  const budgets = structuredClone(prevBudgets);
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
        id: generatePrefixedId("b"),
        type: "limit",
        categoryId,
        limit: limitN,
      });
    }
    finykChatWrite("finyk_budgets", budgets);
    const cat = resolveExpenseCategoryMeta(categoryId, cache.customCategories);
    const result = `Ліміт ${cat?.label || categoryId} оновлено: ${formatNumberUk(limitN)}\u202F₴`;
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
        id: generatePrefixedId("b"),
        type: "goal",
        name: goalName,
        targetAmount: target,
        savedAmount: 0,
        contributions: buildAiContribution(saved),
      });
    }
    finykChatWrite("finyk_budgets", budgets);
    const result = `Ціль "${goalName}" оновлено: ${formatNumberUk(saved)}/${formatNumberUk(target)}\u202F₴`;
    return {
      result,
      undo: () => finykChatWrite("finyk_budgets", prevBudgets),
    };
  }
  return "Невідомий scope для update_budget (очікую 'limit' або 'goal').";
}
