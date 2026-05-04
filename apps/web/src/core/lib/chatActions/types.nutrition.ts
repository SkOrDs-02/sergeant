/**
 * Nutrition-доменні chat-action payload-и + NutritionMeal/NutritionDay.
 * Виокремлено з `types.ts` (initiative 0001 Phase 2).
 */

// ─── Action payload-и ──────────────────────────────────────────────────────

export interface LogMealAction {
  name: "log_meal";
  input: {
    name?: string;
    kcal?: number | string;
    protein_g?: number | string;
    fat_g?: number | string;
    carbs_g?: number | string;
  };
}

export interface LogWaterAction {
  name: "log_water";
  input: {
    amount_ml: number | string;
    date?: string;
  };
}

export interface AddRecipeAction {
  name: "add_recipe";
  input: {
    title: string;
    ingredients?: string[];
    steps?: string[];
    servings?: number | string;
    time_minutes?: number | string;
    kcal?: number | string;
    protein_g?: number | string;
    fat_g?: number | string;
    carbs_g?: number | string;
  };
}

export interface AddToShoppingListAction {
  name: "add_to_shopping_list";
  input: {
    name: string;
    quantity?: string;
    note?: string;
    category?: string;
  };
}

export interface ConsumeFromPantryAction {
  name: "consume_from_pantry";
  input: { name: string };
}

export interface SetDailyPlanAction {
  name: "set_daily_plan";
  input: {
    kcal?: number | string;
    protein_g?: number | string;
    fat_g?: number | string;
    carbs_g?: number | string;
    water_ml?: number | string;
  };
}

export interface SuggestMealAction {
  name: "suggest_meal";
  input: { focus?: string; meal_type?: string };
}

export interface CopyMealFromDateAction {
  name: "copy_meal_from_date";
  input: { source_date: string; meal_index?: number | string };
}

export interface PlanMealsForDayAction {
  name: "plan_meals_for_day";
  input: {
    target_kcal?: number | string;
    meals_count?: number | string;
    preferences?: string;
  };
}

// ─── Domain entities (зберігаються в localStorage) ──────────────────────────

export interface NutritionMeal {
  id: string;
  name: string;
  macros: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  addedAt: string;
}

export interface NutritionDay {
  meals: NutritionMeal[];
}
