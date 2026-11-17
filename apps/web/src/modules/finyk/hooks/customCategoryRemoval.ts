/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Знімок і відкат видалення власної категорії (аудит 2026-10-01, `data-25`;
 * рішення власника 2026-10-23: тост «Скасувати», витрати йдуть в «Інше»).
 *
 * Видалення зачіпає п'ять слотів (категорії, ліміти, мітки операцій, спліти,
 * ручні витрати). Знімок збирається ДО запису з поточних значень слотів, а
 * відкат повертає кожен слот через ті самі сетери, що й видалення, тож обидва
 * напрямки доїжджають на інші пристрої звичайним шляхом запису (dual-write →
 * оп-лог), без окремого каналу.
 */
import type { Budget } from "@sergeant/finyk-domain/domain/types";
import { limitBudgetCategoryIds } from "@sergeant/finyk-domain/domain/budget";
import type {
  CustomCategory,
  ManualExpense,
  TxCategoriesMap,
  TxSplit,
  TxSplitsMap,
} from "./useStorage.types";

export interface CustomCategoryRemoval {
  category: CustomCategory;
  /** Позиція в списку: щоб відкат повернув категорію на місце. */
  index: number;
  /** Id дефолтної категорії напряму, куди перейшли витрати. */
  reassignedTo: string;
  /** Ліміти до видалення, що містили категорію (оригінальні обʼєкти). */
  budgets: Budget[];
  /** Мітки операцій, що вказували на категорію. */
  txCategoryIds: string[];
  /** Спліти до видалення, у яких була категорія. */
  splits: Record<string, TxSplit[]>;
  /** Ручні витрати, що мали цю категорію. */
  manualExpenseIds: string[];
}

/** «Інше» відповідного напряму (рішення 2026-10-23). */
export function defaultCategoryFor(category: CustomCategory): string {
  return category.kind === "income" ? "other-income" : "other";
}

export function planCustomCategoryRemoval(input: {
  id: string;
  categories: readonly CustomCategory[];
  budgets: readonly Budget[];
  txCategories: TxCategoriesMap;
  txSplits: TxSplitsMap;
  manualExpenses: readonly ManualExpense[];
}): CustomCategoryRemoval | null {
  const index = input.categories.findIndex((c) => c.id === input.id);
  const category = input.categories[index];
  if (!category) return null;
  const splits: Record<string, TxSplit[]> = {};
  for (const [txId, list] of Object.entries(input.txSplits)) {
    if (Array.isArray(list) && list.some((s) => s.categoryId === input.id)) {
      splits[txId] = list;
    }
  }
  return {
    category,
    index,
    reassignedTo: defaultCategoryFor(category),
    budgets: input.budgets.filter(
      (b) => b.type === "limit" && limitBudgetCategoryIds(b).includes(input.id),
    ),
    txCategoryIds: Object.keys(input.txCategories).filter(
      (k) => input.txCategories[k] === input.id,
    ),
    splits,
    manualExpenseIds: input.manualExpenses
      .filter((e) => e.category === input.id)
      .map((e) => e.id),
  };
}

/** Скільки витрат і лімітів зачепило видалення (для тексту тоста). */
export function removalExpensesCount(r: CustomCategoryRemoval): number {
  return (
    r.manualExpenseIds.length +
    r.txCategoryIds.length +
    Object.keys(r.splits).length
  );
}

/** Повернути категорію на місце (без дублю, якщо вона вже є). */
export function restoreCategoryList(
  prev: CustomCategory[],
  r: CustomCategoryRemoval,
): CustomCategory[] {
  if (prev.some((c) => c.id === r.category.id)) return prev;
  const next = [...prev];
  next.splice(Math.min(r.index, next.length), 0, r.category);
  return next;
}

/** Ліміти: оригінал замінює поточну версію за id або повертається, якщо ліміт зник. */
export function restoreBudgetList(
  prev: Budget[],
  r: CustomCategoryRemoval,
): Budget[] {
  const byId = new Map(r.budgets.map((b) => [b.id, b]));
  const out = prev.map((b) => byId.get(b.id) ?? b);
  const present = new Set(prev.map((b) => b.id));
  for (const b of r.budgets) if (!present.has(b.id)) out.push(b);
  return out;
}
