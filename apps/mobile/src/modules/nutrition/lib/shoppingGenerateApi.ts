/**
 * Адаптер для виклику `apiClient.nutrition.shoppingList` з мобільного
 * Shopping-екрану. Збирає payload із saved-recipes + pantry та
 * нормалізує respond-категорії перед записом у MMKV-стан списку покупок.
 *
 * Web-аналог: `apps/web/.../useNutritionRemoteActions.ts` —
 * `shoppingMutation`. Mobile-варіант лишається тонким: уся бізнес-логіка
 * (категорії, dedupe, id-генерація, видалення з комори) живе у
 * `@sergeant/nutrition-domain` (`normalizeShoppingList`) і на сервері
 * (Claude prompt у `apps/server/.../shopping-list.ts`).
 */
import type {
  ApiClient,
  NutritionShoppingListResponse,
} from "@sergeant/api-client";
import type { PantryItem, ShoppingCategory } from "@sergeant/nutrition-domain";

import type { SavedRecipe } from "./recipeBookStore";

/** Маркер вибраного джерела генерації. Зараз mobile реалізує тільки
 * `"recipes"` — `"weekplan"` зарезервовано для майбутнього порту web
 * `useNutritionUiState`-state-у. */
export type ShoppingSource = "recipes" | "weekplan";

/** Максимум pantry-items, які відправляємо в AI prompt (паритет із web). */
const PANTRY_ITEMS_LIMIT = 50;

interface RecipeShape {
  title: string;
  timeMinutes: number | null;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tips: string[];
  macros: SavedRecipe["macros"];
}

interface ShoppingRequestBody {
  recipes?: RecipeShape[];
  pantryItems: PantryItem[];
  locale: string;
}

/** Готує payload для `/api/nutrition/shopping-list`. Скидає mobile-only
 * поля (`id`, `createdAt`, `updatedAt`), бо вони не потрібні AI-промпту
 * — лишаємо тільки те, що читає сервер у
 * `apps/server/.../shopping-list.ts`. */
export function buildShoppingRequestBody({
  source,
  recipes,
  pantryItems,
  locale = "uk-UA",
}: {
  source: ShoppingSource;
  recipes: readonly SavedRecipe[];
  pantryItems: readonly PantryItem[];
  locale?: string;
}): ShoppingRequestBody {
  if (source !== "recipes") {
    throw new Error(
      "Тижневий план поки що недоступний у мобільній версії — обери «Рецепти».",
    );
  }
  if (!recipes.length) {
    throw new Error(
      "Немає збережених рецептів — спочатку додай хоча б один рецепт.",
    );
  }
  return {
    recipes: recipes.map((r) => ({
      title: r.title,
      timeMinutes: r.timeMinutes,
      servings: r.servings,
      ingredients: r.ingredients,
      steps: r.steps,
      tips: r.tips,
      macros: r.macros,
    })),
    pantryItems: pantryItems.slice(0, PANTRY_ITEMS_LIMIT),
    locale,
  };
}

/** Викликає AI-endpoint і повертає масив категорій, готових для
 * `useShoppingList().setGeneratedList()` (який пропустить їх через
 * `normalizeShoppingList` — додасть фінальний dedupe). Кидає `Error`,
 * якщо відповідь без поля `categories` (відповідає web-перевірці у
 * `shoppingMutation.mutationFn`). */
export async function callShoppingList(
  api: ApiClient,
  body: ShoppingRequestBody,
): Promise<ShoppingCategory[]> {
  const data: NutritionShoppingListResponse =
    await api.nutrition.shoppingList(body);
  if (!Array.isArray(data?.categories)) {
    throw new Error("Не вдалося згенерувати список покупок.");
  }
  // Сервер повертає `{name, items: [{name, quantity, note}]}` без
  // `id`/`checked` — добудовуємо їх локально (паритет із web
  // `adaptShoppingCategories`). `normalizeShoppingList` усередині
  // `setGeneratedList` робить фінальний dedupe.
  return data.categories.map((cat, catIdx) => ({
    name: String(cat.name ?? ""),
    items: (Array.isArray(cat.items) ? cat.items : []).map((it, itIdx) => ({
      id: `sl_${catIdx}_${itIdx}_${Math.random().toString(36).slice(2, 8)}`,
      name: String(it.name ?? ""),
      quantity: String(it.quantity ?? ""),
      note: String(it.note ?? ""),
      checked: false,
    })),
  }));
}
