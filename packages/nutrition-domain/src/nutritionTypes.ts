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
export type MealMacroSource =
  "manual" | "productDb" | "photoAI" | "recipeAI" | "recipe";
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
  /** Щотижневе калібрування цілі за фактичним енергобалансом. */
  adaptiveGoalEnabled: boolean;
  adaptiveGoalIntent: "cutting" | "maintenance" | "bulking";
  /** ISO timestamp останнього успішного автоматичного перерахунку. */
  adaptiveGoalLastUpdatedAt: string | null;
  /**
   * ЗНІМОК підстави останнього перерахунку — числа на момент, коли ціль
   * змінилась.
   *
   * AI-DANGER: картка пояснення мусить читати саме це, а не рахувати
   * заново. Виміряний TDEE перераховується з ковзного вікна на КОЖЕН
   * рендер, тож «жива» підстава через день після зміни вже інша — і
   * картка приписувала б минулій зміні сьогоднішні числа. Пояснення
   * говорить про ПОДІЮ, а подія вже сталась.
   */
  adaptiveGoalLastReason: {
    averageIntakeKcal: number;
    weightDeltaKg: number;
    tdeeKcal: number;
    goalKcal: number;
  } | null;
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
  /**
   * Raw journal row count for the day. A single photo with N items writes N
   * rows (`AddMealSheet` multi-item save, decision 2026-09-03) — this field
   * counts rows, NOT meal occasions. Do not use it to gate "is the day's
   * meal log complete" (that reads a plated dish as several meals); use
   * `loggedMealTypesCount` for that. Kept for callers that genuinely want a
   * row count.
   */
  mealCount: number;
  hasMeals: boolean;
  hasAnyMacros: boolean;
  /**
   * Number of distinct meal occasions (`MEAL_ORDER`: breakfast/lunch/
   * dinner/snack, 0..4) with non-zero kcal logged for the day —
   * calorie-weighted per type, mirroring `estimatedKcalShare` below.
   * Nutrition audit PR-N2 (2026-09-13): a single photo split into "суп +
   * хліб + салат" writes 3 rows of the SAME meal type, so `mealCount`
   * (row count) read that dinner as "3 прийоми їжі" and cleared the
   * incomplete-day marker. This field counts occasions, not rows — three
   * items from one photo count as 1, three genuinely separate meals count
   * as 3. Use this (not `mealCount`) for "day complete" / "N of 4 meals
   * logged" signals (canon §5.2).
   */
  loggedMealTypesCount: number;
  /**
   * Share of the day's kcal (0..1) that came from `photoAI`-sourced meals —
   * calorie-weighted, not meal-count-weighted (founder decision 2026-08-04,
   * nutrition audit E-5: three 100-kcal manual meals + one 900-kcal photo
   * guess is a 75%-guessed day, not 25%). `0` when the day has no kcal yet.
   */
  estimatedKcalShare: number;
}

/**
 * Above this share, the day's kcal total is "mostly guessed" and callers
 * should soften categorical copy/visuals (nutrition audit E-5). Exactly
 * 50% does NOT count — the founder's threshold is strictly ">50%".
 */
export const ESTIMATED_KCAL_SHARE_THRESHOLD = 0.5;

export interface MealSearchResult {
  date: string;
  meal: Meal;
}

export interface MacrosRow extends Macros {
  date: string;
}
