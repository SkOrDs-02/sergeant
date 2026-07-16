/**
 * Спільні типи + LS-ключі модуля Харчування.
 *
 * Жодних залежностей на `localStorage` / `window` / `document` — це дозволяє
 * імпортувати той самий набір з web і з RN, не тягнучи `apps/web`-специфіку.
 */
import type { Macros, NullableMacros } from "@sergeant/shared";

import type { MealTypeId } from "./mealTypes.js";
import type { PantryItem } from "./pantryTextParser.js";

export const NUTRITION_PANTRIES_KEY = "nutrition_pantries_v1";
export const NUTRITION_ACTIVE_PANTRY_KEY = "nutrition_active_pantry_v1";
export const NUTRITION_PREFS_KEY = "nutrition_prefs_v1";
export const NUTRITION_LOG_KEY = "nutrition_log_v1";
/**
 * Per-tab sessionStorage cache for AI-generated recipes (Menu → recipes sub-tab).
 * Stored as `Record<cacheKey, RecipeCacheEntry>` JSON blob; values keyed by
 * `buildRecipeCacheKey(...)` from `apps/web/.../lib/recipeCache.ts`.
 */
export const NUTRITION_RECIPES_CACHE_KEY = "nutrition_recipes_cache_v1";

export type NutritionGoal = string;
export type MealMacroSource = "manual" | "productDb" | "photoAI" | "recipeAI";
export type MealSource = "manual" | "photo";

export interface MealTemplate {
  id: string;
  name: string;
  mealType: MealTypeId;
  macros: NullableMacros;
}

export interface NutritionPrefs {
  goal: NutritionGoal;
  servings: number;
  timeMinutes: number;
  exclude: string;
  recipeMealType: MealTypeId | "any";
  recipePantryMode: "prefer" | "only" | "ignore";
  dailyTargetKcal: number | null;
  dailyTargetProtein_g: number | null;
  dailyTargetFat_g: number | null;
  dailyTargetCarbs_g: number | null;
  mealTemplates: MealTemplate[];
  reminderEnabled: boolean;
  reminderHour: number;
  waterGoalMl: number;
}

export interface Pantry {
  id: string;
  name: string;
  items: PantryItem[];
  text: string;
}

export interface Meal {
  id: string;
  name: string;
  time: string;
  mealType: MealTypeId;
  label: string;
  macros: NullableMacros;
  source: MealSource;
  macroSource: MealMacroSource;
  amount_g: number | null;
  foodId: string | null;
  demo?: true;
}

export interface NutritionDay {
  meals: Meal[];
}

export type NutritionLog = Record<string, NutritionDay>;

export type NutritionLogLike =
  | Record<string, { meals?: unknown[] | null } | null | undefined>
  | null
  | undefined;

export interface DaySummary extends Macros {
  date: string;
  mealCount: number;
  hasMeals: boolean;
  hasAnyMacros: boolean;
}

export interface MealSearchResult {
  date: string;
  meal: Meal;
}

export interface MacrosRow extends Macros {
  date: string;
}
