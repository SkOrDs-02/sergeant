// Pure domain helpers for categories of the Finyk module.
// Жодних React-хуків і жодного localStorage. Містить:
//  - визначення кольорів категорій (джерело правди для всіх графіків);
//  - побудову списку категорій для селектів/графіків;
//  - побудову списку сум по категоріях для статистики.
// `getCategory`, `resolveExpenseCategoryMeta`, `calcCategorySpent` реекспортуються
// з `utils`, щоб UI/хуки могли імпортувати все з одного domain-модуля.
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
  mccs?: number[];
  keywords?: string[];
  color?: string;
}

interface CustomCategory extends Category {
  color?: string;
}

// Стабільні кольори для базових категорій витрат.
const CAT_COLORS: Record<string, string> = {
  food: "#10b981",
  restaurant: "#f59e0b",
  transport: "#3b82f6",
  subscriptions: "#8b5cf6",
  health: "#ec4899",
  shopping: "#f97316",
  entertainment: "#14b8a6",
  sport: "#22c55e",
  beauty: "#e879f9",
  smoking: "#78716c",
  education: "#6366f1",
  travel: "#0ea5e9",
  debt: "#ef4444",
  charity: "#84cc16",
  utilities: "#64748b",
  other: "#94a3b8",
};

// Палітра для невідомих категорій — використовуємо idx, щоб кольори
// не стрибали між рендерами.
const FALLBACK_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#0ea5e9",
  "#f97316",
  "#14b8a6",
  "#8b5cf6",
  "#22c55e",
  "#e879f9",
];

// Повертає HEX-колір для категорії: базовий → користувацький → з палітри.
// `FALLBACK_COLORS` гарантовано непорожня, тому fallback на `[0]` нижче
// не буде null — індекс просто wrap-иться по модулю.
export function getCatColor(
  categoryId: string,
  customCategories: CustomCategory[] = [],
  idx = 0,
): string {
  const base = CAT_COLORS[categoryId];
  if (base) return base;
  const custom = Array.isArray(customCategories)
    ? customCategories.find((c) => c.id === categoryId)
    : null;
  if (custom?.color) return custom.color;
  const palette = FALLBACK_COLORS;
  return palette[idx % palette.length] ?? palette[0]!;
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
