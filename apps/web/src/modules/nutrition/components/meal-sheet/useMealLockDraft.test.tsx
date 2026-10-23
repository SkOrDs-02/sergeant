// @vitest-environment jsdom
/**
 * Last validated: 2026-10-23
 * Status: Active
 * sec-13: чернетка прийому під замком зберігає джерело (комора, фото), бо
 * без нього збереження не списало б продукт із комори і втратило б фото.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitStashedFormDrafts,
  discardAllFormDrafts,
  setFormDraftUser,
} from "@shared/lib/storage/formDrafts";
import type { NutritionPhotoResult } from "@shared/api";
import type { MealFormState } from "./mealFormUtils";
import { useMealLockDraft } from "./useMealLockDraft";

const emptyForm = {
  name: "",
  kcal: "",
  protein_g: "",
  fat_g: "",
  carbs_g: "",
} as unknown as MealFormState;
const form = { ...emptyForm, name: "Йогурт" } as MealFormState;
const photoResult = { dishName: "Салат" } as unknown as NutritionPhotoResult;

function setters() {
  return {
    setForm: vi.fn(),
    setPickedFood: vi.fn(),
    setPickedGrams: vi.fn(),
    setStep: vi.fn(),
    setManualMacros: vi.fn(),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  discardAllFormDrafts();
  setFormDraftUser("u1");
});

describe("useMealLockDraft: джерело прийому переживає замок", () => {
  it("відновлює продукт комори і результат фото, без File", async () => {
    const file = new File(["x"], "meal.jpg", { type: "image/jpeg" });
    const first = renderHook(() =>
      useMealLockDraft(
        true,
        {
          form,
          pickedFood: null,
          pickedGrams: "",
          step: "fill",
          fromPantryItem: "Йогурт",
          appliedPhoto: { result: photoResult, file } as never,
        },
        setters(),
        { setFromPantryItem: vi.fn(), setAppliedPhoto: vi.fn() },
      ),
    );
    first.unmount(); // замок
    commitStashedFormDrafts("u1");

    const source = { setFromPantryItem: vi.fn(), setAppliedPhoto: vi.fn() };
    renderHook(() =>
      useMealLockDraft(
        true,
        {
          form: emptyForm,
          pickedFood: null,
          pickedGrams: "",
          step: "source",
          fromPantryItem: null,
          appliedPhoto: null,
        },
        setters(),
        source,
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(source.setFromPantryItem).toHaveBeenCalledWith("Йогурт");
    expect(source.setAppliedPhoto).toHaveBeenCalledWith({
      result: photoResult,
      file: null,
    });
  });
});
