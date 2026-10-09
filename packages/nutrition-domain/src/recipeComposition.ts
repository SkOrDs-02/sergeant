/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Валідація складу рецепта і ваги готової страви. Спільна для web
 * (`recipeBook.ts`, `sqliteReader.ts`) і mobile (`recipeBookStore.ts`,
 * `sqliteReader.ts`): усі нормалізатори мусять пропускати нові поля, інакше
 * вони зникають при збереженні чи на першому ж читанні з кешу.
 */
import { normalizeMacrosNullable } from "@sergeant/shared";
import type { RecipeComponent } from "./recipeComponents.js";

/** Та сама стеля, що в `ingredients`. */
const MAX_COMPONENTS = 80;

/** Стеля грамів для порції, компонента і ваги готової страви. */
export const MAX_PORTION_GRAMS = 10_000;

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

/** Склад і вага разом: вага без складу відкидається, невалідна вага стає `null`. */
export function recipeCompositionFields(raw: Record<string, unknown>): {
  components?: RecipeComponent[];
  cookedWeightG?: number | null;
} {
  const components = normalizeRecipeComponents(raw["components"]);
  return components
    ? { components, cookedWeightG: validGrams(raw["cookedWeightG"]) }
    : {};
}
