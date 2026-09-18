// Pure analytics selectors for the Finyk module.
// Every function here is a pure projection from the passed-in data —
// no `localStorage`, no `window`, no side effects — so it is safe to
// wrap in `useMemo` or call from tests.
import {
  getTxStatAmount,
  getExpenseCategoryForTransaction,
  resolveExpenseCategoryMeta,
  txTimeMs,
} from "../utils";
import { INTERNAL_TRANSFER_ID } from "../constants";
import type {
  AnalyticsResult,
  Category,
  CategorySpendIndex,
  MerchantStat,
  MonthFilter,
  MonthlySummary,
  PeriodComparison,
  SelectorOptions,
  TopCategory,
  Transaction,
  TrendComparison,
  TxSplit,
  TxSplitsMap,
} from "./types";
import { getCatColor } from "./categories";
import { formatNumberUk } from "@sergeant/shared";

type MonthPredicate = (tx: Transaction | null | undefined) => boolean;

// Turn a "YYYY-MM" string or a {year, month} object into a predicate
// that matches a tx's local calendar month. Returns null when no month
// filter is requested — callers should treat null as "include all".
function buildMonthPredicate(month: MonthFilter): MonthPredicate | null {
  if (!month) return null;
  let y: number;
  let m: number;
  if (typeof month === "string") {
    const [ys, ms] = month.split("-");
    y = Number(ys);
    m = Number(ms);
  } else if (typeof month === "object") {
    y = Number(month.year);
    m = Number(month.month);
  } else {
    return null;
  }
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return (tx) => {
    if (!tx || !tx.time) return false;
    const d = new Date(txTimeMs(tx.time));
    return d.getFullYear() === y && d.getMonth() + 1 === m;
  };
}

// Normalize the optional filter bag so selectors can accept either a
// plain options object or a shorthand month string as their second arg.
function normalizeOpts(
  optsOrMonth: SelectorOptions | string | null | undefined,
): SelectorOptions {
  if (optsOrMonth == null) return {};
  if (typeof optsOrMonth === "string") return { month: optsOrMonth };
  return optsOrMonth;
}

function toExcludedSet(
  excluded: SelectorOptions["excludedTxIds"],
): Set<string> {
  if (excluded instanceof Set) return excluded;
  return new Set<string>(excluded || []);
}

// Aggregated totals for a list of transactions (optionally scoped to
// a single calendar month). Pure — never touches storage.
export function getMonthlySummary(
  transactions: readonly Transaction[] | null | undefined,
  optsOrMonth?: SelectorOptions | string | null,
): MonthlySummary {
  const opts = normalizeOpts(optsOrMonth);
  const {
    excludedTxIds = new Set<string>(),
    txSplits = {} as TxSplitsMap,
    month = null,
  } = opts;
  const list = Array.isArray(transactions) ? transactions : [];
  const excluded = toExcludedSet(excludedTxIds);
  const inMonth = buildMonthPredicate(month);
  let spent = 0;
  let income = 0;
  let txCount = 0;

  for (const tx of list) {
    if (!tx || excluded.has(tx.id)) continue;
    if (inMonth && !inMonth(tx)) continue;
    txCount++;
    if (tx.amount < 0) spent += getTxStatAmount(tx, txSplits);
    else income += tx.amount / 100;
  }

  spent = Math.round(spent);
  income = Math.round(income);
  // `spent`/`income` keep backwards compatibility with existing callers,
  // `totalExpense`/`totalIncome` expose the same numbers under the
  // public selector contract.
  return {
    spent,
    income,
    balance: income - spent,
    txCount,
    totalExpense: spent,
    totalIncome: income,
  };
}

