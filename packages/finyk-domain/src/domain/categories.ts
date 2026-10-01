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

// Детальні slug-и ручної форми наслідують колір найближчої канонічної
// категорії замість одного й того самого fallback-кольору для всіх.
const CATEGORY_COLOR_ALIASES: Readonly<Record<string, string>> = {
  groceries: "food",
  cafe: "restaurant",
  tech: "shopping",
};

/** Палітра для кастомних категорій; конкретний tier визначається лише з id. */
const FALLBACK_TIERS: CategoryColorTiers[] = categoryFallbackOrder.map(
  (id) => categoryColors[id],
);

function stableFallbackIndex(categoryId: string): number {
  // FNV-1a over UTF-16 code units. IDs are persisted values, so hashing the
  // ID keeps a category on the same tier in pickers, rows and charts even
  // when each surface sorts its list differently.
  let hash = 0x811c9dc5;
  for (let i = 0; i < categoryId.length; i += 1) {
    hash ^= categoryId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % FALLBACK_TIERS.length;
}

/**
 * Повний набір тирів для категорії: вбудована → стабільна палітра за id.
 *
 * Кастомний колір користувача (`custom.color`) тут НЕ враховується — це
 * один довільний hex без пари під текст, тож із нього не можна зібрати
 * читабельну пару фон/чорнило. Для сирого кольору є `getCatColor`.
 */
export function getCatTiers(categoryId: string, _idx = 0): CategoryColorTiers {
  const paletteId = CATEGORY_COLOR_ALIASES[categoryId] ?? categoryId;
  const base = CAT_TIERS[paletteId];
  if (base) return base;
  // `_idx` лишився у сигнатурі для source compatibility зі старими
  // викликами. Позиція у списку більше не впливає на колір.
  void _idx;
  return FALLBACK_TIERS[stableFallbackIndex(categoryId)] ?? FALLBACK_TIERS[0]!;
}

// Повертає HEX-колір для категорії: базовий → користувацький → з палітри.
// `FALLBACK_TIERS` гарантовано непорожня, тому fallback нижче не буде null —
// індекс просто wrap-иться по модулю.
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
  return getCatTiers(categoryId, idx).solid;
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
