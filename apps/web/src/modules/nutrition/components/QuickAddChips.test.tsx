// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for pantry-aware quick-add chips row.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { QuickChip } from "../hooks/useNutritionQuickChips";
import { QuickAddChips } from "./QuickAddChips";

const CHIP: QuickChip = {
  id: "chip-1",
  label: "Кава",
  grams: 200,
  macros: { kcal: 4, protein_g: 0, fat_g: 0, carbs_g: 0 },
  source: "recent-meal",
  lastUsedAt: "2026-06-24T08:00:00Z",
};

describe("QuickAddChips", () => {
  it("renders nothing when chips is empty", () => {
    const { container } = render(<QuickAddChips chips={[]} onTap={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders chip labels and kcal, and forwards taps to onTap", () => {
    const onTap = vi.fn();
    render(<QuickAddChips chips={[CHIP]} onTap={onTap} />);

    expect(
      screen.getByRole("group", { name: "Швидке додавання улюблених страв" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Кава")).toBeInTheDocument();
    expect(screen.getByText(/· 4 ккал/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Додати Кава — 200 грамів",
      }),
    );
    expect(onTap).toHaveBeenCalledWith(CHIP);
  });
});
