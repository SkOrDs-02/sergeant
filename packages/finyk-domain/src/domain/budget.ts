// Pure domain-шар правил і обчислень, пов'язаних з бюджетами.
// Тут немає React-хуків і немає доступу до localStorage — кожна функція є
// чистою проєкцією вхідних даних. Усі UI/хуки мають викликати саме ці
// функції, а не дублювати формули.
import {
  kyivDayStartMs,
  kyivMondayStartMs,
  toLocalISODate,
} from "@sergeant/shared";
import { getTxStatAmount, calcMonthlyNeeded } from "../utils";
import type {
  Budget,
  GoalBudget,
  LimitBudget,
  RemainingBudget,
  Transaction,
  TxSplitsMap,
} from "./types";

// Поріг, з якого картка бюджету позначається як «увага/попередження»
// (показ проактивних порад у Budgets, alert-бейдж в Overview).
export const BUDGET_WARN_THRESHOLD = 0.8;
// Поріг, з якого бюджет потрапляє до блоку `budgetAlerts` на Overview.
export const BUDGET_ALERT_THRESHOLD = 0.6;

// Лише бюджети типу ліміт / ціль — використовується і в Budgets, і в useBudget.
// Type-guard predicate-и звужують `Budget` union до конкретної гілки, тож
// downstream-код читає `categoryId`/`limit`/`targetAmount` типобезпечно без
// cast-ів (page-audit-05 F15).
export function getLimitBudgets(
  budgets: readonly Budget[] | null | undefined,
): LimitBudget[] {
  return Array.isArray(budgets)
    ? budgets
        .filter((b): b is LimitBudget => b?.type === "limit")
        .map(normalizeLimitBudget)
    : [];
}

export type LimitPeriod = "month" | "week" | "one_time";

export function normalizeLimitBudget<T extends LimitBudget>(
  budget: T,
): T & {
  period: LimitPeriod;
} {
  const period: LimitPeriod =
    budget.period === "week" || budget.period === "one_time"
      ? budget.period
      : "month";
  return { ...budget, period };
}

export function getLimitPeriodRange(
  budget: Pick<LimitBudget, "period" | "createdAt">,
  now: Date = new Date(),
): { startMs: number; endMs: number } {
  const period = budget.period ?? "month";
  const nowMs = now.getTime();
  if (period === "week") {
    return { startMs: kyivMondayStartMs(now), endMs: nowMs };
  }
  if (period === "one_time") {
    const parsed = budget.createdAt ? Date.parse(budget.createdAt) : NaN;
    return {
      startMs: Number.isFinite(parsed)
        ? parsed
        : kyivDayStartMs(toLocalISODate(now)),
      endMs: nowMs,
    };
  }
  const monthKey = `${toLocalISODate(now).slice(0, 7)}-01`;
  return { startMs: kyivDayStartMs(monthKey), endMs: nowMs };
}

export function filterTransactionsForLimitPeriod<
  T extends { time?: number; date?: string },
>(
  transactions: readonly T[],
  budget: Pick<LimitBudget, "period" | "createdAt">,
  now: Date = new Date(),
): T[] {
  const { startMs, endMs } = getLimitPeriodRange(budget, now);
  return transactions.filter((transaction) => {
    const timeMs =
      typeof transaction.time === "number"
        ? transaction.time * 1000
        : transaction.date
          ? Date.parse(transaction.date)
          : NaN;
    return Number.isFinite(timeMs) && timeMs >= startMs && timeMs <= endMs;
  });
}

export function getGoalBudgets(
  budgets: readonly Budget[] | null | undefined,
): GoalBudget[] {
  return Array.isArray(budgets)
    ? budgets.filter((b): b is GoalBudget => b?.type === "goal")
    : [];
}

// Базове відношення spent/limit без округлення. Виділено окремо, щоб
// правила порогів спирались саме на «сирий» відсоток, а UI — на округлений.
function rawPct(spent: number, limit: number) {
  return limit > 0 ? (spent / limit) * 100 : 0;
}

export function calculateRemainingBudget(
  budget: { limit?: number | undefined },
  spent: number,
): RemainingBudget {
  const limit = budget.limit || 0;
  const remaining = Math.max(0, limit - spent);
  const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
  return { remaining, pct, isOver: spent > limit };
}

export function calculateSafeToSpendPerDay(
  remaining: number,
  daysLeft: number,
): number {
  if (daysLeft <= 0) return 0;
  return Math.max(0, Math.floor(remaining / daysLeft));
}

