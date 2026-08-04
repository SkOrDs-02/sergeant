import { mealTypeByNow, type MealTypeId } from "../../lib/mealTypes";
import type { NullableMacros } from "@sergeant/shared";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";

export function currentTime(): string {
  // Domain invariant: усі "коли це сталось" мітки — за Europe/Kyiv, не за
  // годинником пристрою (див. domain-invariants.md).
  const { hour, minute } = getKyivDateParts();
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface MealFormPhotoResult {
  dishName?: string | null;
  macros?: Partial<NullableMacros> | null;
}

export interface MealFormState {
  name: string;
  mealType: MealTypeId;
  time: string;
  kcal: string;
  protein_g: string;
  fat_g: string;
  carbs_g: string;
  err: string;
}

// Server-side fallback label when the AI photo analysis can't identify the
// food (see apps/server/src/lib/nutritionResponse.ts). Prefilling the name
// field with this literal reads as a real answer, so we blank it out and
// let the existing "name required" validation nudge the user to type one.
const PHOTO_FALLBACK_DISH_NAME = "Результат";

export function emptyForm(
  photoResult?: MealFormPhotoResult | null,
): MealFormState {
  const macros = photoResult?.macros || {};
  const dishName = (photoResult?.dishName || "").trim();
  return {
    name: dishName === PHOTO_FALLBACK_DISH_NAME ? "" : dishName,
    // Default to the meal that matches the current hour. Hard-coding
    // "breakfast" at 21:00 forced every late-dinner user to tap the picker
    // and flip the type to "Вечеря" before they could save.
    mealType: mealTypeByNow(),
    time: currentTime(),
    kcal: macros.kcal != null ? String(Math.round(macros.kcal)) : "",
    protein_g:
      macros.protein_g != null ? String(Math.round(macros.protein_g)) : "",
    fat_g: macros.fat_g != null ? String(Math.round(macros.fat_g)) : "",
    carbs_g: macros.carbs_g != null ? String(Math.round(macros.carbs_g)) : "",
    err: "",
  };
}
