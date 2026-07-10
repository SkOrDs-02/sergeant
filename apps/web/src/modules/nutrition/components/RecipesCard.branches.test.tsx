// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Branch-focused tests for RecipesCard — delete confirm/undo, save-to-book,
 * portion scaling, meal-log time branches, and auto-expand saved section.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Meal, NutritionPrefs, Pantry } from "@sergeant/nutrition-domain";

const { mockListSavedRecipes, mockSaveRecipeToBook, mockDeleteSavedRecipe } =
  vi.hoisted(() => ({
    mockListSavedRecipes:
      vi.fn<() => Promise<import("../lib/recipeBook").SavedRecipe[]>>(),
    mockSaveRecipeToBook: vi.fn(),
    mockDeleteSavedRecipe: vi.fn(),
  }));

vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

vi.mock("../lib/recipeBook", () => ({
  listSavedRecipes: mockListSavedRecipes,
  saveRecipeToBook: mockSaveRecipeToBook,
  deleteSavedRecipe: mockDeleteSavedRecipe,
  scaleMacros: (macros: unknown, factor: unknown) => {
    const f = Number(factor);
    const k = Number.isFinite(f) && f > 0 ? f : 1;
    const m = (macros && typeof macros === "object" ? macros : {}) as Record<
      string,
      unknown
    >;
    const v = (x: unknown) =>
      x == null ? null : Math.round(Number(x) * k * 10) / 10;
    return {
      kcal: v(m["kcal"]),
      protein_g: v(m["protein_g"]),
      fat_g: v(m["fat_g"]),
      carbs_g: v(m["carbs_g"]),
    };
  },
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

vi.mock("@sergeant/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sergeant/shared")>();
  return {
    ...actual,
    toLocalISODate: vi.fn(() => "2026-06-02"),
  };
});

import { __resetNutritionSqliteReadGateForTests } from "../lib/sqliteReadGate";
import { RecipesCard } from "./RecipesCard";
import { ToastProvider } from "@shared/hooks/useToast";

const PREFS: NutritionPrefs = {
  goal: "balanced",
  servings: 2,
  timeMinutes: 30,
  exclude: "",
} as NutritionPrefs;

const PANTRY: Pantry = {
  id: "pantry-1",
  name: "Дім",
  items: [],
  text: "",
};

const SAVED_RECIPE: import("../lib/recipeBook").SavedRecipe = {
  id: "rcp_saved_001",
  title: "Вівсяна каша",
  timeMinutes: 10,
  servings: 2,
  ingredients: ["вівсяні пластівці", "молоко"],
  steps: ["Закип'ятити молоко", "Додати пластівці"],
  tips: ["Можна додати ягоди"],
  macros: { kcal: 350, protein_g: 12, fat_g: 8, carbs_g: 55 },
  createdAt: 1716000000000,
  updatedAt: 1716000000000,
};

const GENERATED_RECIPE = {
  id: "rcp_gen_001",
  title: "Омлет з овочами",
  timeMinutes: 15,
  servings: 1,
  ingredients: ["яйця", "перець", "цибуля"],
  steps: ["Збити яйця", "Додати овочі", "Смажити 5 хв"],
  tips: [],
  macros: { kcal: 280, protein_g: 20, fat_g: 18, carbs_g: 6 },
};

function fmtMacro(v: unknown): string | number {
  if (v == null) return "—";
  return Math.round(Number(v));
}

function makeProps(
  overrides: Partial<Parameters<typeof RecipesCard>[0]> = {},
): Parameters<typeof RecipesCard>[0] {
  return {
    busy: false,
    activePantry: PANTRY,
    prefs: PREFS,
    setPrefs: vi.fn(),
    recommendRecipes: vi.fn(),
    recipes: [],
    recipesTried: false,
    err: null,
    fmtMacro,
    recipeCacheEntry: null,
    addMealToLog: vi.fn(),
    selectedDate: "2026-06-02",
    ...overrides,
  };
}

function renderCard(props: Parameters<typeof RecipesCard>[0]) {
  return render(
    <ToastProvider>
      <RecipesCard {...props} />
    </ToastProvider>,
  );
}

async function expandSavedSection() {
  fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/i }));
  await waitFor(() => screen.getByText(SAVED_RECIPE.title));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetNutritionSqliteReadGateForTests();
  mockListSavedRecipes.mockResolvedValue([]);
  mockSaveRecipeToBook.mockResolvedValue({ ok: true, recipe: SAVED_RECIPE });
  mockDeleteSavedRecipe.mockResolvedValue(true);
  vi.setSystemTime(new Date("2026-06-02T14:30:00"));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("RecipesCard — delete confirm branches", () => {
  it("deletes saved recipe when confirm dialog is accepted", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    await expandSavedSection();
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    await waitFor(() =>
      expect(screen.getByRole("alertdialog")).toBeInTheDocument(),
    );
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));
    await waitFor(() =>
      expect(mockDeleteSavedRecipe).toHaveBeenCalledWith(SAVED_RECIPE.id),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("closes delete dialog without deleting when cancelled", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    await expandSavedSection();
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    await waitFor(() =>
      expect(screen.getByRole("alertdialog")).toBeInTheDocument(),
    );
    const dialog = screen.getByRole("alertdialog");
    const cancelButtons = within(dialog).getAllByRole("button", {
      name: "Скасувати",
    });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mockDeleteSavedRecipe).not.toHaveBeenCalled();
  });
});

