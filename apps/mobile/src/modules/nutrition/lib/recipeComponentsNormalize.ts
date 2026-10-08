/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Валідація складу рецепта і ваги готової страви для mobile. Дзеркало
 * `apps/web/src/modules/nutrition/lib/recipeComponentsNormalize.ts`; обидва
 * нормалізатори (`normalizeSavedRecipe` і `rowToRecipe`) мусять пропускати
 * нові поля, інакше вони зникають при збереженні чи читанні з кешу.
 */
import type { RecipeComponent } from "@sergeant/nutrition-domain";
import { normalizeMacrosNullable } from "@sergeant/shared";

const MAX_COMPONENTS = 80;
const MAX_PORTION_GRAMS = 10_000;

function validGrams(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_PORTION_GRAMS ? n : null;
}

function normalizeRecipeComponents(
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
