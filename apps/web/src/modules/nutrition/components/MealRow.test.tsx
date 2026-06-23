// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the `MealRow` log entry row.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/mealPhotoStorage", () => ({
  getMealThumbnailBlob: vi.fn().mockResolvedValue(null),
}));

import { MealRow } from "./MealRow";

const baseMeal = {
  id: "m1",
  time: "12:30",
  mealType: "lunch",
  name: "Гречка з куркою",
  label: "Обід",
  macros: { kcal: 420, protein_g: 35, fat_g: 12, carbs_g: 40 },
  source: "manual",
  macroSource: "manual",
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("MealRow", () => {
  it("renders the meal name, time, and macros", () => {
    render(<MealRow meal={baseMeal as never} />);
    expect(screen.getByText("Гречка з куркою")).toBeInTheDocument();
    expect(screen.getByText("12:30")).toBeInTheDocument();
    expect(screen.getByText("420 ккал")).toBeInTheDocument();
    expect(screen.getByText("Б 35г")).toBeInTheDocument();
  });

  it("shows an AI badge for photoAI-sourced macros", () => {
    render(<MealRow meal={{ ...baseMeal, macroSource: "photoAI" } as never} />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("shows a DB badge for productDb-sourced macros", () => {
    render(
      <MealRow meal={{ ...baseMeal, macroSource: "productDb" } as never} />,
    );
    expect(screen.getByText("DB")).toBeInTheDocument();
  });

  it("invokes onEdit and onRemove callbacks", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(
      <MealRow meal={baseMeal as never} onEdit={onEdit} onRemove={onRemove} />,
    );
    fireEvent.click(screen.getByLabelText("Редагувати запис"));
    expect(onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Видалити запис"));
    expect(onRemove).toHaveBeenCalled();
  });

  it("disables the edit affordance when onEdit is absent", () => {
    render(<MealRow meal={baseMeal as never} />);
    expect(screen.queryByLabelText("Редагувати запис")).not.toBeInTheDocument();
  });

  it("omits macro chips that are null", () => {
    render(
      <MealRow
        meal={
          {
            ...baseMeal,
            macros: { kcal: 200, protein_g: null, fat_g: null, carbs_g: null },
          } as never
        }
      />,
    );
    expect(screen.getByText("200 ккал")).toBeInTheDocument();
    expect(screen.queryByText(/^Б /)).not.toBeInTheDocument();
  });
});