// Повний набір метрик для картки ліміт-бюджету. UI рендерить саме ці поля
// без додаткових обчислень (pctRaw → прогрес-бар, pctRounded → лейбл,
// overLimit/warnLimit → кольорова градація).
export function calculateLimitUsage(
  budget: { limit?: number | undefined },
  spent: number,
) {
  const limit = Number(budget?.limit) || 0;
  const pctRaw = rawPct(spent, limit);
  const pctRounded = Math.min(100, Math.round(pctRaw));
  const overLimit = limit > 0 && pctRaw >= 100;
  const warnLimit = !overLimit && pctRaw >= BUDGET_WARN_THRESHOLD * 100;
  return {
    spent,
    limit,
    pctRaw,
    pctRounded,
    remaining: Math.max(0, limit - spent),
    exceededBy: Math.max(0, spent - limit),
    overLimit,
    warnLimit,
  };
}

// Правило для блоку Overview «бюджети під загрозою» — саме воно визначає,
// чи показувати alert-картку. Порог винесено в константу, щоб Overview
// і Budgets не мали магічних чисел.
export function isBudgetAlert(
  spent: number,
  limit: number,
  threshold: number = BUDGET_ALERT_THRESHOLD,
) {
  const lim = Number(limit);
  return lim > 0 && spent / lim >= threshold;
}

// Правило показу проактивної поради для ліміт-бюджету: або поточні
// витрати вже ≥ 80% ліміту, або прогноз перевищить ліміт.
export function shouldShowProactiveAdvice(
  usage: { pctRaw?: number } | null | undefined,
  forecast: { overLimit?: boolean } | null | undefined,
) {
  const pctRaw = usage?.pctRaw ?? 0;
  const overForecast = Boolean(forecast && forecast.overLimit);
  return pctRaw >= BUDGET_WARN_THRESHOLD * 100 || overForecast;
}

export interface ForecastEntry {
  categoryId: string;
  limit: number;
  spent: number;
  overLimit?: boolean;
}

// Набір прогнозів «під ризиком» (overLimit або spent/limit ≥ threshold).
// Використовується Budgets.jsx для формування ключа кешу й масової підтяжки порад.
export function selectAtRiskForecasts(
  forecasts: readonly ForecastEntry[] | null | undefined,
  threshold: number = BUDGET_WARN_THRESHOLD,
) {
  if (!Array.isArray(forecasts)) return [];
  return forecasts.filter(
    (fc) =>
      fc?.overLimit ||
      (Number(fc?.limit) > 0 && fc.spent / fc.limit >= threshold),
  );
}

// Стабільний рядковий ключ для кешу ("YYYY-MM|catA,catB,…") або "" якщо
// під ризиком нічого немає. Детермінований — готовий як ключ useEffect.
export function buildAtRiskKey(
  forecasts: readonly ForecastEntry[] | null | undefined,
  now: Date = new Date(),
  threshold: number = BUDGET_WARN_THRESHOLD,
) {
  const atRisk = selectAtRiskForecasts(forecasts, threshold);
  if (atRisk.length === 0) return "";
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ids = atRisk.map((fc) => fc.categoryId).sort();
  return `${monthKey}|${ids.join(",")}`;
}

export interface GoalInput {
  targetAmount?: number | string | undefined;
  savedAmount?: number | string | undefined;
  targetDate?: string | null | undefined;
}

// Прогрес цілі накопичення. UI лише форматує повернені числа —
// вся арифметика лишається тут.
export function calculateGoalProgress(
  goal: GoalInput | null | undefined,
  now: Date = new Date(),
) {
  const target = Number(goal?.targetAmount) || 0;
  const saved = Number(goal?.savedAmount) || 0;
  const pct =
    target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const daysLeft = goal?.targetDate
    ? Math.ceil(
        (new Date(goal.targetDate).getTime() - now.getTime()) / 86400000,
      )
    : null;
  const monthly = calcMonthlyNeeded(target, saved, goal?.targetDate);
  return { saved, pct, daysLeft, monthly };
}

// Готовий лейбл для підпису цілі. Виділяємо його сюди, щоб компонент
// GoalBudgetCard залишався суто презентаційним.
export function getGoalMonthlyLabel(
  progress:
    | {
        monthly?: {
          isAchieved?: boolean;
          isOverdue?: boolean;
          monthlyNeeded?: number | null;
        };
      }
    | null
    | undefined,
) {
  if (!progress) return null;
  const { monthly } = progress;
  if (monthly?.isAchieved) return "Ціль досягнута 🎉";
  if (monthly?.isOverdue) return "Термін минув";
  if (monthly?.monthlyNeeded != null) {
    return `Потрібно відкладати: ${monthly.monthlyNeeded.toLocaleString("uk-UA")} ₴/міс.`;
  }
  return null;
}

