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
  kind?: "expense" | "income" | undefined;
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
  time?: string | number | undefined;
  date?: string | number | undefined;
}

const DETAILED_CATEGORY_CUTOVER_MS = Date.parse("2026-08-31T21:00:00.000Z");

function preservePreCutoverTechCategory(
  category: CategoryLike,
  transaction: CategorizedTransactionLike,
): CategoryLike {
  const rawDate = transaction.time ?? transaction.date;
  if (category.id !== "tech" || rawDate == null) return category;
  const timestamp =
    typeof rawDate === "number"
      ? rawDate > 1e10
        ? rawDate
        : rawDate * 1000
      : new Date(rawDate).getTime();
  if (!Number.isFinite(timestamp) || timestamp >= DETAILED_CATEGORY_CUTOVER_MS)
    return category;
  return resolveExpenseOverride("shopping") ?? category;
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
  customCategories: CategoryLikeInput = [],
): CategoryLike {
  if (overrideId) {
    const found =
      MANUAL_INCOME_CATEGORIES.find((c: CategoryLike) => c.id === overrideId) ||
      INCOME_CATEGORIES.find((c: CategoryLike) => c.id === overrideId) ||
      MCC_CATEGORIES.find((c: CategoryLike) => c.id === overrideId);
    if (found) {
      const canonicalIncomeIds: Record<string, string> = {
        in_salary: "salary",
        in_freelance: "freelance",
        in_cashback: "cashback",
        in_pension: "pension",
        in_debt: "debt-income",
        in_other: "other-income",
      };
      const canonicalId = canonicalIncomeIds[found.id];
      return canonicalId
        ? (MANUAL_INCOME_CATEGORIES.find((c) => c.id === canonicalId) ?? found)
        : found;
    }
    const custom = customCategories
      .filter(isCategoryLike)
      .find((c) => c.kind === "income" && c.id === overrideId);
    if (custom)
      return { id: custom.id, label: custom.label ?? "", keywords: [] };
  }
  const d = desc.toLowerCase();
  for (const cat of INCOME_CATEGORIES as readonly CategoryLike[]) {
    if ((cat.keywords ?? []).some((k: string) => d.includes(k)))
      return getIncomeCategory("", cat.id, customCategories);
  }
  return getIncomeCategory("", "in_other", customCategories);
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
    if (manualCategory)
      return preservePreCutoverTechCategory(manualCategory, transaction);
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
  return preservePreCutoverTechCategory(
    getCategory(
      transaction.description ?? "",
      transaction.mcc ?? 0,
      explicitId,
      customCategories,
    ),
    transaction,
  );
}

export function getIncomeCategoryForTransaction(
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
    const manualCategory = MANUAL_INCOME_CATEGORIES.find(
      (category) => category.id === explicitId,
    );
    if (manualCategory) return manualCategory;
  }
  return getIncomeCategory(
    transaction.description ?? "",
    explicitId,
    customCategories,
  );
}
