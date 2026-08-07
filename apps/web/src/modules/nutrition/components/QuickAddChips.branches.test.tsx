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

  // Регресія: рядок чіпів розпирав hero-карту й весь grid-трек колонки
  // (Chromium @390px — 996px замість 358px), бо `overflow-x-auto` не
  // обнуляє внесок вмісту в min-content grid-item-а. Пін на containment —
  // jsdom не рахує розкладку, тож механізм перевіряємо по класу.
  it("keeps the scroll row's width independent of its content", () => {
    render(<QuickAddChips chips={[CHIP]} onTap={vi.fn()} />);
    const row = screen.getByRole("group", {
      name: "Швидке додавання улюблених страв",
    });
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).toContain("[contain:inline-size]");
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
