// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the meal-sheet `SaveAsTemplate` action.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SaveAsTemplate } from "./SaveAsTemplate";
import type { MealFormState } from "./mealFormUtils";

function form(overrides: Partial<MealFormState> = {}): MealFormState {
  return {
    name: "Омлет",
    mealType: "breakfast",
    time: "08:00",
    kcal: "300",
    protein_g: "20",
    fat_g: "15",
    carbs_g: "5",
    err: "",
    ...overrides,
  };
}

describe("SaveAsTemplate", () => {
  it("renders nothing without a setPrefs handler", () => {
    const { container } = render(
      <SaveAsTemplate form={form()} setForm={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("appends a template to prefs on save", () => {
    const setPrefs = vi.fn();
    render(
      <SaveAsTemplate form={form()} setForm={vi.fn()} setPrefs={setPrefs} />,
    );
    fireEvent.click(screen.getByText("+ Зберегти як шаблон"));
    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0];
    const next = updater({ mealTemplates: [] });
    expect(next.mealTemplates).toHaveLength(1);
    expect(next.mealTemplates[0]).toMatchObject({
      name: "Омлет",
      mealType: "breakfast",
      macros: { kcal: 300, protein_g: 20, fat_g: 15, carbs_g: 5 },
    });
  });

  it("errors when the name is empty", () => {
    const setForm = vi.fn();
    const setPrefs = vi.fn();
    render(
      <SaveAsTemplate
        form={form({ name: "  " })}
        setForm={setForm}
        setPrefs={setPrefs}
      />,
    );
    fireEvent.click(screen.getByText("+ Зберегти як шаблон"));
    expect(setPrefs).not.toHaveBeenCalled();
    expect(setForm).toHaveBeenCalled();
  });

  it("errors on non-finite macro values", () => {
    const setForm = vi.fn();
    const setPrefs = vi.fn();
    render(
      <SaveAsTemplate
        form={form({ kcal: "abc" })}
        setForm={setForm}
        setPrefs={setPrefs}
      />,
    );
    fireEvent.click(screen.getByText("+ Зберегти як шаблон"));
    expect(setPrefs).not.toHaveBeenCalled();
    expect(setForm).toHaveBeenCalled();
  });
});
