// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { GeneratorCard } from "./RecipesCard.Generator";

const PREFS = {
  goal: "balanced",
  servings: 2,
  timeMinutes: 30,
  exclude: "",
  recipeMealType: "any",
  recipePantryMode: "prefer",
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

  it("updates recommendation preferences and calls the generator CTA", () => {
    let currentPrefs = PREFS;
    const setPrefs = vi.fn((update: SetStateAction<NutritionPrefs>) => {
      currentPrefs =
        typeof update === "function" ? update(currentPrefs) : update;
    });
    const recommendRecipes = vi.fn();

    render(
      <GeneratorCard
        prefs={PREFS}
        setPrefs={setPrefs}
        recommendRecipes={recommendRecipes}
        recipes={[]}
        fmtMacro={(v) => String(v)}
        onSave={vi.fn()}
        onAddToLog={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Ціль"), {
      target: { value: "high_protein" },
    });
    expect(currentPrefs).toMatchObject({ goal: "high_protein" });

    fireEvent.change(screen.getByDisplayValue("2"), {
      target: { value: "0" },
    });
    expect(currentPrefs).toMatchObject({ servings: 1 });

    fireEvent.change(screen.getByDisplayValue("30"), {
      target: { value: "-5" },
    });
    expect(currentPrefs).toMatchObject({ timeMinutes: 0 });

    fireEvent.change(screen.getByPlaceholderText("напр. арахіс, гриби"), {
      target: { value: "арахіс" },
    });
    expect(currentPrefs).toMatchObject({ exclude: "арахіс" });

    fireEvent.change(screen.getByLabelText("Прийом їжі"), {
      target: { value: "lunch" },
    });
    expect(currentPrefs).toMatchObject({ recipeMealType: "lunch" });

    fireEvent.change(screen.getByLabelText("Використання комори"), {
      target: { value: "only" },
    });
    expect(currentPrefs).toMatchObject({ recipePantryMode: "only" });

    fireEvent.click(
      screen.getByRole("button", { name: "Запропонувати рецепти" }),
    );
    expect(recommendRecipes).toHaveBeenCalledTimes(1);
  });

  it("renders generated recipe fallbacks, steps, tips and fallback log key", () => {
    const onAddToLog = vi.fn();
    render(
      <GeneratorCard
        prefs={PREFS}
        setPrefs={vi.fn()}
        recommendRecipes={vi.fn()}
        recipes={[
          {
            title: "",
            timeMinutes: 0,
            servings: 0,
            ingredients: ["гречка", "яйце"],
            steps: Array.from({ length: 12 }, (_, i) => `Крок ${i + 1}`),
            tips: Array.from({ length: 8 }, (_, i) => `Порада ${i + 1}`),
          },
        ]}
        fmtMacro={(v) => String(v)}
        onSave={vi.fn()}
        onAddToLog={onAddToLog}
      />,
    );

    expect(screen.getByText("Рецепт 1")).toBeInTheDocument();
    expect(screen.getByText("— · —")).toBeInTheDocument();
    expect(screen.getByText("гречка, яйце")).toBeInTheDocument();
    expect(screen.getByText("Крок 10")).toBeInTheDocument();
    expect(screen.queryByText("Крок 11")).toBeNull();
    expect(screen.getByText("Порада 6")).toBeInTheDocument();
    expect(screen.queryByText("Порада 7")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "+ У журнал" }));
    expect(onAddToLog).toHaveBeenCalledWith(expect.any(Object), "0");
  });

  it("shows raw diagnostics in the empty recipe state", () => {
    render(
      <GeneratorCard
        prefs={PREFS}
        setPrefs={vi.fn()}
        recommendRecipes={vi.fn()}
        recipes={[]}
        recipesTried
        recipesRaw="raw ai payload"
        fmtMacro={(v) => String(v)}
        onSave={vi.fn()}
        onAddToLog={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Показати діагностику (raw відповідь AI)"),
    ).toBeInTheDocument();
    expect(screen.getByText("raw ai payload")).toBeInTheDocument();
  });
});
