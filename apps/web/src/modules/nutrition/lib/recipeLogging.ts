/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Скільки і яких макросів іде в журнал, коли рецепт додають як прийом їжі.
 * Окремий модуль, щоб `RecipesCard.tsx` лишався під 600 рядків (Hard Rule #18).
 */
import type {
  Meal,
  MealMacroSource,
  MealTypeId,
} from "@sergeant/nutrition-domain";
import {
  MEAL_TYPES,
  computeRecipePer100,
  type RecipeComponent,
} from "@sergeant/nutrition-domain";
import type { NullableMacros } from "@sergeant/shared";
import { MAX_PORTION_GRAMS } from "../components/meal-sheet/mealFormUtils";
import { scaleMacros } from "./recipeBook";

/** Спільне для збереженого і щойно згенерованого (`RecipeLike`) рецепта. */
export interface LoggableRecipe {
  macros?: unknown;
  servings?: number | null | undefined;
  components?: RecipeComponent[] | undefined;
  cookedWeightG?: number | null | undefined;
}

export type RecipeLogMode = "portions" | "grams";

export interface RecipeLogEntry {
  macros: NullableMacros;
  amount_g: number | null;
  macroSource: MealMacroSource;
}

/** Рецепт можна логувати грамами лише коли відома вага готової страви. */
export function supportsGramsLogging(r: {
  components?: unknown[] | undefined;
  cookedWeightG?: number | null | undefined;
}): boolean {
  return (
    Array.isArray(r.components) &&
    r.components.length > 0 &&
    r.cookedWeightG != null &&
    r.cookedWeightG > 0
  );
}

/** Вага однієї порції готової страви, г, округлена: дефолт поля «Грами». */
export function defaultServingGrams(r: LoggableRecipe): number {
  const servings = r.servings && r.servings > 0 ? r.servings : 1;
  return Math.max(1, Math.round((r.cookedWeightG ?? 0) / servings));
}

/** Грами з текстового поля: ціле > 0 і ≤ стелі, інакше `null`. */
export function parseGramsInput(raw: string | null | undefined): number | null {
  const n = Number(String(raw ?? "").replace(",", "."));
  return Number.isInteger(n) && n > 0 && n <= MAX_PORTION_GRAMS ? n : null;
}

export function buildRecipeLogEntry(
  r: LoggableRecipe,
  mode: RecipeLogMode,
  factor: number,
  grams: number | null,
): RecipeLogEntry {
  const macroSource: MealMacroSource =
    Array.isArray(r.components) && r.components.length > 0
      ? "recipe"
      : "recipeAI";
  const cooked = supportsGramsLogging(r) ? (r.cookedWeightG as number) : null;
  if (mode === "grams" && cooked != null && grams != null) {
    const per100 = computeRecipePer100(r.components ?? [], cooked);
    return {
      macros: scaleMacros(per100, grams / 100),
      amount_g: grams,
      macroSource,
    };
  }
  const servings = r.servings && r.servings > 0 ? r.servings : 1;
  return {
    macros: scaleMacros(r.macros, factor),
    amount_g:
      cooked != null
        ? Math.round((cooked / servings) * factor * 10) / 10
        : null,
    macroSource,
  };
}

/**
 * Рядок журналу з рецепта. Один будівельник для «Моїх рецептів» у Меню і
 * для рецепта у формі прийому (OD-27 Х-3 в), щоб два входи писали одне й те
 * саме: назва рецепта, КБЖВ і вага з `buildRecipeLogEntry`, без `foodId`.
 */
export function recipeMeal(
  title: string | null | undefined,
  entry: RecipeLogEntry,
  at: { id: string; mealType: MealTypeId; time: string },
): Meal {
  return {
    id: at.id,
    time: at.time,
    mealType: at.mealType,
    label: MEAL_TYPES.find((x) => x.id === at.mealType)?.label || "Прийом їжі",
    name: title || "Рецепт",
    macros: {
      kcal: entry.macros.kcal ?? null,
      protein_g: entry.macros.protein_g ?? null,
      fat_g: entry.macros.fat_g ?? null,
      carbs_g: entry.macros.carbs_g ?? null,
    },
    source: "manual",
    macroSource: entry.macroSource,
    foodId: null,
    amount_g: entry.amount_g,
  };
}