// Heaviest step of category analytics: iterates every expense transaction
// once, resolves a category per tx (or per split) and aggregates spend.
// Shared by `getTopCategories` / `getCategoryDistribution` / hooks so the
// transaction list is scanned at most once per (tx + filters) change.
export function computeCategorySpendIndex(
  transactions: readonly Transaction[] | null | undefined,
  {
    txCategories = {},
    txSplits = {} as TxSplitsMap,
    customCategories = [] as Category[],
    excludedTxIds = new Set<string>(),
    month = null,
  }: SelectorOptions = {},
): CategorySpendIndex {
  const list = Array.isArray(transactions) ? transactions : [];
  const excluded = toExcludedSet(excludedTxIds);
  const inMonth = buildMonthPredicate(month);
  const catSpend: Record<string, number> = {};
  let totalSpent = 0;

  for (const tx of list) {
    if (!tx || excluded.has(tx.id) || tx.amount >= 0) continue;
    if (inMonth && !inMonth(tx)) continue;
    const splits: TxSplit[] | undefined = txSplits[tx.id];
    if (splits && splits.length > 0) {
      for (const s of splits) {
        if (!s.categoryId || !s.amount) continue;
        // Внутрішні перекази не є витратою — пропускаємо частку спліту,
        // узгоджено з `getTxStatAmount`, щоб пай "Категорії" збігався з
        // "Підсумком місяця".
        if (s.categoryId === INTERNAL_TRANSFER_ID) continue;
        catSpend[s.categoryId] = (catSpend[s.categoryId] || 0) + s.amount;
        totalSpent += s.amount;
      }
    } else {
      const cat = getExpenseCategoryForTransaction(
        tx,
        txCategories[tx.id],
        customCategories,
      );
      const amt = Math.abs(tx.amount / 100);
      catSpend[cat.id] = (catSpend[cat.id] || 0) + amt;
      totalSpent += amt;
    }
  }

  return { catSpend, totalSpent };
}

// Pure projection of a precomputed spend index into a sorted category list.
// Cheap (O(k log k) on distinct categories), so it can be re-derived
// whenever `customCategories` (labels/colors) change without re-scanning txs.
function buildCategoryList(
  { catSpend, totalSpent }: CategorySpendIndex,
  customCategories: Category[] = [],
): TopCategory[] {
  return Object.entries(catSpend)
    .map(([categoryId, rawSpent]) => {
      const meta = resolveExpenseCategoryMeta(categoryId, customCategories) || {
        id: categoryId,
        label: "Інше",
      };
      return {
        categoryId,
        label: meta.label,
        spent: Math.round(rawSpent),
        pct: totalSpent > 0 ? Math.round((rawSpent / totalSpent) * 100) : 0,
        color: getCatColor(categoryId, customCategories),
      };
    })
    .sort((a, b) => b.spent - a.spent);
}

// Slice a precomputed category index into top-N entries.
export function selectTopCategoriesFromIndex(
  index: CategorySpendIndex,
  customCategories: Category[] = [],
  limit = 5,
): TopCategory[] {
  return buildCategoryList(index, customCategories).slice(0, limit);
}

// Build a full distribution view (up to 20 categories) with pct
// rebased on the displayed slice.
export function selectCategoryDistributionFromIndex(
  index: CategorySpendIndex,
  customCategories: Category[] = [],
): TopCategory[] {
  const top = buildCategoryList(index, customCategories).slice(0, 20);
  // pct рахуємо від повної суми витрат (а не від видимої топ-20),
  // щоб «довгий хвіст» не інфлейтив долю показаних категорій.
  const total =
    typeof index?.totalSpent === "number" && index.totalSpent > 0
      ? index.totalSpent
      : top.reduce((s, c) => s + c.spent, 0);
  return top.map((c) => ({
    ...c,
    pct: total > 0 ? Math.round((c.spent / total) * 100) : 0,
    color: c.color || getCatColor(c.categoryId, customCategories),
  }));
}

