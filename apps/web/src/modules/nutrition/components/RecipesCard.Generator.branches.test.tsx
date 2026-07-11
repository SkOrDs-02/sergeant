// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { GeneratorCard } from "./RecipesCard.Generator";

const PREFS = {
  goal: "balanced",
  servings: 2,
  timeMinutes: 30,
  exclude: "",
} as NutritionPrefs;

describe("GeneratorCard", () => {
  it("shows session cache hint when recipe cache has entries", () => {
    render(
      <GeneratorCard
        prefs={PREFS}
        setPrefs={vi.fn()}
        recommendRecipes={vi.fn()}
        recipes={[]}
        fmtMacro={(v) => String(v)}
        onSave={vi.fn()}
        onAddToLog={vi.fn()}
        recipeCacheEntry={{ recipes: [{ id: "r1" }], recipesRaw: "" }}
      />,
    );
    expect(screen.getByText(/є кеш сеансу/)).toBeInTheDocument();
  });

  it("renders recipes and invokes callbacks", () => {
    const onSave = vi.fn();
    const onAddToLog = vi.fn();
    render(
      <GeneratorCard
        prefs={PREFS}
        setPrefs={vi.fn()}
        recommendRecipes={vi.fn()}
        recipes={[
          {
            id: "gen-1",
            title: "Салат",
            timeMinutes: 15,
            macros: {
              kcal: 180,
              protein_g: 5,
              fat_g: 10,
              carbs_g: 20,
            },
            ingredients: ["огірок"],
          },
        ]}
        fmtMacro={(v) => String(v)}
        onSave={onSave}
        onAddToLog={onAddToLog}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "+ У журнал" }));
    expect(onAddToLog).toHaveBeenCalled();
  });

  it("shows empty-state after tried with no recipes", () => {
    render(
      <GeneratorCard
        prefs={PREFS}
        setPrefs={vi.fn()}
        recommendRecipes={vi.fn()}
        recipes={[]}
        recipesTried
        fmtMacro={(v) => String(v)}
        onSave={vi.fn()}
        onAddToLog={vi.fn()}
      />,
    );
    expect(screen.getByText(/Рецептів не повернулося/)).toBeInTheDocument();
  });
});
