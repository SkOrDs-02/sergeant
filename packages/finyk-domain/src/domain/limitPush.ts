/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Прогрес лімітів Фініка для push на 80 % і 100 % (Ф-4 (б), спека
 * `docs/work/specs/finyk-limit-and-recurring-push.md`).
 *
 * AI-CONTEXT: екран Планування і серверний push мусять показати одне число.
 * Тому підготовка операцій (виключення зі статистики, правила мерчанта) і
 * сума по ліміту живуть тут, а веб (`Budgets.tsx`) кличе ті самі функції.
 * Шкала порогів одна на всі поверхні: `LIMIT_THRESHOLDS` / `limitSignal`
 * (`budget.ts`). Періоди фінансові, тож за Києвом (ADR-0078): місяць і
 * ISO-тиждень з понеділка. Разовий ліміт (`one_time`) не має періоду, і
 * ключ дедупу на ньому зник би через 45 днів ретенції журналу: у push не йде.
 */
import { kyivMondayStartMs, toKyivISODate } from "@sergeant/shared";
import {
  calcLimitBudgetSpent,
  calculateLimitUsage,
  getLimitBudgets,
  limitBudgetCategoryIds,
  limitSignal,
  type LimitPeriod,
} from "./budget.js";
import { filterStatTransactions } from "./transactions.js";
import { withMerchantRuleOverrides } from "../lib/merchantRuleOverrides.js";
import type { MerchantRuleIndex } from "../lib/merchantRules.js";
import type {
  Budget,
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "./types";

export type FinykLimitThreshold = 80 | 100;

/** Пороги, які вже досягнуто при `pctRaw` (за єдиною шкалою). */
export function reachedLimitThresholds(pctRaw: number): FinykLimitThreshold[] {
  const signal = limitSignal(pctRaw);
  if (signal === "over") return [80, 100];
  if (signal === "warn") return [80];
  return [];
}

/**
 * Найвищий поріг, який перетнула подія, що підняла відсоток з `prevPctRaw`
 * до `nextPctRaw`; `null`, коли нового перетину немає.
 */
export function limitThresholdCrossed(
  prevPctRaw: number,
  nextPctRaw: number,
): FinykLimitThreshold | null {
  const before = new Set(reachedLimitThresholds(prevPctRaw));
  const fresh = reachedLimitThresholds(nextPctRaw).filter(
    (t) => !before.has(t),
  );
  return fresh.length > 0 ? fresh[fresh.length - 1]! : null;
}

/** ISO-тиждень `YYYY-Www` для київського дня `YYYY-MM-DD`. */
function isoWeekKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = понеділок
  // Четвер цього тижня визначає рік тижня (ISO 8601).
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const weekYear = date.getUTCFullYear();
  const dayOfYear =
    (date.getTime() - Date.UTC(weekYear, 0, 1)) / 86_400_000 + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * Ключ періоду ліміту на момент `nowMs`: `YYYY-MM` для місячного (і legacy
 * без `period`), `YYYY-Www` для тижневого, `null` для разового.
 */
export function finykLimitPeriodKey(
  budget: { period?: LimitPeriod | undefined },
  nowMs: number,
): string | null {
  const period = budget.period ?? "month";
  if (period === "one_time") return null;
  if (period === "week") {
    return isoWeekKey(toKyivISODate(kyivMondayStartMs(nowMs)));
  }
  return toKyivISODate(nowMs).slice(0, 7);
}

/** Ключ дедупу `push_reminder_log` для порога ліміту. */
export function finykLimitDedupKey(
  budgetId: string,
  periodKey: string,
  threshold: FinykLimitThreshold,
): string {
  return `finyk_limit_${budgetId}_${periodKey}_${threshold}`;
}

export interface FinykLimitSpendContextInput {
  /** Банк (копійки) + ручні записи через `manualExpenseToTransaction`. */
  transactions: readonly Transaction[];
  /** Канонічний набір `buildFinykExcludedTxIds` (приховані, виключені, перекази…). */
  excludedTxIds?: Iterable<string> | null | undefined;
  /** Явні категорії операцій (`finyk_tx_categories`). */
  txCategories?: TxCategoriesMap | undefined;
  /** Правила «Завжди так для цього магазину». */
  merchantRuleIndex?: MerchantRuleIndex | null | undefined;
  customCategories?: readonly unknown[] | undefined;
}

export interface FinykLimitSpendContext {
  /** Операції без виключених зі статистики; БЕЗ місячного кліпу. */
  statTx: Transaction[];
  /** Явні категорії плюс виведені правилами мерчанта. */
  txCategories: TxCategoriesMap;
}

/**
 * Підготовка операцій до рахунку лімітів: одна для екрана Планування і
 * push. Вікно періоду кожен ліміт накладає сам, тож історію не кліпаємо.
 */
export function prepareFinykLimitSpendContext({
  transactions,
  excludedTxIds,
  txCategories = {},
  merchantRuleIndex,
  customCategories = [],
}: FinykLimitSpendContextInput): FinykLimitSpendContext {
  const statTx = filterStatTransactions(
    transactions as Transaction[],
    excludedTxIds ?? [],
  );
  return {
    statTx,
    txCategories: withMerchantRuleOverrides(
      statTx,
      txCategories,
      merchantRuleIndex,
      customCategories,
    ),
  };
}

export interface FinykLimitProgressInput extends FinykLimitSpendContextInput {
  budgets: readonly Budget[] | null | undefined;
  txSplits?: TxSplitsMap | undefined;
  nowMs: number;
}

export interface FinykLimitProgress {
  budgetId: string;
  period: "month" | "week";
  periodKey: string;
  categoryIds: string[];
  /** Витрачено за період, копійки. */
  spentMinor: number;
  /** Сума ліміту, копійки. */
  limitMinor: number;
  /** Сирий відсоток, як на картці ліміту. */
  pctRaw: number;
  /** Досягнуті пороги, зростаючи. */
  reached: FinykLimitThreshold[];
}

/**
 * Прогрес кожного активного місячного й тижневого ліміту на `nowMs`.
 * Разові ліміти й ліміти без суми чи категорій пропускаються.
 */
export function calcFinykLimitProgress(
  input: FinykLimitProgressInput,
): FinykLimitProgress[] {
  const { budgets, txSplits = {}, customCategories = [], nowMs } = input;
  const ctx = prepareFinykLimitSpendContext(input);
  const now = new Date(nowMs);
  const out: FinykLimitProgress[] = [];
  for (const budget of getLimitBudgets(budgets)) {
    const periodKey = finykLimitPeriodKey(budget, nowMs);
    if (periodKey === null) continue;
    const categoryIds = limitBudgetCategoryIds(budget);
    if (categoryIds.length === 0 || !(Number(budget.limit) > 0)) continue;
    const spent = calcLimitBudgetSpent(budget, ctx.statTx, {
      txCategories: ctx.txCategories,
      txSplits,
      customCategories,
      now,
    });
    const usage = calculateLimitUsage(budget, spent);
    out.push({
      budgetId: budget.id,
      period: budget.period === "week" ? "week" : "month",
      periodKey,
      categoryIds,
      spentMinor: Math.round(spent * 100),
      limitMinor: Math.round(usage.limit * 100),
      pctRaw: usage.pctRaw,
      reached: reachedLimitThresholds(usage.pctRaw),
    });
  }
  return out;
}

export interface FinykLimitPushVerdict {
  /** Про який поріг слати push; `null` — не слати. */
  notify: FinykLimitThreshold | null;
  /** Ключі, які треба застовпити в `push_reminder_log` (усі незайняті досягнуті). */
  claimKeys: string[];
}

/**
 * Вердикт без стану: які досягнуті пороги ще не застовплені в журналі.
 * Якщо незайнятих два (стрибок через 80 % одразу за 100 %), push один, про
 * 100 %, а займаються обидва ключі.
 */
export function finykLimitPushVerdict(
  progress: Pick<FinykLimitProgress, "budgetId" | "periodKey" | "reached">,
  claimedKeys: ReadonlySet<string>,
): FinykLimitPushVerdict {
  const fresh = progress.reached.filter(
    (t) =>
      !claimedKeys.has(
        finykLimitDedupKey(progress.budgetId, progress.periodKey, t),
      ),
  );
  if (fresh.length === 0) return { notify: null, claimKeys: [] };
  return {
    notify: fresh[fresh.length - 1]!,
    claimKeys: fresh.map((t) =>
      finykLimitDedupKey(progress.budgetId, progress.periodKey, t),
    ),
  };
}
