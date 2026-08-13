// Pure domain helpers for categories of the Finyk module.
// Жодних React-хуків і жодного localStorage. Містить:
//  - визначення кольорів категорій (джерело правди для всіх графіків);
//  - побудову списку категорій для селектів/графіків;
//  - побудову списку сум по категоріях для статистики.
// `getCategory`, `resolveExpenseCategoryMeta`, `calcCategorySpent` реекспортуються
// з `utils`, щоб UI/хуки могли імпортувати все з одного domain-модуля.
import {
  categoryColors,
  categoryFallbackOrder,
  type CategoryColorTiers,
} from "@sergeant/design-tokens";
import { mergeExpenseCategoryDefinitions } from "../constants";
import {
  calcCategorySpent,
  getCategory,
  getIncomeCategory,
  resolveExpenseCategoryMeta,
} from "../utils";
import type { SpendingTxLike, TxSplitsLike } from "../lib/transactions.js";
import {
  LEGACY_INCOME_IDS,
  MANUAL_EXPENSE_TAXONOMY,
  MANUAL_INCOME_TAXONOMY,
} from "../lib/manualTaxonomy.js";

export {
  calcCategorySpent,
  getCategory,
  getIncomeCategory,
  resolveExpenseCategoryMeta,
};

interface Category {
  id: string;
  label: string;
  mccs?: number[] | undefined;
  keywords?: string[] | undefined;
  color?: string | undefined;
}

interface CustomCategory extends Category {
  color?: string | undefined;
}

/**
 * Мінімум, потрібний для стабільного fallback-індексу: самий лише `id`.
 * Викликачі передають сюди різні форми — і повний `CustomCategory`, і
 * `CategoryOption` пікера, — а індекс залежить тільки від ідентичності.
 */
interface CategoryIdLike {
  id: string;
}

/**
 * Тири кольору категорії: `tint`/`border`/`ink` для чипів і строк,
 * `solid` для точок і сегментів діаграм, `tintDark`/`inkDark` — те саме
 * для «Чорнила». Джерело правди — `@sergeant/design-tokens`.
 *
 * AI-CONTEXT: до 2026-08-11 тут лежала таблиця сирих хексів
 * (`#10b981`, `#84cc16`, `#14b8a6`, …), і два з них були буквально
 * акцентами інших модулів: `entertainment` = teal-500 (Фінік),
 * `charity` = lime-ish (Їжа), `travel` — майже cyan Фізрука. Тобто
 * всередині Фініка діаграма фарбувалась чужою айдентикою, і жоден
 * лінтер цього не бачив — hex сидів у домені, а не в `className`.
 * Тепер hue гейтить `categoryColors.contract.test.js`.
 */
const CAT_TIERS: Record<string, CategoryColorTiers> = categoryColors;

/**
 * Id, який не має власного запису в палітрі, бере тир своєї канонічної
 * категорії: детальні slug-и ручної форми (`groceries` → `food`) і всі
 * надходження (→ спільний тир `income`). Будується з тієї самої
 * таблиці, що й підписи та іконки, — інакше колір і агрегація
 * розходяться мовчки, як це й сталось до 2026-08-13.
 */
const CATEGORY_COLOR_ALIASES: Readonly<Record<string, string>> =
  Object.fromEntries([
    ...[...MANUAL_EXPENSE_TAXONOMY, ...MANUAL_INCOME_TAXONOMY]
      .filter((d) => d.canonicalId !== d.id)
      .map((d) => [d.id, d.canonicalId] as const),
    ...LEGACY_INCOME_IDS.filter((id) => id !== "income").map(
      (id) => [id, "income"] as const,
    ),
  ]);

/**
 * Порядок кольорів для КАСТОМНИХ категорій — беремо за `idx`, щоб колір
 * не стрибав між рендерами.
 */
const FALLBACK_TIERS: CategoryColorTiers[] = categoryFallbackOrder.map(
  (id) => categoryColors[id],
);

/**
 * Повний набір тирів для категорії: вбудована → з палітри за індексом.
 *
 * Кастомний колір користувача (`custom.color`) тут НЕ враховується — це
 * один довільний hex без пари під текст, тож із нього не можна зібрати
 * читабельну пару фон/чорнило. Для сирого кольору є `getCatColor`.
 *
 * `idx` — позиція, з якої береться fallback-тир для КАСТОМНОЇ категорії.
 * Передавай його через `resolveCatTiers`, а не рахуй на місці: рядок,
 * пікер і діаграма мають різний порядок рендеру, і позиційний індекс
 * робив із них три різні кольори однієї категорії (див. нижче).
 */
export function getCatTiers(categoryId: string, idx = 0): CategoryColorTiers {
  const paletteId = CATEGORY_COLOR_ALIASES[categoryId] ?? categoryId;
  const base = CAT_TIERS[paletteId];
  if (base) return base;
  return FALLBACK_TIERS[idx % FALLBACK_TIERS.length] ?? FALLBACK_TIERS[0]!;
}

