// @vitest-environment jsdom
/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Рецепт як джерело у формі прийому (OD-27 Х-3 в, П-5 Б): тап по рецепту
 * відкриває крок «скільки зʼїв», запис — лише після нього.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { AddMealSheet } from "./AddMealSheet";
import type { SavedRecipe } from "../lib/recipeBook";

vi.mock("../lib/foodDb/foodDb", async (original) => ({
  ...(await original<typeof import("../lib/foodDb/foodDb")>()),
  ensureSeedFoods: vi.fn(async () => {}),
}));
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

const OMELETTE: SavedRecipe = {
  id: "r-omelette",
  title: "Омлет",
  timeMinutes: 10,
  servings: 1,
  ingredients: [],
  steps: [],
  tips: [],
  macros: { kcal: 300, protein_g: 20, fat_g: 22, carbs_g: 2 },
  createdAt: 1,
  updatedAt: 1,
};

const PORRIDGE: SavedRecipe = {
  id: "r-porridge",
  title: "Вівсянка",
  timeMinutes: 10,
  servings: 2,
  ingredients: [],
  steps: [],
  tips: [],
  macros: { kcal: 200, protein_g: 6, fat_g: 4, carbs_g: 34 },
  components: [
    {
      name: "Вівсяні пластівці",
      grams: 100,
      foodId: null,
      per100: { kcal: 400, protein_g: 12, fat_g: 8, carbs_g: 68 },
    },
  ],
  cookedWeightG: 400,
  createdAt: 1,
  updatedAt: 1,
};

function renderSheet(props: Partial<ComponentProps<typeof AddMealSheet>>) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AddMealSheet
        open
        onClose={onClose}
        onSave={onSave}
        initialSourceTab="search"
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSave, onClose };
}

function openRecipe(title: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/ }));
  fireEvent.click(screen.getByRole("button", { name: title }));
  return screen.getByRole("dialog", { name: /Омлет|Вівсянка/ });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("AddMealSheet — рецепт як джерело", () => {
  it("тап по рецепту не пише, а відкриває крок; запис — після порцій", () => {
    const { onSave, onClose } = renderSheet({
      savedRecipes: [OMELETTE],
      initialMealType: "dinner",
    });
    const step = openRecipe(/Омлет/);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(within(step).getByLabelText("Скільки порцій"), {
      target: { value: "1,5" },
    });
    expect(within(step).getByText(/≈ 450 ккал/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Додати в журнал" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      name: "Омлет",
      mealType: "dinner",
      macros: { kcal: 450 },
      macroSource: "recipeAI",
      foodId: null,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("рецепт із вагою готової страви пишеться грамами", () => {
    const { onSave } = renderSheet({ savedRecipes: [PORRIDGE] });
    const step = openRecipe(/Вівсянка/);
    fireEvent.click(within(step).getByRole("radio", { name: "Грами" }));
    const grams = within(step).getByLabelText("Скільки грамів");
    expect(grams).toHaveValue("200");
    fireEvent.change(grams, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати в журнал" }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      name: "Вівсянка",
      amount_g: 100,
      macroSource: "recipe",
      macros: { kcal: 100 },
    });
  });

  it("зіпсована кількість порцій не пише нічого", () => {
    const { onSave } = renderSheet({ savedRecipes: [OMELETTE] });
    const step = openRecipe(/Омлет/);
    fireEvent.change(within(step).getByLabelText("Скільки порцій"), {
      target: { value: "0" },
    });
    const add = screen.getByRole("button", { name: "Додати в журнал" });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("без збережених рецептів блоку немає", () => {
    renderSheet({ savedRecipes: [] });
    expect(
      screen.queryByRole("button", { name: /Мої рецепти/ }),
    ).not.toBeInTheDocument();
  });
});