// Контекст поточного календарного місяця — дати, в межах яких живуть
// усі сумарні метрики Budgets/Overview. `daysLeft` не включає сьогодні,
// `daysPassed` включає.
export function getCurrentMonthContext(now: Date = new Date()) {
  // Anchor the month window to Europe/Kyiv (domain invariant) rather than
  // host-local Date getters, so daysPassed/daysLeft don't drift off-by-one on
  // a non-Kyiv device. `toLocalISODate` returns the Kyiv civil date as
  // `YYYY-MM-DD`; `month` is 1-based here.
  const [year = 1970, month = 1, day = 1] = toLocalISODate(now)
    .split("-")
    .map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysPassed = day;
  const daysLeft = daysInMonth - daysPassed;
  return { monthStart, daysInMonth, daysPassed, daysLeft };
}

// Сума витрат (в грошових одиницях, не копійках) за заданим списком
// транзакцій з урахуванням сплітів. Використовуємо як у Budgets.jsx,
// так і у `getMonthBudgetSummary`.
export function calculateTotalExpenseFact(
  transactions: readonly Transaction[] | null | undefined,
  txSplits: TxSplitsMap = {},
) {
  if (!Array.isArray(transactions)) return 0;
  return Math.round(
    transactions
      .filter((t) => t && t.amount < 0)
      .reduce((s, t) => s + getTxStatAmount(t, txSplits), 0),
  );
}

// Зведення по місячному плану для блоку «Фінплан на місяць».
// Обчислює залишок / % виконання плану / «безпечно на день» в одному місці.
export function getMonthlyPlanUsage(
  {
    planIncome = 0,
    planExpense = 0,
    totalFact = 0,
  }: {
    planIncome?: number | string;
    planExpense?: number | string;
    totalFact?: number | string;
  } = {},
  now: Date = new Date(),
) {
  const income = Number(planIncome) || 0;
  const expense = Number(planExpense) || 0;
  const fact = Number(totalFact) || 0;
  const { daysLeft } = getCurrentMonthContext(now);
  const remaining = Math.max(0, expense - fact);
  const pctExpense =
    expense > 0 ? Math.min(100, Math.round((fact / expense) * 100)) : 0;
  const isOver = expense > 0 && fact > expense;
  const safePerDay = calculateSafeToSpendPerDay(remaining, daysLeft);
  return {
    planIncome: income,
    planExpense: expense,
    totalFact: fact,
    remaining,
    pctExpense,
    isOver,
    safePerDay,
    daysLeft,
  };
}

// --- Валідатори форм бюджетів ----------------------------------------------
// Повертають { error, normalized }. UI лише показує error і застосовує
// normalized до setBudgets, тож уся валідація/нормалізація — тут.

export interface LimitFormInput {
  type?: "limit";
  categoryId?: string;
  limit?: number | string;
  period?: LimitPeriod;
  createdAt?: string;
  [k: string]: unknown;
}

export interface LimitFormNormalized extends LimitFormInput {
  type: "limit";
  limit: number;
  period: LimitPeriod;
}

export interface LimitFormResult {
  error: string | null;
  normalized: LimitFormNormalized | null;
}

export function validateLimitBudgetForm(
  form: LimitFormInput = {},
  existingBudgets: readonly Budget[] = [],
): LimitFormResult {
  if (!form.categoryId) {
    return { error: "Оберіть категорію", normalized: null };
  }
  const limitVal = Number(form.limit);
  if (!form.limit || Number.isNaN(limitVal) || limitVal <= 0) {
    return { error: "Вкажіть ліміт більше 0", normalized: null };
  }
  const dup = (existingBudgets || []).some(
    (b) => b?.type === "limit" && b.categoryId === form.categoryId,
  );
  if (dup) {
    return { error: "Ліміт для цієї категорії вже існує", normalized: null };
  }
  return {
    error: null,
    normalized: {
      ...form,
      type: "limit" as const,
      limit: limitVal,
      period: form.period ?? "month",
    },
  };
}

export interface GoalFormInput {
  type?: "goal";
  name?: string;
  targetAmount?: number | string;
  savedAmount?: number | string;
  [k: string]: unknown;
}

export interface GoalFormNormalized extends GoalFormInput {
  type: "goal";
  targetAmount: number;
  savedAmount: number;
}

export interface GoalFormResult {
  error: string | null;
  normalized: GoalFormNormalized | null;
}

export function validateGoalBudgetForm(
  form: GoalFormInput = {},
): GoalFormResult {
  if (!form.name || !String(form.name).trim()) {
    return { error: "Вкажіть назву цілі", normalized: null };
  }
  const targetVal = Number(form.targetAmount);
  if (!form.targetAmount || Number.isNaN(targetVal) || targetVal <= 0) {
    return { error: "Вкажіть суму цілі більше 0", normalized: null };
  }
  const savedVal = Number(form.savedAmount || 0);
  if (savedVal < 0) {
    return {
      error: "Відкладена сума не може бути від'ємною",
      normalized: null,
    };
  }
  return {
    error: null,
    normalized: {
      ...form,
      type: "goal" as const,
      targetAmount: targetVal,
      savedAmount: savedVal,
    },
  };
}