// Top spending categories. Supports both the documented selector shape
// `getTopCategories(txs, limit)` and the legacy `(txs, opts, limit)` form
// used by older hooks/tests.
export function getTopCategories(
  transactions: readonly Transaction[] | null | undefined,
  optsOrLimit: SelectorOptions | number = {},
  maybeLimit?: number,
): TopCategory[] {
  let opts: SelectorOptions = {};
  let limit = 5;
  if (typeof optsOrLimit === "number") {
    limit = optsOrLimit;
  } else {
    opts = optsOrLimit || {};
    if (typeof maybeLimit === "number") limit = maybeLimit;
  }
  const index = computeCategorySpendIndex(transactions, opts);
  return selectTopCategoriesFromIndex(
    index,
    opts.customCategories || [],
    limit,
  );
}

// Full `category → amount` distribution (returned as a sorted array of
// `{ categoryId, label, spent, pct, color }`).
export function getCategoryDistribution(
  transactions: readonly Transaction[] | null | undefined,
  opts: SelectorOptions = {},
): TopCategory[] {
  const index = computeCategorySpendIndex(transactions, opts);
  return selectCategoryDistributionFromIndex(
    index,
    opts.customCategories || [],
  );
}

// Compare two monthly summaries and return the absolute and percentage
// delta for both spend and income.
export function getTrendComparison(
  currentMonthTx: readonly Transaction[] | null | undefined,
  previousMonthTx: readonly Transaction[] | null | undefined,
  opts: Pick<SelectorOptions, "excludedTxIds" | "txSplits"> = {},
): TrendComparison {
  const { excludedTxIds = new Set<string>(), txSplits = {} as TxSplitsMap } =
    opts;
  const curr: AnalyticsResult = getMonthlySummary(currentMonthTx, {
    excludedTxIds,
    txSplits,
  });
  const prev: AnalyticsResult = getMonthlySummary(previousMonthTx, {
    excludedTxIds,
    txSplits,
  });
  const diff = curr.spent - prev.spent;
  const diffPct = prev.spent > 0 ? Math.round((diff / prev.spent) * 100) : null;
  const incomeDiff = curr.income - prev.income;
  const incomeDiffPct =
    prev.income > 0 ? Math.round((incomeDiff / prev.income) * 100) : null;

  return {
    currentSpent: curr.spent,
    prevSpent: prev.spent,
    diff,
    diffPct,
    currentIncome: curr.income,
    prevIncome: prev.income,
    incomeDiff,
    incomeDiffPct,
  };
}

// Build a "YYYY-MM" tag for a calendar month. Safe for single-digit months
// (pads to `01`..`12`) so lexicographic sorts still line up with chronology.
function formatMonthKey(year: number, month1Based: number): string {
  return `${year}-${String(month1Based).padStart(2, "0")}`;
}

export interface CurrentVsPreviousOptions extends Pick<
  SelectorOptions,
  "excludedTxIds" | "txSplits"
> {
  /** Опорна дата для "поточного" місяця (за замовчуванням — now). */
  now?: Date;
  /**
   * Явний вибір поточного місяця — перевизначає `now`. Формат — як у
   * `MonthFilter`: "YYYY-MM" або `{year, month}`.
   */
  currentMonth?: MonthFilter;
  /**
   * Явний вибір попереднього місяця. За замовчуванням — календарно
   * попередній місяць до `currentMonth`.
   */
  previousMonth?: MonthFilter;
}

// Parse a MonthFilter into `{year, month}` (1-based). Returns null when the
// filter cannot be interpreted — callers fall back to derived months.
function parseMonthFilter(
  month: MonthFilter | undefined,
): { year: number; month: number } | null {
  if (!month) return null;
  if (typeof month === "string") {
    const [ys, ms] = month.split("-");
    const y = Number(ys);
    const m = Number(ms);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
    return { year: y, month: m };
  }
  if (typeof month === "object") {
    const y = Number(month.year);
    const m = Number(month.month);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
    return { year: y, month: m };
  }
  return null;
}

