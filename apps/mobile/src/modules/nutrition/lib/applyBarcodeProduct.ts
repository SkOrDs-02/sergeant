import type { BarcodeProduct } from "@sergeant/api-client";

import {
  currentTime,
  emptyForm,
  type MealFormState,
} from "../components/meal-sheet/mealFormUtils";

/**
 * Мапа відповіді `/api/barcode` у поля форми прийому їжі (як web `useBarcodeLookup`).
 */
export function mealFormStateFromBarcodeProduct(
  p: BarcodeProduct,
  _barcode: string,
): MealFormState {
  const base = emptyForm(null);
  if (!p.name?.trim()) {
    return { ...base, name: "", err: "" };
  }
  const grams = p.servingGrams && p.servingGrams > 0 ? p.servingGrams : 100;
  const factor = grams / 100;
  const name = [p.name, p.brand].filter(Boolean).join(" ").trim();
  return {
    ...base,
    name,
    time: currentTime(),
    kcal:
      p.kcal_100g != null
        ? String(Math.round(p.kcal_100g * factor))
        : base.kcal,
    protein_g:
      p.protein_100g != null
        ? String(Math.round(p.protein_100g * factor))
        : base.protein_g,
    fat_g:
      p.fat_100g != null ? String(Math.round(p.fat_100g * factor)) : base.fat_g,
    carbs_g:
      p.carbs_100g != null
        ? String(Math.round(p.carbs_100g * factor))
        : base.carbs_g,
    err: "",
  };
}
