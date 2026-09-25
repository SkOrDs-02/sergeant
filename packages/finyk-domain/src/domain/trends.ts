// «Що змінилось і чому?» (фаза 2 спеки аналітики v2, Р11-Р15).
//
// Чисті проєкції з переданого списку транзакцій: тренд за місяцями, середнє,
// рівень заощаджень і дельта по категоріях. Усе рахується з точних сум
// (копійок), округлює лише показ (Р7), а відсоток дельти рахує той самий
// `compareAmounts`, що й порівняння місяців (Р4).
import { toLocalISODate } from "@sergeant/shared";
import { resolveExpenseCategoryMeta, txTimeMs } from "../utils";
import {
  compareAmounts,
  computeCategorySpendIndex,
  getMonthlySummary,
} from "./selectors";
import { getCatColor } from "./categories";
import type {
  AmountDelta,
  Category,
  SelectorOptions,
  Transaction,
} from "./types";

/** Скільки місяців показує тренд (Р11). */
export const TREND_MONTHS = 12;

export interface MonthlyTrendPoint {
  /** `YYYY-MM` за Києвом. */
  month: string;
  /** Точна сума витрат, копійки. */
  spentMinor: number;
  /** Записів у місяці (витрати й надходження, без виключених). */
  txCount: number;
  /** Поточний, ще не завершений місяць. */
  isCurrent: boolean;
}

export interface MonthlyTrendOptions extends Pick<
  SelectorOptions,
  "excludedTxIds" | "txSplits" | "txCategories" | "customCategories"
> {
  now?: Date;
  months?: number;
  /** Тренд однієї категорії (Р13): витрати лише в ній. */
  categoryId?: string | null;
}

function monthKeyOf(tx: Pick<Transaction, "time">): string | null {
  const ms = txTimeMs(tx.time);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return toLocalISODate(new Date(ms)).slice(0, 7);
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/**
 * Витрати за останні `months` місяців (включно з поточним), від першого
 * місяця з записами. Місяці до початку ведення не вигадуються нулями: людина,
 * яка веде з вересня, бачить вересень, а не одинадцять порожніх стовпців
 * (Р11). Місяці всередині історії без записів лишаються з нулем.
 */
export function buildMonthlyTrend(
  transactions: readonly Transaction[] | null | undefined,
  opts: MonthlyTrendOptions = {},
): MonthlyTrendPoint[] {
  const {
    now = new Date(),
    months = TREND_MONTHS,
    categoryId = null,
    excludedTxIds,
    txSplits = {},
    txCategories = {},
    customCategories = [],
  } = opts;
  const excluded =
    excludedTxIds instanceof Set ? excludedTxIds : new Set(excludedTxIds ?? []);
  const currentKey = toLocalISODate(now).slice(0, 7);
  const firstWindowKey = shiftMonth(currentKey, -(Math.max(1, months) - 1));

  const buckets = new Map<string, Transaction[]>();
  let firstKey: string | null = null;
  for (const tx of transactions ?? []) {
    if (!tx || excluded.has(tx.id)) continue;
    const key = monthKeyOf(tx);
    if (!key || key > currentKey) continue;
    if (!firstKey || key < firstKey) firstKey = key;
    if (key < firstWindowKey) continue;
    const list = buckets.get(key);
    if (list) list.push(tx);
    else buckets.set(key, [tx]);
  }
  if (!firstKey) return [];

  const startKey = firstKey > firstWindowKey ? firstKey : firstWindowKey;
  const out: MonthlyTrendPoint[] = [];
  for (let key = startKey; key <= currentKey; key = shiftMonth(key, 1)) {
    const list = buckets.get(key) ?? [];
    let spentMinor: number;
    if (categoryId) {
      const { catSpend } = computeCategorySpendIndex(list, {
        txSplits,
        txCategories,
        customCategories,
      });
      spentMinor = Math.round((catSpend[categoryId] ?? 0) * 100);
    } else {
      spentMinor = getMonthlySummary(list, { txSplits }).spentMinor;
    }
    out.push({
      month: key,
      spentMinor,
      txCount: list.length,
      isCurrent: key === currentKey,
    });
  }
  return out;
}

/**
 * Середні витрати на місяць лише за завершені місяці з записами (Р14):
 * неповний поточний місяць і місяці без жодного запису не входять. `null`,
 * коли завершених місяців немає: середнє з одного неповного місяця є шумом.
 */
export function getAverageMonthlySpendMinor(
  points: readonly MonthlyTrendPoint[],
): number | null {
  const done = points.filter((p) => !p.isCurrent && p.txCount > 0);
  if (done.length === 0) return null;
  return done.reduce((s, p) => s + p.spentMinor, 0) / done.length;
}

/**
 * Рівень заощаджень місяця, % (Р15): (дохід - витрати) / дохід. `null` при
 * доході 0: ділити нема на що, і «0 %» тут було б неправдою.
 */
export function getSavingsRate(
  incomeMinor: number,
  spentMinor: number,
): number | null {
  if (!(incomeMinor > 0)) return null;
  return ((incomeMinor - spentMinor) / incomeMinor) * 100;
}

export interface CategoryDeltaRow {
  categoryId: string;
  label: string;
  color: string;
  currentMinor: number;
  prevMinor: number;
  delta: AmountDelta;
}

/**
 * Дельта витрат по категоріях між двома місяцями (Р12). Категорії без витрат
 * в обох місяцях не показуються, відсоток рахується за правилом Р4.
 */
export function getCategoryDeltas(
  currentMonthTx: readonly Transaction[] | null | undefined,
  previousMonthTx: readonly Transaction[] | null | undefined,
  opts: Pick<
    SelectorOptions,
    "excludedTxIds" | "txSplits" | "txCategories" | "customCategories"
  > = {},
): CategoryDeltaRow[] {
  const customCategories: Category[] = opts.customCategories ?? [];
  const curr = computeCategorySpendIndex(currentMonthTx, opts).catSpend;
  const prev = computeCategorySpendIndex(previousMonthTx, opts).catSpend;
  const ids = new Set([...Object.keys(curr), ...Object.keys(prev)]);
  const rows: CategoryDeltaRow[] = [];
  for (const categoryId of ids) {
    const currentMinor = Math.round((curr[categoryId] ?? 0) * 100);
    const prevMinor = Math.round((prev[categoryId] ?? 0) * 100);
    if (currentMinor === 0 && prevMinor === 0) continue;
    const meta = resolveExpenseCategoryMeta(categoryId, customCategories);
    rows.push({
      categoryId,
      label: meta?.label ?? "Інше",
      color: getCatColor(categoryId, customCategories),
      currentMinor,
      prevMinor,
      delta: compareAmounts(currentMinor, prevMinor),
    });
  }
  return rows.sort(
    (a, b) => b.currentMinor - a.currentMinor || b.prevMinor - a.prevMinor,
  );
}
