/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Зберегти в журнал» після фото пише одразу (OD-27 Х-2 а, рішення власника
 * 2026-11-18): рядки будуються тією самою `buildMealsForSave`, що й крок
 * «fill», тож N позицій дають N рядків, як і раніше.
 *
 * `null` — одразу писати не можна, і аркуш іде старим шляхом через форму:
 * не-їжа, порожні КБЖВ (рішення засновника «не блокувати, а перепитати»
 * живе в формі) або страва без назви (серверне «Результат» — не назва).
 */
import type { NutritionPhotoResult } from "@shared/api";
import {
  labelForMealType,
  type Meal,
  type MealTypeId,
} from "@sergeant/nutrition-domain";
import {
  buildMealsForSave,
  currentTime,
  macrosAreAllEmpty,
} from "./mealFormUtils";

/** Серверна заглушка назви, коли модель не впізнала страву. */
const PHOTO_FALLBACK_DISH_NAME = "Результат";

export interface PhotoQuickMeals {
  meals: Meal[];
  /** Назва страви для тосту. */
  title: string;
}

export function buildPhotoQuickMeals(
  result: NutritionPhotoResult,
  mealType: MealTypeId,
  id: string,
): PhotoQuickMeals | null {
  if (result.isFood === false) return null;
  const rawName = (result.dishName || "").trim();
  const dishName = rawName === PHOTO_FALLBACK_DISH_NAME ? "" : rawName;
  const items = result.items?.length ? result.items : undefined;
  if (!items && !dishName) return null;
  const m = result.macros;
  const meals = buildMealsForSave({
    photoItems: items,
    time: currentTime(),
    mealType,
    label: labelForMealType(mealType),
    fallbackName: dishName || "Страва",
    fallback: {
      id,
      macros: {
        kcal: m?.kcal ?? null,
        protein_g: m?.protein_g ?? null,
        fat_g: m?.fat_g ?? null,
        carbs_g: m?.carbs_g ?? null,
      },
      source: "photo",
      macroSource: "photoAI",
      foodId: null,
      amount_g: null,
    },
  });
  if (meals.every((meal) => macrosAreAllEmpty(meal.macros))) return null;
  return {
    meals,
    title: dishName || meals.map((meal) => meal.name).join(", "),
  };
}
