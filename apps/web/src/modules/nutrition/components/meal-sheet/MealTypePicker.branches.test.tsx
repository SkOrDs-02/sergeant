// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MealTypePicker } from "./MealTypePicker";
import type { MealFormState } from "./mealFormUtils";

const BASE_FORM: MealFormState = {
  name: "",
  mealType: "snack",
  time: "12:00",
  kcal: "",
  protein_g: "",
  fat_g: "",
  carbs_g: "",
  err: "",
};

describe("MealTypePicker", () => {
  it("updates form mealType when a chip is clicked", () => {
    const setForm = vi.fn((updater: SetStateAction<MealFormState>) => {
      const next = typeof updater === "function" ? updater(BASE_FORM) : updater;
      expect(next.mealType).toBe("breakfast");
    }) as Dispatch<SetStateAction<MealFormState>>;
    render(<MealTypePicker mealType="snack" setForm={setForm} />);
    fireEvent.click(screen.getByRole("button", { name: /🌅 Сніданок/ }));
    expect(setForm).toHaveBeenCalled();
  });
});
