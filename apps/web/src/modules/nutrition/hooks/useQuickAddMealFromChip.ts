/**
 * Last validated: 2026-08-07
 * Status: Active
 *
 * Phase 6.6 — one-tap add from a hero quick-chip. Reuses `log.handleAddMeal`
 * (the exact storage write `AddMealSheet.onSave` → `wrappedSaveMeal` lands
 * on) so we do not write a parallel persistence layer. Undo points at the
 * same `handleRemoveMeal` that journal swipe-to-delete uses, keeping
 * behaviour symmetric with the rest of Nutrition.
 *
 * Винесено з `NutritionApp.tsx` 2026-08-07 — файл їхав по стелі Hard Rule
 * #18 (`max-lines: 600`), і undo-тост для «Страву додано» його пробив.
 * Поведінка не мінялась.
 */
import { useCallback } from "react";
import type { Meal } from "@sergeant/nutrition-domain";
import {
  MEAL_TYPES,
  deviceTimeOfDay,
  mealTypeByHour,
} from "@sergeant/nutrition-domain";
import type { ToastApi } from "@shared/hooks/useToast";
import { newMealId } from "../lib/mealId";
import type { QuickChip } from "./useNutritionQuickChips";

/** Мінімальний зріз `useNutritionLog`, потрібний квік-чипу. */
interface QuickAddMealLog {
  selectedDate: string;
  handleAddMeal: (meal: Meal) => void;
  handleRemoveMeal: (date: string, id: string) => void;
}

export function useQuickAddMealFromChip({
  log,
  toast,
}: {
  log: QuickAddMealLog;
  toast: ToastApi;
}): (chip: QuickChip) => void {
  return useCallback(
    (chip: QuickChip) => {
      // ADR-0078: і `mealType`, і `time` беремо з годинника ПРИСТРОЮ — з
      // того самого, що дав `log.selectedDate`. Київська пара поруч із
      // девайсовим день-ключем робила `eaten_at` неіснуючим моментом.
      const now = new Date();
      // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: тип прийому їжі й час доби належать ОСОБИСТОМУ дню, а він за пристроєм — тим самим годинником, що дав `log.selectedDate`
      const mealTypeId = mealTypeByHour(now.getHours());
      const mealLabel =
        MEAL_TYPES.find((m) => m.id === mealTypeId)?.label || "Прийом їжі";
      const id = newMealId();
      const meal: Meal = {
        id,
        name: chip.label,
        time: deviceTimeOfDay(now),
        mealType: mealTypeId,
        label: mealLabel,
        macros: {
          kcal: chip.macros.kcal,
          protein_g: chip.macros.protein_g,
          fat_g: chip.macros.fat_g,
          carbs_g: chip.macros.carbs_g,
        },
        // Quick-chip is a synthetic re-log; treat it as manual so existing
        // analytics / dual-write paths handle it like any keyboard entry.
        // `MealMacroSource` enum has no "pantry" member — the chip's pantry
        // affinity is a display hint only, not a persisted classification.
        source: "manual",
        macroSource: "manual",
        amount_g: chip.grams,
        foodId: null,
      };
      const dateForLog = log.selectedDate;
      log.handleAddMeal(meal);
      toast.success(
        `${chip.label} додано · ${chip.macros.kcal} ккал`,
        undefined,
        {
          label: "Скасувати",
          onClick: () => {
            log.handleRemoveMeal(dateForLog, id);
          },
        },
      );
    },
    [log, toast],
  );
}
