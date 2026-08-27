// Pure domain-шар правил і обчислень, повʼязаних з бюджетами.
// Тут немає React-хуків і немає доступу до localStorage — кожна функція є
// чистою проєкцією вхідних даних. Усі UI/хуки мають викликати саме ці
// функції, а не дублювати формули.
import {
  kyivDayEndMs,
  kyivDayStartMs,
  kyivMondayStartMs,
  toLocalISODate,
  formatNumberUk,
} from "@sergeant/shared";
import { getTxStatAmount, calcMonthlyNeeded } from "../utils";
import type {
  Budget,
  GoalBudget,
  GoalContribution,
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

/**
 * Повний набір категорій ліміту з дедупом і фолбеком на legacy `categoryId`.
 * Єдина точка читання пари `categoryId`/`categoryIds` — щоб жоден екран не
 * вигадував власного пріоритету полів.
 */
export function limitBudgetCategoryIds(
  budget: Pick<LimitBudget, "categoryId" | "categoryIds">,
): string[] {
  const raw =
    Array.isArray(budget.categoryIds) && budget.categoryIds.length > 0
      ? budget.categoryIds
      : [budget.categoryId];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function normalizeLimitBudget<T extends LimitBudget>(
  budget: T,
): T & {
  period: LimitPeriod;
  categoryIds: string[];
} {
  const period: LimitPeriod =
    budget.period === "week" || budget.period === "one_time"
      ? budget.period
      : "month";
  // `categoryId` завжди = перша категорія набору: legacy-читачі (mobile,
  // insights, старі бекапи) продовжують бачити валідний одно-категорійний
  // запис без міграції даних.
  const categoryIds = limitBudgetCategoryIds(budget);
  return {
    ...budget,
    period,
    categoryIds,
    categoryId: categoryIds[0] ?? budget.categoryId ?? "",
  };
}

/**
 * Підпис картки ліміту. Пріоритет: власна назва → підпис єдиної категорії →
 * «A + B» для двох → «A + ще N» для трьох і більше. `resolveCategoryLabel`
 * приходить з поверхні (web/mobile мають різні резолвери мета-даних).
 */
export function formatLimitBudgetLabel(
  budget: Pick<LimitBudget, "label" | "categoryId" | "categoryIds">,
  resolveCategoryLabel: (categoryId: string) => string | null | undefined,
): string {
  const custom = budget.label?.trim();
  if (custom) return custom;
  const labels = limitBudgetCategoryIds(budget).map(
    (id) => resolveCategoryLabel(id)?.trim() || id,
  );
  const first = labels[0];
  if (!first) return "";
  if (labels.length === 1) return first;
  if (labels.length === 2) return `${first} + ${labels[1]}`;
  return `${first} + ще ${labels.length - 1}`;
}

/**
 * Наявні ліміти, що перетинаються з набором категорій (рішення «дозволити
 * з попередженням»): перетин НЕ блокує створення, але форма показує підказку,
 * що витрати цих категорій рахуватимуться в обох лімітах.
 */
export function findLimitCategoryOverlaps(
  categoryIds: readonly string[],
  existingBudgets: readonly Budget[] | null | undefined,
  options: { excludeBudgetId?: string } = {},
): { budget: LimitBudget; categoryIds: string[] }[] {
  const wanted = new Set(categoryIds.filter(Boolean));
  if (wanted.size === 0) return [];
  const out: { budget: LimitBudget; categoryIds: string[] }[] = [];
  for (const b of getLimitBudgets(existingBudgets)) {
    if (options.excludeBudgetId && b.id === options.excludeBudgetId) continue;
    const shared = limitBudgetCategoryIds(b).filter((id) => wanted.has(id));
    if (shared.length > 0) out.push({ budget: b, categoryIds: shared });
  }
  return out;
}

/**
 * Стабільний рядковий ключ набору категорій ліміту (sorted join). Ключ
 * кешів/запитів проактивних порад: зміна складу комбо → інший ключ →
 * свіжа порада, без ручної інвалідації.
 */
export function limitBudgetCategoryKey(
  budget: Pick<LimitBudget, "categoryId" | "categoryIds">,
): string {
  return [...limitBudgetCategoryIds(budget)].sort().join("+");
}

/** Точний збіг наборів категорій (незалежно від порядку). */
export function isSameLimitCategorySet(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((id, i) => id === sortedB[i]);
}

export function getLimitPeriodRange(
  budget: Pick<LimitBudget, "period" | "createdAt">,
  now: Date = new Date(),
): { startMs: number; endMs: number } {
  const period = budget.period ?? "month";
  // Верхня межа — КІНЕЦЬ поточної київської доби, а не `now`.
  //
  // AI-DANGER: ручний запис не має реального інстанта — форма штампує день
  // о 12:00 UTC (`toExpenseInstant`, `manualExpenseForm.ts`), тобто 15:00 за
  // Києвом. З межею на `now` витрата, додана сьогодні вранці, лежала В
  // МАЙБУТНЬОМУ відносно вікна і випадала з власного ліміту до 15:00 —
  // бюджет показував нуль там, де людина щойно записала витрату
  // (знахідка суміжного фіксу до F-19, браузерний QA 2026-08-24).
  // Кінець доби лишає в силі початковий намір «не рахувати майбутнє»:
  // записи завтрашнім і пізнішим днем так само за межею.
  const endMs = kyivDayEndMs(toLocalISODate(now));
  if (period === "week") {
    return { startMs: kyivMondayStartMs(now), endMs };
  }
  if (period === "one_time") {
    const parsed = budget.createdAt ? Date.parse(budget.createdAt) : NaN;
    return {
      startMs: Number.isFinite(parsed)
        ? parsed
        : kyivDayStartMs(toLocalISODate(now)),
      endMs,
    };
  }
  const monthKey = `${toLocalISODate(now).slice(0, 7)}-01`;
  return { startMs: kyivDayStartMs(monthKey), endMs };
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

// Сума ручних поповнень цілі. Чиста арифметика — не знає ні про банку, ні
// про storage; викликач передає лише масив.
export function sumGoalContributions(
  contributions: readonly GoalContribution[] | null | undefined,
): number {
  if (!Array.isArray(contributions)) return 0;
  return contributions.reduce((s, c) => s + (Number(c?.amountUah) || 0), 0);
}

export interface GoalSavedInput {
  contributions?: readonly GoalContribution[] | undefined;
  /** Баланс привʼязаної банки в гривнях (UAH), вже сконвертований з копійок. */
  linkedJarBalanceUah?: number | undefined;
}

// Прогрес цілі накопичення (design decision #1, goal-progress-auto-sync):
// прогрес = баланс привʼязаної банки (якщо є) + сума ручних поповнень.
// Обидва джерела співіснують — банка тягнеться з mono, поповнення додаються
// поверх (готівка/інші джерела).
export function calculateGoalSavedAmount(goal: GoalSavedInput): number {
  const fromJar = Number(goal.linkedJarBalanceUah) || 0;
  const fromContributions = sumGoalContributions(goal.contributions);
  return fromJar + fromContributions;
}

// Міграція без втрат (design decision #4): наявний `savedAmount > 0`
// конвертується в перший запис логу поповнень один раз. Ідемпотентна —
// ціль з уже непорожнім `contributions` повертається без змін, тож повторний
// виклик на кожному читанні `getBudget()` безпечний.
export function migrateGoalSavedAmountToContribution(
  goal: GoalBudget,
  migrationDate: string,
): GoalBudget {
  if (Array.isArray(goal.contributions) && goal.contributions.length > 0) {
    return goal;
  }
  if (!goal.savedAmount || goal.savedAmount <= 0) {
    return { ...goal, contributions: goal.contributions ?? [] };
  }
  return {
    ...goal,
    contributions: [
      {
        id: `mig_${goal.id}`,
        amountUah: goal.savedAmount,
        date: migrationDate,
        note: "Початковий залишок",
      },
    ],
  };
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
  if (monthly?.isAchieved) return "Ціль досягнута";
  if (monthly?.isOverdue) return "Термін минув";
  if (monthly?.monthlyNeeded != null) {
    return `Потрібно відкладати: ${formatNumberUk(monthly.monthlyNeeded)} ₴/міс.`;
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
  categoryIds?: string[];
  limit?: number | string;
  period?: LimitPeriod;
  createdAt?: string;
  [k: string]: unknown;
}

export interface LimitFormNormalized extends LimitFormInput {
  type: "limit";
  categoryId: string;
  categoryIds: string[];
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
  const categoryIds = limitBudgetCategoryIds({
    categoryId: form.categoryId ?? "",
    ...(form.categoryIds ? { categoryIds: form.categoryIds } : {}),
  });
  if (categoryIds.length === 0) {
    return { error: "Оберіть категорію", normalized: null };
  }
  const limitVal = Number(form.limit);
  if (!form.limit || Number.isNaN(limitVal) || limitVal <= 0) {
    return { error: "Вкажіть ліміт більше 0", normalized: null };
  }
  // Дублікатом вважається лише ТОЧНО такий самий набір категорій; частковий
  // перетин дозволений свідомо (окремий «Кафе» + комбо «Їжа» співіснують),
  // форма супроводжує його попередженням через `findLimitCategoryOverlaps`.
  const dup = (existingBudgets || []).some(
    (b) =>
      b?.type === "limit" &&
      isSameLimitCategorySet(limitBudgetCategoryIds(b), categoryIds),
  );
  if (dup) {
    return {
      error:
        categoryIds.length > 1
          ? "Ліміт для цього набору категорій вже існує"
          : "Ліміт для цієї категорії вже існує",
      normalized: null,
    };
  }
  return {
    error: null,
    normalized: {
      ...form,
      type: "limit" as const,
      categoryId: categoryIds[0] ?? "",
      categoryIds,
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
      error: "Відкладена сума не може бути відʼємною",
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
