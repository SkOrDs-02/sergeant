/**
 * Одна таксономія для списку покупок і комори (рішення власника 2026-10-01,
 * n3). До цієї дати список мав власні 11 категорій («Мʼясо та риба»,
 * «Хлібобулочні вироби» …), які називала модель, а комора - 17 своїх
 * (`foodCategories.ts`). Та сама позиція лежала в різних групах залежно від
 * того, де людина на неї дивилась.
 *
 * Тепер список використовує категорії комори. Що це дає коду:
 *  - промпт генерації списку бере мітки з реєстру `@sergeant/shared`
 *    (`PANTRY_CATEGORY_LABELS`), з якого мітки бере й каталог комори, а не
 *    тримає копію;
 *  - відповідь моделі (і збережені раніше списки зі старими назвами)
 *    зводиться до категорій комори через {@link resolveShoppingCategory} і
 *    {@link migrateShoppingListCategories}.
 *
 * AI-CONTEXT: форма відповіді `POST /api/nutrition/shopping-list` не змінилась
 * (категорія лишається рядком `name`), змінились лише допустимі значення, тому
 * контракт серверу ↔ api-client не рухається.
 */
import {
  ALL_FOOD_CATEGORIES,
  categorizeFood,
  type FoodCategory,
} from "./foodCategories.js";
import {
  normalizeShoppingList,
  type ShoppingItem,
  type ShoppingList,
  type ShoppingListLike,
} from "./shoppingList.js";

/** Категорії списку покупок = категорії комори плюс «Інше». */
export const SHOPPING_CATEGORIES: readonly FoodCategory[] = ALL_FOOD_CATEGORIES;

/**
 * Назву категорії порівнюємо згорнутою: регістр, апостроф («Мʼясо» з ʼ, ’ чи
 * ASCII '), подвійні пробіли й обрамлення лапками не мають значення — модель
 * друкує назву з перелічених, але не завжди буква в букву.
 */
function foldCategoryName(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[ʼ’'`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^[«"“(]+|[»"”).,;:!?]+$/gu, "")
    .trim();
}

const DIRECT = new Map<string, FoodCategory>();
for (const cat of SHOPPING_CATEGORIES) {
  DIRECT.set(foldCategoryName(cat.label), cat);
  DIRECT.set(foldCategoryName(cat.id), cat);
}

interface LegacyTarget {
  /** Категорія за замовчуванням. */
  id: string;
  /**
   * Стара категорія зливала кілька нових («Мʼясо та риба»): позиція йде туди,
   * куди її кладе комора, якщо це одна з цих. Інакше - у `id`.
   */
  alternatives?: readonly string[];
}

/**
 * Одинадцять назв, які до 2026-10-01 просив у моделі промпт списку покупок
 * (плюс «Приправи» з ранніх списків). Ключі - згорнуті назви.
 */
const LEGACY: ReadonlyMap<string, LegacyTarget> = new Map([
  ["мясо та риба", { id: "meat", alternatives: ["meat", "fish"] }],
  ["молочні продукти", { id: "dairy_eggs" }],
  ["овочі та гриби", { id: "vegetables" }],
  ["фрукти", { id: "fruits" }],
  ["крупи та злаки", { id: "grains" }],
  ["хлібобулочні вироби", { id: "grains" }],
  ["яйця", { id: "dairy_eggs" }],
  ["олії та жири", { id: "pantry" }],
  [
    "приправи та соуси",
    { id: "pantry", alternatives: ["pantry", "sauces", "spreads"] },
  ],
  ["приправи", { id: "pantry" }],
  ["напої", { id: "drinks" }],
]);

const BY_ID = new Map(SHOPPING_CATEGORIES.map((c) => [c.id, c]));

/**
 * Категорія списку за її НАЗВОЮ, як вона є зараз (мітка чи id комори); `null`
 * для всього іншого, включно зі старими назвами.
 */
export function findShoppingCategory(name: unknown): FoodCategory | null {
  return DIRECT.get(foldCategoryName(name)) ?? null;
}

/**
 * Категорія комори для позиції списку.
 *
 *  1. назва категорії - мітка чи id комори → вона;
 *  2. стара назва → її відповідник; де стара зливала кілька нових («Мʼясо та
 *     риба»), вирішує назва позиції через `categorizeFood`;
 *  3. невідома чи порожня назва → категорія за назвою позиції, а коли й вона
 *     не впізнається - «Інше».
 */
export function resolveShoppingCategory(
  categoryName: unknown,
  itemName?: unknown,
): FoodCategory {
  const direct = findShoppingCategory(categoryName);
  if (direct) return direct;

  const legacy = LEGACY.get(foldCategoryName(categoryName));
  if (legacy) {
    if (legacy.alternatives) {
      const guess = categorizeFood(itemName);
      if (legacy.alternatives.includes(guess.id)) return guess;
    }
    return BY_ID.get(legacy.id) ?? categorizeFood(itemName);
  }
  return categorizeFood(itemName);
}

/**
 * Зводить список до категорій комори: позиції зі старими чи вигаданими
 * назвами категорій переїжджають у відповідні групи, групи зі спільною
 * ціллю зливаються (дублі за назвою - як у `normalizeShoppingList`).
 *
 * Ідемпотентна: список, чиї категорії вже мітки комори, повертається лише
 * нормалізованим (`normalizeShoppingList`), без переміщень, тож виклик на
 * кожному читанні не плодить змін. Порядок груп - за першою появою, ручні
 * позиції (`source`) і галочки зберігаються.
 */
export function migrateShoppingListCategories(
  list: ShoppingListLike | null | undefined,
): ShoppingList {
  const normalized = normalizeShoppingList(list);
  const alreadyMigrated = normalized.categories.every((cat) => {
    const found = findShoppingCategory(cat.name);
    return found !== null && found.label === cat.name;
  });
  if (alreadyMigrated) return normalized;

  const grouped = new Map<string, ShoppingItem[]>();
  for (const cat of normalized.categories) {
    for (const item of cat.items) {
      const label = resolveShoppingCategory(cat.name, item.name).label;
      const bucket = grouped.get(label);
      if (bucket) bucket.push(item);
      else grouped.set(label, [item]);
    }
  }
  return normalizeShoppingList({
    categories: [...grouped].map(([name, items]) => ({ name, items })),
  });
}
