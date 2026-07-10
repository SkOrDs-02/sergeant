// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for meal-type picker in the meal sheet.
 */
import type { MealTypeId } from "@sergeant/nutrition-domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { act, useState } from "react";
import { describe, expect, it } from "vitest";

import type { MealFormState } from "./mealFormUtils";
import { emptyForm } from "./mealFormUtils";
import { MealTypePicker } from "./MealTypePicker";

function PickerHarness({ initial = "breakfast" as MealTypeId }) {
  const [form, setForm] = useState<MealFormState>({
    ...emptyForm(),
    mealType: initial,
  });
  return <MealTypePicker mealType={form.mealType} setForm={setForm} />;
}

describe("MealTypePicker", () => {
  it("highlights the active meal type and updates form on selection", () => {
    render(<PickerHarness initial="breakfast" />);

    const lunch = screen.getByRole("button", { name: /Обід/ });
    expect(lunch.className).not.toMatch(/bg-nutrition-strong/);

    act(() => {
      fireEvent.click(lunch);
    });
    expect(lunch.className).toMatch(/bg-nutrition-strong/);
  });
});
