// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MealTemplatesRow } from "./MealTemplatesRow";
import type { MealFormState } from "./mealFormUtils";

describe("MealTemplatesRow", () => {
  it("returns null when templates are empty", () => {
    const { container } = render(
      <MealTemplatesRow mealTemplates={[]} setForm={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("fills form from template and calls onSelected", () => {
    const setForm = vi.fn() as Dispatch<SetStateAction<MealFormState>>;
    const onSelected = vi.fn();
    render(
      <MealTemplatesRow
        mealTemplates={[
          {
            id: "t1",
            name: "Омлет",
            mealType: "breakfast",
            macros: { kcal: 280, protein_g: 18, fat_g: 20, carbs_g: 2 },
          },
        ]}
        setForm={setForm}
        onSelected={onSelected}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Омлет" }));
    expect(setForm).toHaveBeenCalled();
    expect(onSelected).toHaveBeenCalled();
  });
});