/**
 * Стабільний fallback-індекс кастомної категорії — її позиція у списку
 * власних категорій користувача.
 *
 * AI-CONTEXT (баг 2026-08-13): `idx` у `getCatTiers`/`getCatColor` —
 * позиційний, і кожен виклик рахував його по-своєму. Строка транзакції
 * не передавала його зовсім (тобто 0), пікер передавав номер чипа у
 * своєму списку, а діаграма — місце категорії в сортуванні за сумою.
 * Через це ОДНА кастомна категорія малювалась трьома різними
 * кольорами, а в діаграмі ще й міняла колір щомісяця разом із
 * рейтингом витрат. Причому в самому пікері стоїть коментар-обіцянка
 * «той самий відтінок людина потім бачить у строці транзакції» — вона
 * не виконувалась. Плюс усі надходження падали в `idx = 0`, тобто
 * носили колір категорії «Транспорт» (це вже лікує тир `income`).
 *
 * Ключ тепер — ідентичність категорії, а не порядок рендеру. Позиція у
 * списку власних категорій, а не хеш id: `categoryFallbackOrder`
 * навмисно вибудуваний так, щоб СУСІДНІ за створенням категорії
 * діставали максимально різні відтінки, і хеш цю властивість зруйнував
 * би.
 */
export function resolveCatTiers(
  categoryId: string,
  customCategories: readonly CategoryIdLike[] = [],
): CategoryColorTiers {
  return getCatTiers(
    categoryId,
    customCategoryIndex(categoryId, customCategories),
  );
}

/** Чи має цей id власний тир у палітрі (сам або через аліас). */
function hasOwnTier(categoryId: string): boolean {
  return Boolean(CAT_TIERS[CATEGORY_COLOR_ALIASES[categoryId] ?? categoryId]);
}

/**
 * Позиція категорії серед КАСТОМНИХ у переданому списку.
 *
 * Список навмисно фільтрується від усього, що має власний тир: одні
 * викликачі передають чистий `customCategories`, інші — вже змерджений
 * `mergeExpenseCategoryDefinitions()` (вбудовані + кастомні). Обидві
 * форми мають давати ОДИН індекс, інакше пікер і строка транзакції
 * знову розійшлись би в кольорі. `merge` дописує кастомні в кінець і в
 * тому ж порядку, тож після фільтра відносний порядок збігається.
 */
function customCategoryIndex(
  categoryId: string,
  categories: readonly CategoryIdLike[] = [],
): number {
  if (!Array.isArray(categories)) return 0;
  const at = categories
    .filter((c) => c?.id && !hasOwnTier(c.id))
    .findIndex((c) => c.id === categoryId);
  return at >= 0 ? at : 0;
}

// Повертає HEX-колір для категорії: базовий → користувацький → з палітри.
// `FALLBACK_TIERS` гарантовано непорожня, тому fallback нижче не буде null —
// індекс просто wrap-иться по модулю.
//
// `idx` лишається лише для id, якого НЕМА у списку власних категорій
// (фантомний ключ у старому блобі). Коли категорія в списку є, індекс
// беремо з неї — інакше сегмент діаграми міняв би колір щоразу, коли
// категорія переїжджає в сортуванні за сумою. Див. `resolveCatTiers`.
export function getCatColor(
  categoryId: string,
  customCategories: CustomCategory[] = [],
  idx = 0,
): string {
  const paletteId = CATEGORY_COLOR_ALIASES[categoryId] ?? categoryId;
  const base = CAT_TIERS[paletteId];
  if (base) return base.solid;
  const custom = Array.isArray(customCategories)
    ? customCategories.find((c) => c.id === categoryId)
    : null;
  if (custom?.color) return custom.color;
  const stable = customCategoryIndex(categoryId, customCategories);
  return getCatTiers(categoryId, stable || idx).solid;
}

// Повний список категорій витрат (базові + користувацькі). За замовчуванням
// виключає псевдо-категорію доходу `income`, бо вона не потрібна у фільтрах
// бюджетів та графіках витрат.
export function buildExpenseCategoryList(
  customCategories: CustomCategory[] = [],
  { excludeIncome = true } = {},
): Category[] {
  const all = mergeExpenseCategoryDefinitions(customCategories) as Category[];
  return excludeIncome ? all.filter((c) => c.id !== "income") : all;
}

interface CategorySpend extends Category {
  spent: number;
}

export interface GetCategorySpendListOptions {
  txCategories?: Record<string, string | undefined>;
  // `TxSplitsLike` — навмисно широкий контракт, співпадає з тим, що
  // приймає `calcCategorySpent`. Так викликачі (web + mobile) можуть
  // передавати той самий `Record<string, unknown>`, що тримають у
  // localStorage/MMKV, без додаткового `as` на місці.
  txSplits?: TxSplitsLike;
  customCategories?: CustomCategory[];
}

// Сумарні витрати по кожній категорії для заданого списку транзакцій.
// Повертає відсортований масив лише з категоріями, де spent > 0 —
// готовий для рендеру карток/графіків.
export function getCategorySpendList(
  transactions: readonly SpendingTxLike[],
  {
    txCategories = {},
    txSplits = {},
    customCategories = [],
  }: GetCategorySpendListOptions = {},
): CategorySpend[] {
  return buildExpenseCategoryList(customCategories)
    .map((cat) => ({
      ...cat,
      spent: calcCategorySpent(
        transactions,
        cat.id,
        txCategories,
        txSplits,
        customCategories,
      ),
    }))
    .filter((c) => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
}
