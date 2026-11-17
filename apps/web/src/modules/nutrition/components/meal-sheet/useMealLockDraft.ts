import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { useLockDraft } from "@shared/hooks/useLockDraft";
import { FORM_DRAFT_IDS } from "@shared/lib/storage/formDrafts";
import type { MealFormState } from "./mealFormUtils";
import type { PickedFood } from "./FoodPickerSection";
import type { NutritionPhotoResult } from "@shared/api";

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
  /** Продукт комори: без нього збереження не списало б його з комори. */
  fromPantryItem: string | null;
  /**
   * Результат розпізнавання фото. Сам `File` у sessionStorage не лягає, тож
   * після замка прийом зберігається з даними фото, але без вкладення.
   */
  photoResult: NutritionPhotoResult | null;
}

/** Сеттери джерела прийому (комора, фото). */
interface MealSourceSetters {
  setFromPantryItem: (v: string | null) => void;
  setAppliedPhoto: (
    v: { result: NutritionPhotoResult; file: null } | null,
  ) => void;
}

interface MealDraftSetters {
  setForm: Dispatch<SetStateAction<MealFormState>>;
  setPickedFood: (v: PickedFood | null) => void;
  setPickedGrams: (v: string) => void;
  setStep: (v: "source" | "fill") => void;
  setManualMacros: (v: boolean) => void;
}

export function isMealDraftDirty(d: MealLockDraft): boolean {
  const f = d.form;
  return (
    f.name.trim() !== "" ||
    f.kcal !== "" ||
    f.protein_g !== "" ||
    f.fat_g !== "" ||
    f.carbs_g !== "" ||
    d.pickedFood !== null ||
    d.fromPantryItem !== null ||
    d.photoResult !== null
  );
}

/** `active`: аркуш відкритий і це НОВИЙ запис (редагування чернеткою не пишемо). */
export function useMealLockDraft(
  active: boolean,
  draft: Omit<MealLockDraft, "photoResult"> & {
    appliedPhoto: { result: NutritionPhotoResult } | null;
  },
  setters: MealDraftSetters,
  sourceSetters: MealSourceSetters,
): void {
  const { form, pickedFood, pickedGrams, step, fromPantryItem } = draft;
  const photoResult = draft.appliedPhoto?.result ?? null;
  const snapshot = useMemo(() => {
    const d = {
      form,
      pickedFood,
      pickedGrams,
      step,
      fromPantryItem,
      photoResult,
    };
    return active && isMealDraftDirty(d) ? d : null;
  }, [
    active,
    form,
    pickedFood,
    pickedGrams,
    step,
    fromPantryItem,
    photoResult,
  ]);
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
      sourceSetters.setFromPantryItem(restored.fromPantryItem ?? null);
      const photo = restored.photoResult ?? null;
      sourceSetters.setAppliedPhoto(
        photo ? { result: photo, file: null } : null,
      );
    });
    // Відновлення рівно раз на відкриття; сеттери стабільні.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
