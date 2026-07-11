// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickAddChips } from "./QuickAddChips";
import type { QuickChip } from "../hooks/useNutritionQuickChips";

const CHIP: QuickChip = {
  id: "c1",
  label: "Гречка",
  grams: 200,
  macros: { kcal: 220, protein_g: 8, fat_g: 2, carbs_g: 45 },
  source: "pantry",
  lastUsedAt: "2026-07-10",
};

describe("QuickAddChips", () => {
  it("returns null for empty or non-array chips", () => {
    const onTap = vi.fn();
    const { container: empty } = render(
      <QuickAddChips chips={[]} onTap={onTap} />,
    );
    expect(empty.firstChild).toBeNull();
    const { container: notArray } = render(
      <QuickAddChips chips={null as never} onTap={onTap} />,
    );
    expect(notArray.firstChild).toBeNull();
  });

  it("renders chips and invokes onTap", () => {
    const onTap = vi.fn();
    render(<QuickAddChips chips={[CHIP]} onTap={onTap} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Додати Гречка — 200 грамів",
      }),
    );
    expect(onTap).toHaveBeenCalledWith(CHIP);
  });
});
