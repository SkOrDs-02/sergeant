// @vitest-environment jsdom
/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Зйомка 2026-11-18: згорнутий блок «Мої рецепти» казав «1 рецептів».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SavedRecipe } from "../../lib/recipeBook";
import { RecipesFromBookRow } from "./RecipesFromBookRow";

function recipe(i: number): SavedRecipe {
  return {
    id: `r${i}`,
    title: `Страва ${i}`,
    timeMinutes: null,
    servings: 1,
    ingredients: [],
    steps: [],
    tips: [],
    macros: { kcal: 100, protein_g: null, fat_g: null, carbs_g: null },
    createdAt: 1,
    updatedAt: 1,
  } as SavedRecipe;
}

const many = (n: number) => Array.from({ length: n }, (_, i) => recipe(i));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("RecipesFromBookRow: підпис згорнутого блоку", () => {
  it.each([
    [1, "1 рецепт"],
    [2, "2 рецепти"],
    [5, "5 рецептів"],
    [11, "11 рецептів"],
    [21, "21 рецепт"],
  ])("%i → «%s»", (n, text) => {
    render(<RecipesFromBookRow recipes={many(n)} onPick={vi.fn()} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("порожня книга — блоку немає", () => {
    const { container } = render(
      <RecipesFromBookRow recipes={[]} onPick={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
  });
});
