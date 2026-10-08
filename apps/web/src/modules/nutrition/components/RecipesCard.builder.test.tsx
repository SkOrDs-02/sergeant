// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Логування рецепта зі складом: порції / грами, `macroSource`, `amount_g`.
 * Контроль датасету v1 «Гречка з філе» (2 порції, вага готової 400 г).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { computeRecipePerServing } from "@sergeant/nutrition-domain";

const { mockList } = vi.hoisted(() => ({
  mockList: vi.fn<() => Promise<import("../lib/recipeBook").SavedRecipe[]>>(),
}));

vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

vi.mock("../lib/recipeBook", async (orig) => {
  const actual = await orig<typeof import("../lib/recipeBook")>();
  return {
    ...actual,
    listSavedRecipes: mockList,
    saveRecipeToBook: vi.fn(),
    deleteSavedRecipe: vi.fn(),
  };
});

vi.mock("./meal-sheet/useFoodSearch", () => ({
  useFoodSearch: () => ({
    foodHits: [],
    offHits: [],
    foodBusy: false,
    offBusy: false,
    searchSettled: true,
    foodErr: "",
    setFoodErr: vi.fn(),
  }),
}));

vi.mock("../lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => ({
    log: {},
    pantries: [],
    activePantryId: null,
    prefs: null,
    recipes: [],
    waterLog: {},
    shoppingList: null,
    refreshedAt: null,
  }),
}));

import { __resetNutritionSqliteReadGateForTests } from "../lib/sqliteReadGate";
import { RecipesCard } from "./RecipesCard";
import { ToastProvider } from "@shared/hooks/useToast";

const m = (kcal: number, p: number, f: number, c: number) => ({
  kcal,
  protein_g: p,
  fat_g: f,
  carbs_g: c,
});
const components = [
  { name: "Гречка", grams: 250, foodId: null, per100: m(110, 4.2, 1.1, 21.3) },
  { name: "Філе", grams: 150, foodId: null, per100: m(165, 31, 3.6, 0) },
  { name: "Олія", grams: 10, foodId: null, per100: m(884, 0, 100, 0) },
];
const base = {
  id: "rcp_1",
  title: "Гречка з філе",
  timeMinutes: null,
  servings: 2,
  ingredients: [],
  steps: [],
  tips: [],
  macros: computeRecipePerServing(components, 2),
  components,
  createdAt: 1,
  updatedAt: 1,
};
const withWeight = { ...base, cookedWeightG: 400 };
const { components: _omit, ...baseNoComponents } = base;
const aiRecipe = {
  ...baseNoComponents,
  id: "rcp_ai",
  title: "AI омлет",
  macros: m(280, 20, 18, 6),
};

const addMealToLog = vi.fn();

async function open(recipe: import("../lib/recipeBook").SavedRecipe) {
  mockList.mockResolvedValue([recipe]);
  render(
    <ToastProvider>
      <RecipesCard
        prefs={{ goal: "balanced", servings: 2 } as NutritionPrefs}
        setPrefs={vi.fn()}
        recommendRecipes={vi.fn()}
        recipes={[]}
        fmtMacro={(v) => String(v)}
        addMealToLog={addMealToLog}
        selectedDate="2026-06-02"
      />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/i }));
  await waitFor(() => screen.getByText(recipe.title));
}

const lastMeal = () => addMealToLog.mock.calls.at(-1)?.[0];

beforeEach(() => {
  __resetNutritionSqliteReadGateForTests();
  addMealToLog.mockClear();
});
afterEach(cleanup);

describe("логування рецепта зі складом", () => {
  it("без ваги: порції, перемикача немає, amount_g null, macroSource recipe", async () => {
    await open(base);
    expect(screen.queryByRole("button", { name: "Грами" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /У журнал/ }));
    expect(lastMeal().macros.kcal).toBeCloseTo(305.45, 0);
    expect(lastMeal().amount_g).toBeNull();
    expect(lastMeal().macroSource).toBe("recipe");
  });

  it("з вагою, порції ×1: 305,45 ккал і 200 г", async () => {
    await open(withWeight);
    fireEvent.click(screen.getByRole("button", { name: /У журнал/ }));
    expect(lastMeal().macros.kcal).toBeCloseTo(305.45, 0);
    expect(lastMeal().amount_g).toBe(200);
  });

  it("з вагою, грами 150: макроси з рядка «150 г» і amount_g 150", async () => {
    await open(withWeight);
    fireEvent.click(screen.getByRole("button", { name: "Грами" }));
    fireEvent.change(screen.getByLabelText(/Скільки грамів/), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: /У журнал/ }));
    const meal = lastMeal();
    expect(meal.amount_g).toBe(150);
    expect(meal.macros.kcal).toBeCloseTo(229.1, 1);
    expect(meal.macros.protein_g).toBeCloseTo(21.4, 1);
    expect(meal.macros.fat_g).toBeCloseTo(6.8, 1);
    expect(meal.macros.carbs_g).toBeCloseTo(20, 1);
    expect(meal.macroSource).toBe("recipe");
  });

  it("невалідні грами: кнопка вимкнена, у журнал нічого не пишеться", async () => {
    await open(withWeight);
    fireEvent.click(screen.getByRole("button", { name: "Грами" }));
    fireEvent.change(screen.getByLabelText(/Скільки грамів/), {
      target: { value: "0" },
    });
    const btn = screen.getByRole("button", { name: /У журнал/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(addMealToLog).not.toHaveBeenCalled();
  });

  it("AI-рецепт лишається recipeAI без «Редагувати»", async () => {
    await open(aiRecipe);
    expect(screen.queryByRole("button", { name: "Редагувати" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /У журнал/ }));
    expect(lastMeal().macroSource).toBe("recipeAI");
    expect(lastMeal().amount_g).toBeNull();
  });

  it("«Нова страва» відкриває конструктор", async () => {
    await open(base);
    fireEvent.click(screen.getByRole("button", { name: "Нова страва" }));
    expect(await screen.findByLabelText("Назва страви")).toBeTruthy();
  });
});