/**
 * Порівняння поточного календарного періоду з попереднім, обчислене з
 * одного списку транзакцій. Корисно, коли у компонентах є тільки
 * `realTx` (поточний стан банку) і не треба тягнути окремий датасет за
 * попередній місяць — селектор сам фільтрує потрібні дати.
 *
 * Повертає ті самі поля, що й `getTrendComparison`, плюс ярлики періодів
 * ("YYYY-MM") для підписів у UI.
 */
export function getCurrentVsPreviousComparison(
  transactions: readonly Transaction[] | null | undefined,
  opts: CurrentVsPreviousOptions = {},
): PeriodComparison {
  const {
    now = new Date(),
    currentMonth,
    previousMonth,
    excludedTxIds = new Set<string>(),
    txSplits = {} as TxSplitsMap,
  } = opts;

  const currentParsed = parseMonthFilter(currentMonth) ?? {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
  const previousParsed =
    parseMonthFilter(previousMonth) ??
    (() => {
      const y =
        currentParsed.month === 1 ? currentParsed.year - 1 : currentParsed.year;
      const m = currentParsed.month === 1 ? 12 : currentParsed.month - 1;
      return { year: y, month: m };
    })();

  const currKey = formatMonthKey(currentParsed.year, currentParsed.month);
  const prevKey = formatMonthKey(previousParsed.year, previousParsed.month);

  const curr: AnalyticsResult = getMonthlySummary(transactions, {
    excludedTxIds,
    txSplits,
    month: currentParsed,
  });
  const prev: AnalyticsResult = getMonthlySummary(transactions, {
    excludedTxIds,
    txSplits,
    month: previousParsed,
  });
  const diff = curr.spent - prev.spent;
  const diffPct = prev.spent > 0 ? Math.round((diff / prev.spent) * 100) : null;
  const incomeDiff = curr.income - prev.income;
  const incomeDiffPct =
    prev.income > 0 ? Math.round((incomeDiff / prev.income) * 100) : null;

  return {
    currentMonth: currKey,
    previousMonth: prevKey,
    currentSpent: curr.spent,
    prevSpent: prev.spent,
    diff,
    diffPct,
    currentIncome: curr.income,
    prevIncome: prev.income,
    incomeDiff,
    incomeDiffPct,
  };
}

/**
 * Варіанти коротких підсумкових фраз для ретро-порівняння.
 * Тримаємо окремі ключі, щоб UI міг підставляти їх без локального
 * конкатенату рядків.
 */
export type ComparisonDirection = "up" | "down" | "equal" | "no_prev";

export interface ComparisonSummary {
  direction: ComparisonDirection;
  /** Коротке речення українською для показу користувачу. */
  text: string;
}

/**
 * Форматує `TrendComparison` (або `PeriodComparison`) у коротку фразу,
 * яку можна показати поряд з цифрами ("На X ₴ більше, ніж торік…").
 * Чиста функція — зручно використовувати і в компонентах, і в тестах.
 */
export function formatComparisonSummary(
  comparison:
    | Pick<TrendComparison, "diff" | "diffPct" | "prevSpent" | "currentSpent">
    | null
    | undefined,
  { prevLabel = "попереднього місяця" }: { prevLabel?: string } = {},
): ComparisonSummary {
  if (!comparison) {
    return { direction: "no_prev", text: "Немає даних за попередній період." };
  }
  const { diff, diffPct, prevSpent, currentSpent } = comparison;
  if (!prevSpent) {
    if (!currentSpent) {
      return {
        direction: "no_prev",
        text: "Витрат ще немає, повернемось, коли зʼявляться дані.",
      };
    }
    return {
      direction: "no_prev",
      text: `У ${prevLabel} витрат не було, порівнювати поки немає з чим.`,
    };
  }
  if (diff === 0) {
    return {
      direction: "equal",
      text: `Витрати такі самі, як у ${prevLabel}.`,
    };
  }
  const absDiff = formatNumberUk(Math.abs(diff), {
    maximumFractionDigits: 0,
  });
  const pctPart =
    diffPct != null && diffPct !== 0 ? ` (${Math.abs(diffPct)}%)` : "";
  if (diff > 0) {
    return {
      direction: "up",
      text: `Ви витратили на ${absDiff} ₴${pctPart} більше, ніж у ${prevLabel}.`,
    };
  }
  return {
    direction: "down",
    text: `Ви витратили на ${absDiff} ₴${pctPart} менше, ніж у ${prevLabel}.`,
  };
}

interface TopMerchantsOptions extends SelectorOptions {
  limit?: number;
}

// Top merchants by aggregated expense. Deterministic, pure sort — useful
// both in the UI and in tests.
// Ключ для групування мерчантів: нормалізовані пробіли + регістр, щоб
// «АТБ», «атб», «АТБ  » зливалися в один запис. Для відображення
// використовується перша зустрінута форма.
function merchantGroupKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");
}

