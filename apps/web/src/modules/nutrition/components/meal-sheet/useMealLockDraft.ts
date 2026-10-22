import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { useLockDraft } from "@shared/hooks/useLockDraft";
import { FORM_DRAFT_IDS } from "@shared/lib/storage/formDrafts";
import type { MealFormState } from "./mealFormUtils";
import type { PickedFood } from "./FoodPickerSection";

/**
 * Чернетка аркуша «Додати прийом» під замком застосунку (sec-13, priv-15,
 * рішення власника 2026-10-22). Механізм: `@shared/lib/storage/formDrafts`.
 * Редагування наявного запису не зберігається: його джерело правди — журнал.
 */
export interface MealLockDraft {
  form: MealFormState;
  pickedFood: PickedFood | null;
  pickedGrams: string;
  step: "source" | "fill";
}

interface Options {
  /** Аркуш відкритий і це НОВИЙ запис (редагування чернеткою не пишемо). */
  active: boolean;
  draft: MealLockDraft;
  setters: {
    setForm: Dispatch<SetStateAction<MealFormState>>;
    setPickedFood: (v: PickedFood | null) => void;
    setPickedGrams: (v: string) => void;
    setStep: (v: "source" | "fill") => void;
    setManualMacros: (v: boolean) => void;
  };
}

export function isMealDraftDirty(d: MealLockDraft): boolean {
  const f = d.form;
  return (
    f.name.trim() !== "" ||
    f.kcal !== "" ||
    f.protein_g !== "" ||
    f.fat_g !== "" ||
    f.carbs_g !== "" ||
    d.pickedFood !== null
  );
}

export function useMealLockDraft({ active, draft, setters }: Options): void {
  const { form, pickedFood, pickedGrams, step } = draft;
  const snapshot = useMemo(() => {
    const d = { form, pickedFood, pickedGrams, step };
    return active && isMealDraftDirty(d) ? d : null;
  }, [active, form, pickedFood, pickedGrams, step]);
  const { take } = useLockDraft<MealLockDraft>(
    FORM_DRAFT_IDS.nutritionMeal,
    snapshot,
  );

  useEffect(() => {
    if (!active) return;
    const restored = take();
    if (!restored) return;
    // Ініціалізація аркуша йде в рендері; відновлення — мікротаском після
    // неї, як і в `ManualExpenseSheet`, щоб не гнатися з нею за стан.
    void Promise.resolve().then(() => {
      setters.setForm({ ...restored.form, err: "" });
      setters.setPickedFood(restored.pickedFood);
      setters.setPickedGrams(restored.pickedGrams);
      setters.setStep(restored.step);
      setters.setManualMacros(true);
    });
    // Відновлення рівно раз на відкриття; сеттери стабільні.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
