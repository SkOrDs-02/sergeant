/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Валідація складу рецепта і ваги готової страви. Спільна для обох
 * нормалізаторів книги (`normalizeRecipeForSave` у `recipeBook.ts` і
 * `rowToRecipe` у `sqliteReader.ts`): обидва мусять пропускати нові поля,
 * інакше вони зникають на першому ж читанні з кешу.
 */
import type { RecipeComponent } from "@sergeant/nutrition-domain";
import { normalizeMacrosNullable } from "@sergeant/shared";
import { MAX_PORTION_GRAMS } from "../components/meal-sheet/mealFormUtils";

/** Та сама стеля, що в `ingredients`. */
const MAX_COMPONENTS = 80;

function validGrams(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_PORTION_GRAMS ? n : null;
}

/** Невалідний компонент відкидається; порожній результат дає `undefined`. */
export function normalizeRecipeComponents(
  raw: unknown,
): RecipeComponent[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: RecipeComponent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const name = typeof c["name"] === "string" ? c["name"].trim() : "";
    const grams = validGrams(c["grams"]);
    if (!name || grams == null) continue;
    out.push({
      name,
      grams,
      foodId:
        typeof c["foodId"] === "string" && c["foodId"] ? c["foodId"] : null,
      per100: normalizeMacrosNullable(c["per100"]),
    });
    if (out.length >= MAX_COMPONENTS) break;
  }
  return out.length > 0 ? out : undefined;
}

/** Невалідна вага не помилка збереження: рецепт лишається в режимі порцій. */
export function normalizeCookedWeightG(raw: unknown): number | null {
  return validGrams(raw);
}