export function getTopMerchants(
  transactions: readonly Transaction[] | null | undefined,
  opts: TopMerchantsOptions | number = {},
  maybeLimit?: number,
): MerchantStat[] {
  const {
    excludedTxIds = new Set<string>(),
    txSplits = {} as TxSplitsMap,
    month = null,
    limit: optsLimit,
  } = typeof opts === "number"
    ? ({ limit: opts } as TopMerchantsOptions)
    : opts || {};
  const limit = typeof maybeLimit === "number" ? maybeLimit : (optsLimit ?? 10);
  const list = Array.isArray(transactions) ? transactions : [];
  const excluded = toExcludedSet(excludedTxIds);
  const inMonth = buildMonthPredicate(month);
  const merchants: Record<string, MerchantStat> = {};

  for (const tx of list) {
    if (!tx || excluded.has(tx.id) || tx.amount >= 0) continue;
    if (inMonth && !inMonth(tx)) continue;
    const raw = (tx.description || "").trim();
    if (!raw) continue;
    const key = merchantGroupKey(raw);
    if (!key) continue;
    // Враховуємо лише чисту частку користувача: якщо транзакція сплітована
    // (напр. оренда з поверненнями від співмешканців), беремо суму не-
    // internal_transfer частин — узгоджено з `getMonthlySummary` /
    // `computeCategorySpendIndex`, щоб цифри у "Топ мерчантах" збігалися з
    // рештою аналітики.
    const amount = getTxStatAmount(tx, txSplits);
    if (!(amount > 0)) continue;
    if (!merchants[key]) merchants[key] = { name: raw, count: 0, total: 0 };
    merchants[key].count++;
    merchants[key].total += amount;
  }

  return Object.values(merchants)
    .map((m) => ({ ...m, total: Math.round(m.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export interface MonthlyHistoryEntry {
  month: string;
  transactions: readonly Transaction[];
  excludedTxIds?: Set<string> | Iterable<string>;
  txSplits?: TxSplitsMap;
}

export interface MonthlySpendPoint {
  month: string;
  label: string;
  spent: number;
  income: number;
}

// Reshapes a history of (month, transactions) pairs into the
// [{ month, label, spent, income }] series consumed by the spend chart.
// Uses `getMonthlySummary` so totals stay consistent with the summary card.
export function getMonthlySpendSeries(
  monthlyData: readonly MonthlyHistoryEntry[] | null | undefined,
): MonthlySpendPoint[] {
  if (!Array.isArray(monthlyData)) return [];
  return monthlyData.map(({ month, transactions, excludedTxIds, txSplits }) => {
    const txList = Array.isArray(transactions) ? transactions : [];
    const excluded = toExcludedSet(excludedTxIds);
    const { spent, income } = getMonthlySummary(txList, {
      excludedTxIds: excluded,
      txSplits: txSplits || {},
    });
    const [year, mon] = (month || "").split("-");
    const label =
      year && mon
        ? new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString(
            "uk-UA",
            { month: "short" },
          )
        : month;
    return { month, label, spent, income };
  });
}
