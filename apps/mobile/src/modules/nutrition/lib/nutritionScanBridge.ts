import type { MealFormState } from "../components/meal-sheet/mealFormUtils";

export type NutritionScanPrefill = Pick<
  MealFormState,
  "name" | "kcal" | "protein_g" | "fat_g" | "carbs_g" | "err"
> & {
  partial: boolean;
  /** raw digits, для діагностики / майбутнього pantry-bind */
  barcode: string;
};

type PrefillHandler = (payload: NutritionScanPrefill) => void;

let prefillHandler: PrefillHandler | null = null;

/**
 * AddMealSheet реєструє handler на час `open`, scan-екран викликає
 * `emit` перед `router.back()`.
 */
export function setNutritionScanPrefillHandler(h: PrefillHandler | null): void {
  prefillHandler = h;
}

export function emitNutritionScanPrefill(payload: NutritionScanPrefill): void {
  prefillHandler?.(payload);
}
