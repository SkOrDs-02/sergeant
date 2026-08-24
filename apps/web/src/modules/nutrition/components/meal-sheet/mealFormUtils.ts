import { mealTypeByNow, type MealTypeId } from "../../lib/mealTypes";
import type { NullableMacros } from "@sergeant/shared";
import { deviceTimeOfDay } from "@sergeant/nutrition-domain";

/**
 * 10 кг однієї порції — межа проти зайвого нуля, не дієтологія.
 *
 * AI-CONTEXT: живе тут, а не в компоненті, бо вагу порції задають ДВА
 * незалежні шляхи — крок «з упаковки» і картка обраного продукту. Поки
 * константа була приватною в картці, `useDecimalDraft` клампив лише
 * набране в ній самій, а значення, що прийшло ззовні готовим, проходило
 * повз межу і могло лягти в `amount_g`.
 */
export const MAX_PORTION_GRAMS = 10_000;

export function currentTime(): string {
  // ADR-0078: день-ключ запису — за годинником ПРИСТРОЮ, тож і час доби
  // поруч із ним мусить бути девайсовий. Київський час тут давав пару
  // «девайсовий день + київський настінний час», з якої `composeEatenAt`
  // складав момент, якого не існувало (о 23:53 UTC 23-го числа виходило
  // «23-тє 02:53»). `mealTypeByNow()` нижче вже рахує за `getHours()` —
  // тепер обидва дефолти читають один годинник.
  return deviceTimeOfDay();
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