describe("RecipesCard — save-to-book branches", () => {
  it("calls saveRecipeToBook and refreshes when generated recipe is saved", async () => {
    renderCard(makeProps({ recipes: [GENERATED_RECIPE] }));
    await waitFor(() => expect(mockListSavedRecipes).toHaveBeenCalled());
    const listCallsBefore = mockListSavedRecipes.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    await waitFor(() =>
      expect(mockSaveRecipeToBook).toHaveBeenCalledWith(GENERATED_RECIPE),
    );
    await waitFor(() =>
      expect(mockListSavedRecipes.mock.calls.length).toBeGreaterThan(
        listCallsBefore,
      ),
    );
  });

  it("does not refresh saved list when saveRecipeToBook returns not ok", async () => {
    mockSaveRecipeToBook.mockResolvedValue({ ok: false });
    renderCard(makeProps({ recipes: [GENERATED_RECIPE] }));
    await waitFor(() => expect(mockListSavedRecipes).toHaveBeenCalled());
    const listCallsBefore = mockListSavedRecipes.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    await waitFor(() =>
      expect(mockSaveRecipeToBook).toHaveBeenCalledWith(GENERATED_RECIPE),
    );
    expect(mockListSavedRecipes.mock.calls.length).toBe(listCallsBefore);
  });
});

describe("RecipesCard — addRecipeAsMeal branches", () => {
  it("scales macros by portion multiplier from saved section", async () => {
    const addMealToLog = vi
      .fn<(meal: Meal) => Promise<void>>()
      .mockResolvedValue(undefined);
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps({ addMealToLog }));
    await expandSavedSection();
    const portionInput = screen.getByDisplayValue("1");
    fireEvent.change(portionInput, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /У журнал/i }));
    await waitFor(() => expect(addMealToLog).toHaveBeenCalledTimes(1));
    expect(addMealToLog.mock.calls[0]![0].macros.kcal).toBe(700);
  });

  it("uses wall-clock time when selectedDate is today", async () => {
    const addMealToLog = vi
      .fn<(meal: Meal) => Promise<void>>()
      .mockResolvedValue(undefined);
    renderCard(
      makeProps({
        recipes: [GENERATED_RECIPE],
        addMealToLog,
        selectedDate: "2026-06-02",
      }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /У журнал/i })[0]!);
    await waitFor(() => expect(addMealToLog).toHaveBeenCalledTimes(1));
    expect(addMealToLog.mock.calls[0]![0].time).toBe("14:30");
  });

  it("omits time when journal date is not today", async () => {
    const addMealToLog = vi
      .fn<(meal: Meal) => Promise<void>>()
      .mockResolvedValue(undefined);
    renderCard(
      makeProps({
        recipes: [GENERATED_RECIPE],
        addMealToLog,
        selectedDate: "2026-01-15",
      }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /У журнал/i })[0]!);
    await waitFor(() => expect(addMealToLog).toHaveBeenCalledTimes(1));
    expect(addMealToLog.mock.calls[0]![0].time).toBe("");
  });

  it("no-ops add-to-log when addMealToLog prop is undefined", async () => {
    const { addMealToLog: _omit, ...propsWithoutAdd } = makeProps({
      recipes: [GENERATED_RECIPE],
    });
    renderCard(propsWithoutAdd);
    expect(() => {
      fireEvent.click(screen.getAllByRole("button", { name: /У журнал/i })[0]!);
    }).not.toThrow();
  });
});

describe("RecipesCard — saved section auto-expand", () => {
  it("auto-expands saved section when recipes load from empty to non-empty", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    await waitFor(() =>
      expect(screen.getByText(SAVED_RECIPE.title)).toBeTruthy(),
    );
  });
});
