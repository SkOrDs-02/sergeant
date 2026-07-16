// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the meal-sheet MacrosEditor — kcal-free edits vs. the
 * guarded unlink-confirm flow for protein/fat/carbs when a food is linked.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MacrosEditor } from "./MacrosEditor";
import type { MealFormState } from "./mealFormUtils";
import type { PickedFood } from "./FoodPickerSection";

function makeForm(overrides: Partial<MealFormState> = {}): MealFormState {
  return {
    name: "",
    mealType: "lunch",
    time: "12:00",
    kcal: "",
    protein_g: "",
    fat_g: "",
    carbs_g: "",
    err: "",
    ...overrides,
  };
}

const pickedFood: PickedFood = {
  id: "food_1",
  name: "Молоко",
  per100: { kcal: 52 },
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("MacrosEditor", () => {
  it("renders the four macro inputs with the unlinked heading", () => {
    render(
      <MacrosEditor
        form={makeForm()}
        field={() => vi.fn()}
        setForm={vi.fn()}
        pickedFood={null}
        setPickedFood={vi.fn()}
        pickedGrams=""
        hasPhotoMacros={false}
      />,
    );
    expect(screen.getByText("КБЖВ")).toBeInTheDocument();
    expect(screen.getByLabelText("Ккал")).toBeInTheDocument();
    expect(screen.getByLabelText("Білки г")).toBeInTheDocument();
    expect(screen.getByLabelText("Жири г")).toBeInTheDocument();
    expect(screen.getByLabelText("Вуглев. г")).toBeInTheDocument();
  });

  it("routes free macro edits through the field setter when nothing is linked", () => {
    const setProtein = vi.fn();
    const field = vi.fn((key: keyof MealFormState) =>
      key === "protein_g" ? setProtein : vi.fn(),
    );
    render(
      <MacrosEditor
        form={makeForm()}
        field={field}
        setForm={vi.fn()}
        pickedFood={null}
        setPickedFood={vi.fn()}
        pickedGrams=""
        hasPhotoMacros={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Білки г"), {
      target: { value: "20" },
    });
    expect(setProtein).toHaveBeenCalledWith("20");
  });

  it("shows the linked heading and lets kcal edits bypass the unlink guard", () => {
    const setKcal = vi.fn();
    const field = vi.fn((key: keyof MealFormState) =>
      key === "kcal" ? setKcal : vi.fn(),
    );
    render(
      <MacrosEditor
        form={makeForm()}
        field={field}
        setForm={vi.fn()}
        pickedFood={pickedFood}
        setPickedFood={vi.fn()}
        pickedGrams="100"
        hasPhotoMacros={false}
      />,
    );
    expect(screen.getByText("КБЖВ (редагувати вручну)")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ккал"), {
      target: { value: "400" },
    });
    expect(setKcal).toHaveBeenCalledWith("400");
    // No confirmation dialog for kcal.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("opens the unlink confirm panel when editing protein on a linked food", () => {
    const setProtein = vi.fn();
    const field = vi.fn((key: keyof MealFormState) =>
      key === "protein_g" ? setProtein : vi.fn(),
    );
    render(
      <MacrosEditor
        form={makeForm()}
        field={field}
        setForm={vi.fn()}
        pickedFood={pickedFood}
        setPickedFood={vi.fn()}
        pickedGrams="100"
        hasPhotoMacros={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Білки г"), {
      target: { value: "9" },
    });
    // Edit deferred — field not called yet, dialog opened instead.
    expect(setProtein).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(/Редагувати КБЖВ для «Молоко» вручну/),
    ).toBeInTheDocument();
  });

  it("confirming the unlink clears the picked food and applies the deferred edit", () => {
    const setProtein = vi.fn();
    const setPickedFood = vi.fn();
    const field = vi.fn((key: keyof MealFormState) =>
      key === "protein_g" ? setProtein : vi.fn(),
    );
    render(
      <MacrosEditor
        form={makeForm()}
        field={field}
        setForm={vi.fn()}
        pickedFood={pickedFood}
        setPickedFood={setPickedFood}
        pickedGrams="100"
        hasPhotoMacros={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Білки г"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Редагувати вручну" }));
    expect(setPickedFood).toHaveBeenCalledWith(null);
    expect(setProtein).toHaveBeenCalledWith("9");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("cancelling the unlink keeps the link and discards the edit", () => {
    const setProtein = vi.fn();
    const setPickedFood = vi.fn();
    const field = vi.fn((key: keyof MealFormState) =>
      key === "protein_g" ? setProtein : vi.fn(),
    );
    render(
      <MacrosEditor
        form={makeForm()}
        field={field}
        setForm={vi.fn()}
        pickedFood={pickedFood}
        setPickedFood={setPickedFood}
        pickedGrams="100"
        hasPhotoMacros={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Жири г"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(setPickedFood).not.toHaveBeenCalled();
    expect(setProtein).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("offers an explicit manual-edit action that opens the confirm panel", () => {
    render(
      <MacrosEditor
        form={makeForm()}
        field={() => vi.fn()}
        setForm={vi.fn()}
        pickedFood={pickedFood}
        setPickedFood={vi.fn()}
        pickedGrams="100"
        hasPhotoMacros={false}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Редагувати КБЖВ вручну" }),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("restores macros from the photo result when the back-link is clicked", () => {
    const setForm = vi.fn();
    render(
      <MacrosEditor
        form={makeForm({ name: "Каша", time: "08:00", mealType: "breakfast" })}
        field={() => vi.fn()}
        setForm={setForm}
        pickedFood={null}
        setPickedFood={vi.fn()}
        pickedGrams=""
        photoResult={{ dishName: "Каша", macros: { kcal: 300 } }}
        hasPhotoMacros={true}
      />,
    );
    fireEvent.click(screen.getByText(/З результату фото/));
    expect(setForm).toHaveBeenCalledTimes(1);
    const updater = setForm.mock.calls[0]![0] as (
      s: MealFormState,
    ) => MealFormState;
    const next = updater(
      makeForm({ name: "Каша", time: "08:00", mealType: "breakfast" }),
    );
    // Meal-type/time/name preserved, kcal pulled from the photo result.
    expect(next.mealType).toBe("breakfast");
    expect(next.time).toBe("08:00");
    expect(next.name).toBe("Каша");
    expect(next.kcal).toBe("300");
  });
});
