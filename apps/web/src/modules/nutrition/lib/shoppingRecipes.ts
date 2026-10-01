/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Вибір рецептів для списку покупок: збережені («Мої рецепти») і щойно
 * згенеровані в одному переліку, і приведення позначених до форми, яку
 * приймає `POST /api/nutrition/shopping-list` (`ShoppingListSchema` у
 * `@sergeant/shared`). Контракт ендпоінта не змінювався: він і раніше брав
 * масив `recipes`, клієнт просто слав усі згенеровані без вибору.
 */
import type { SavedRecipe } from "./recipeBook";

/**
 * Стелі `ShoppingListRecipe` / `ShoppingListSchema` (packages/shared,
 * `schemas/api.ts`): до 20 рецептів, назва до 200 символів, до 50 інгредієнтів
 * по 200. Дзеркалимо їх тут, бо збережений рецепт (особливо створений через
 * чат-tool `add_recipe`) не мусить вкладатись у ці межі, а 400 на весь запит
 * через один довгий інгредієнт читається як «список не склався».
 */
export const SHOPPING_RECIPES_MAX = 20;
const TITLE_MAX = 200;
const INGREDIENTS_MAX = 50;
const INGREDIENT_MAX = 200;

export type RecipeOptionGroup = "saved" | "generated";

export interface RecipeOption {
  /** Стабільний ключ вибору; префікс групи, бо `id` двох груп можуть збігтись. */
  key: string;
  group: RecipeOptionGroup;
  title: string;
  ingredientCount: number;
  /** Оригінальний обʼєкт рецепта: його ж віддаємо в `toShoppingRecipe`. */
  source: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function ingredientsOf(source: unknown): string[] {
  const raw = asRecord(source)["ingredients"];
  return Array.isArray(raw)
    ? raw.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
}

function titleOf(source: unknown): string {
  const t = asRecord(source)["title"];
  return typeof t === "string" ? t.trim() : "";
}

/** Ключ порівняння назв: той самий рецепт, збережений із згенерованих, не має двічі потрапити в перелік. */
function titleKey(title: string): string {
  return title.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Збережені + згенеровані → два впорядковані списки варіантів.
 *
 * Згенерований рецепт, чию назву вже збережено, у «Згенеровані» не
 * показується: після «Зберегти» він лежить у книзі окремим записом, і дві
 * позначки на одну страву склали б у запит її інгредієнти двічі (промпт
 * сумує однакові продукти, але подвоєну кількість нічим не відрізнить від
 * справжньої).
 */
export function buildRecipeOptions(
  saved: readonly SavedRecipe[],
  generated: readonly unknown[],
): { saved: RecipeOption[]; generated: RecipeOption[] } {
  const savedKeys = new Set<string>();
  const savedOptions: RecipeOption[] = [];
  for (const r of saved) {
    const title = titleOf(r) || "Рецепт";
    savedKeys.add(titleKey(title));
    savedOptions.push({
      key: `saved:${r.id}`,
      group: "saved",
      title,
      ingredientCount: ingredientsOf(r).length,
      source: r,
    });
  }

  const generatedOptions: RecipeOption[] = [];
  generated.forEach((r, idx) => {
    const title = titleOf(r);
    if (title && savedKeys.has(titleKey(title))) return;
    const rawId = asRecord(r)["id"];
    const id = rawId != null && rawId !== "" ? String(rawId) : title || idx;
    generatedOptions.push({
      key: `generated:${id}:${idx}`,
      group: "generated",
      title: title || `Рецепт ${idx + 1}`,
      ingredientCount: ingredientsOf(r).length,
      source: r,
    });
  });

  return { saved: savedOptions, generated: generatedOptions };
}

/** `{ title, ingredients }` у межах стель схеми; усе інше (кроки, макроси) серверу для списку покупок не потрібне. */
export function toShoppingRecipe(source: unknown): {
  title: string;
  ingredients: string[];
} {
  return {
    title: (titleOf(source) || "Рецепт").slice(0, TITLE_MAX),
    ingredients: ingredientsOf(source)
      .slice(0, INGREDIENTS_MAX)
      .map((i) => i.slice(0, INGREDIENT_MAX)),
  };
}

/** Позначені варіанти в порядку переліку, не більше {@link SHOPPING_RECIPES_MAX}. */
export function pickSelectedRecipes(
  options: readonly RecipeOption[],
  selectedKeys: ReadonlySet<string>,
): RecipeOption[] {
  return options
    .filter((o) => selectedKeys.has(o.key))
    .slice(0, SHOPPING_RECIPES_MAX);
}
