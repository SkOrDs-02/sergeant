// @vitest-environment jsdom
/**
 * Last validated: 2026-11-18
 * Status: Active
 * «Як учора» і «Нещодавні» в аркуші «Додати» (OD-27 Х-3 а).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Meal } from "@sergeant/nutrition-domain";
import type { QuickChip } from "../hooks/useNutritionQuickChips";
import { AddSheetRepeat } from "./AddSheetRepeat";

function meal(name: string, kcal: number): Meal {
  return {
    id: name,
    name,
    time: "19:00",
    mealType: "dinner",
    label: "Вечеря",
    macros: { kcal, protein_g: 1, fat_g: 1, carbs_g: 1 },
    source: "manual",
    macroSource: "manual",
    amount_g: null,
    foodId: null,
  };
}

function chip(label: string, kcal: number): QuickChip {
  return {
    id: `quickchip:${label}`,
    label,
    grams: 100,
    macros: { kcal, protein_g: 1, fat_g: 1, carbs_g: 1 },
    source: "recent-meal",
    lastUsedAt: "2026-11-17",
  };
}

describe("AddSheetRepeat", () => {
  it("«Як учора» показує страви й суму і копіює одним тапом", () => {
    const onCopyYesterday = vi.fn();
    const onDone = vi.fn();
    render(
      <AddSheetRepeat
        yesterdayMeals={[meal("Омлет", 310), meal("Лосось з овочами", 655.4)]}
        onCopyYesterday={onCopyYesterday}
        chips={[]}
        onQuickAdd={vi.fn()}
        onDone={onDone}
      />,
    );
    const hint = screen.getByText("Омлет, Лосось з овочами · 965 ккал");
    // Один рядок з обрізанням: довгий список страв не штовхає джерела
    // за край аркуша на 390 × 844.
    expect(hint.className).toContain("truncate");
    fireEvent.click(screen.getByRole("button", { name: /Як учора/ }));
    expect(onCopyYesterday).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("не більше трьох чипів «Нещодавні», тап записує і закриває аркуш", () => {
    const onQuickAdd = vi.fn();
    const onDone = vi.fn();
    const chips = [
      chip("Йогурт", 118),
      chip("Гречка", 540),
      chip("Салат", 45),
      chip("Сир", 200),
    ];
    render(
      <AddSheetRepeat
        yesterdayMeals={[]}
        onCopyYesterday={vi.fn()}
        chips={chips}
        onQuickAdd={onQuickAdd}
        onDone={onDone}
      />,
    );
    expect(screen.queryByRole("button", { name: /Як учора/ })).toBeNull();
    expect(screen.getByText("Нещодавні")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Сир/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Гречка/ }));
    expect(onQuickAdd).toHaveBeenCalledWith(chips[1]);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("немає ні вчорашнього, ні нещодавнього: блоку немає", () => {
    const { container } = render(
      <AddSheetRepeat
        yesterdayMeals={[]}
        onCopyYesterday={vi.fn()}
        chips={[]}
        onQuickAdd={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
