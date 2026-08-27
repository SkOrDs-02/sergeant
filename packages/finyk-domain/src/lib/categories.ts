import { MCC_CATEGORIES, INCOME_CATEGORIES } from "../constants";
import {
  legacyManualCategoryId,
  MANUAL_EXPENSE_TAXONOMY,
  MANUAL_INCOME_TAXONOMY,
} from "./manualTaxonomy.js";

/**
 * Мінімальний тип кастомної категорії: достатньо для overlay-пошуку
 * у `resolveExpenseOverride`. Поля додаткові (`color`, `emoji`) не
 * використовуються цим резолвером — тому лишаємо open-ended.
 */
export interface CategoryLike {
  id: string;
  label: string;
  mccs?: number[];
  keywords?: string[];
  color?: string;
  emoji?: string;
}

/**
 * Канонічні categoryId, записані на самій транзакції, мають перевагу над
 * повторною евристикою за MCC/описом. Користувацький override лишається
 * найвищим пріоритетом.
 */
export interface CategorizedTransactionLike {
  description?: string | undefined;
  mcc?: number | undefined;
  categoryId?: string | undefined;
  manual?: boolean | undefined;
  _manual?: boolean | undefined;
  source?: string | undefined;
}

/**
 * Широкий вхідний тип: і strict `CategoryLike[]` (мобільний), і легасі
 * `unknown[]` / `{ id: string; label?: string }[]` з `apps/web` повинні
 * прийматись без змін у web. Вузьке звуження відбувається всередині
 * функцій.
 */
type CategoryLikeInput = readonly unknown[];

// Ручна форма історично має дещо детальнішу таксономію за MCC-каталог.
// Ці id уже лежать у persisted blobs, тому їх не можна зводити до `other`
// або перейменовувати міграцією під час читання. Джерело правди —
// `manualTaxonomy.ts`; тут лише проєкція «id + підпис».
const MANUAL_EXPENSE_CATEGORIES: readonly CategoryLike[] =
  MANUAL_EXPENSE_TAXONOMY.map((d) => ({ id: d.id, label: d.label }));

const MANUAL_INCOME_CATEGORIES: readonly CategoryLike[] =
  MANUAL_INCOME_TAXONOMY.map((d) => ({ id: d.id, label: d.label }));

function isCategoryLike(v: unknown): v is CategoryLike {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { id?: unknown }).id === "string"
  );
}

function resolveExpenseOverride(
  overrideId: string | null | undefined,
  customCategories: CategoryLikeInput = [],
): CategoryLike | null {
  if (!overrideId) return null;
  const fromMcc = MCC_CATEGORIES.find((c: CategoryLike) => c.id === overrideId);
  if (fromMcc) return fromMcc;
  const fromManual = MANUAL_EXPENSE_CATEGORIES.find((c) => c.id === overrideId);
  if (fromManual) return fromManual;
  const custom = customCategories
    .filter(isCategoryLike)
    .find((c) => c.id === overrideId);
  if (custom) {
    return {
      id: custom.id,
      label: custom.label ?? "",
      mccs: [],
      keywords: [],
    };
  }
  return null;
}

/** Мітка категорії витрат за id (базові + користувацькі). */
export function resolveExpenseCategoryMeta(
  id: string | null | undefined,
  customCategories: CategoryLikeInput = [],
): CategoryLike | null {
  return resolveExpenseOverride(id, customCategories);
}

export function getIncomeCategory(
  desc = "",
  overrideId: string | null = null,
): CategoryLike {
  if (overrideId) {
    const found =
      MANUAL_INCOME_CATEGORIES.find((c: CategoryLike) => c.id === overrideId) ||
      INCOME_CATEGORIES.find((c: CategoryLike) => c.id === overrideId) ||
      MCC_CATEGORIES.find((c: CategoryLike) => c.id === overrideId);
    if (found) return found;
  }
  const d = desc.toLowerCase();
  for (const cat of INCOME_CATEGORIES as readonly CategoryLike[]) {
    if ((cat.keywords ?? []).some((k: string) => d.includes(k))) return cat;
  }
  return INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1] as CategoryLike; // in_other
}

export function getCategory(
  desc = "",
  mcc = 0,
  overrideId: string | null = null,
  customCategories: CategoryLikeInput = [],
): CategoryLike {
  if (overrideId) {
    const fromCustom = resolveExpenseOverride(overrideId, customCategories);
    if (fromCustom) return fromCustom;
    const found = MCC_CATEGORIES.find((c: CategoryLike) => c.id === overrideId);
    if (found) return found;
  }
  for (const cat of MCC_CATEGORIES as readonly CategoryLike[]) {
    if ((cat.mccs ?? []).includes(mcc)) return cat;
    if (
      (cat.keywords ?? []).some((k: string) => desc.toLowerCase().includes(k))
    )
      return cat;
  }
  return { id: "other", label: "Інше", mccs: [], keywords: [] };
}

export function getExpenseCategoryForTransaction(
  transaction: CategorizedTransactionLike,
  overrideId: string | null | undefined = null,
  customCategories: CategoryLikeInput = [],
): CategoryLike {
  const explicitId = overrideId || transaction.categoryId || null;
  const isManual =
    transaction.manual === true ||
    transaction._manual === true ||
    transaction.source === "manual";
  if (isManual && explicitId) {
    const manualCategory = MANUAL_EXPENSE_CATEGORIES.find(
      (category) => category.id === explicitId,
    );
    if (manualCategory) return manualCategory;
    // Ери 1–2: у сховищі лежить український підпис (`"їжа"`, `"🍴 їжа"`),
    // а не слаг. Без цієї гілки такий запис не матчив ані ручну
    // таксономію, ані MCC-каталог, ані ключові слова — і рядок малювався
    // як «Інше» з нейтральним сірим, хоча форма редагування того ж
    // запису показувала правильну категорію (`upgradeCategory` живе
    // лише в ній). Знайдено браузерною перевіркою 2026-08-13.
    //
    // Порядок важливий: спершу `resolveExpenseOverride` (MCC → ручні →
    // ВЛАСНІ), і лише потім легасі-підписи. Інакше власна категорія з
    // id на кшталт «їжа» була б зʼїдена мапою — та сама підміна даних,
    // від якої застерігає `upgradeCategoryAllowingCustom`.
    const fromOverride = resolveExpenseOverride(explicitId, customCategories);
    if (fromOverride) return fromOverride;
    const legacySlug = legacyManualCategoryId(explicitId);
    if (legacySlug) {
      const upgraded = MANUAL_EXPENSE_CATEGORIES.find(
        (category) => category.id === legacySlug,
      );
      if (upgraded) return upgraded;
    }
  }
  return getCategory(
    transaction.description ?? "",
    transaction.mcc ?? 0,
    explicitId,
    customCategories,
  );
}

export function getIncomeCategoryForTransaction(
  transaction: CategorizedTransactionLike,
  overrideId: string | null | undefined = null,
): CategoryLike {
  const explicitId = overrideId || transaction.categoryId || null;
  const isManual =
    transaction.manual === true ||
    transaction._manual === true ||
    transaction.source === "manual";
  if (isManual && explicitId) {
    const manualCategory = MANUAL_INCOME_CATEGORIES.find(
      (category) => category.id === explicitId,
    );
    if (manualCategory) return manualCategory;
  }
  return getIncomeCategory(transaction.description ?? "", explicitId);
}
