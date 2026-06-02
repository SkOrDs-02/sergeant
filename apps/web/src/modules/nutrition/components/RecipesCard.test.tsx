// @vitest-environment jsdom
//
// page-audit-08 F7 + F12 — characterization tests for RecipesCard.
// These tests pin observable behaviour before the Phase-B split so any
// regression surfaces as a test failure, not a silent production bug.
//
// IDB (recipeBook) and the SQLite overlay (sqliteReader /
// sqliteReadGate) are fully mocked — RecipesCard uses these only for
// persistence; the render contract is exercised against the React output.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { NutritionPrefs, Pantry } from "@sergeant/nutrition-domain";
import type { Meal } from "@sergeant/nutrition-domain";

// ── vi.hoisted: variables that vi.mock factories reference ───────────
// vi.mock is hoisted to the top of the file, so any variables it
// references must be initialised with vi.hoisted().
const { mockListSavedRecipes, mockSaveRecipeToBook, mockDeleteSavedRecipe } =
  vi.hoisted(() => ({
    mockListSavedRecipes:
      vi.fn<() => Promise<import("../lib/recipeBook").SavedRecipe[]>>(),
    mockSaveRecipeToBook: vi.fn(),
    mockDeleteSavedRecipe: vi.fn(),
  }));

// ── Mock deep infrastructure that cannot be resolved in the test env ─
// `kvStoreBoot` pulls in `@sergeant/db-schema/sqlite` (WASM, only
// available when the package is built). Stub it at the boundary so the
// full import chain is satisfied without building WASM.
vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

// ── Mock the IDB recipe-book ─────────────────────────────────────────
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

// ── Mock the SQLite overlay (avoids WASM / db-schema resolution) ─────
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

// ── Test fixtures ────────────────────────────────────────────────────

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

// RecipesCard calls useToast() which requires ToastProvider in context.
function renderCard(props: Parameters<typeof RecipesCard>[0]) {
  return render(
    <ToastProvider>
      <RecipesCard {...props} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  __resetNutritionSqliteReadGateForTests();
  mockListSavedRecipes.mockResolvedValue([]);
  mockSaveRecipeToBook.mockResolvedValue({ ok: true, recipe: SAVED_RECIPE });
  mockDeleteSavedRecipe.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("RecipesCard — saved-recipes section", () => {
  it("renders the 'Мої рецепти' toggle button", async () => {
    renderCard(makeProps());
    expect(screen.getByRole("button", { name: /Мої рецепти/i })).toBeTruthy();
  });

  it("collapses the saved-recipes list by default", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    // Saved list should not be visible before user expands
    expect(screen.queryByText(SAVED_RECIPE.title)).toBeNull();
  });

  it("shows empty-state copy when saved list is open and empty", async () => {
    mockListSavedRecipes.mockResolvedValue([]);
    renderCard(makeProps());
    fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Тут з'являться збережені рецепти/i),
      ).toBeTruthy(),
    );
  });

  it("shows saved recipe title after expanding the saved section", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/i }));
    await waitFor(() =>
      expect(screen.getByText(SAVED_RECIPE.title)).toBeTruthy(),
    );
  });

  it("shows the saved count badge when recipes are loaded", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
  });

  it("toggles a saved recipe open to reveal ingredients", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/i }));
    await waitFor(() => screen.getByText(SAVED_RECIPE.title));
    fireEvent.click(screen.getByRole("button", { name: /Вівсяна каша/i }));
    await waitFor(() => expect(screen.getByText(/Інгредієнти/i)).toBeTruthy());
  });

  it("shows '+ У журнал' and 'Видалити' buttons in the saved section", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/i }));
    await waitFor(() => screen.getByText(SAVED_RECIPE.title));
    expect(
      screen.getAllByRole("button", { name: /У журнал/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Видалити" })).toBeTruthy();
  });

  it("opens ConfirmDialog when delete is clicked on a saved recipe", async () => {
    mockListSavedRecipes.mockResolvedValue([SAVED_RECIPE]);
    renderCard(makeProps());
    fireEvent.click(screen.getByRole("button", { name: /Мої рецепти/i }));
    await waitFor(() => screen.getByText(SAVED_RECIPE.title));
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    await waitFor(() =>
      expect(screen.getByText(/Видалити рецепт\?/i)).toBeTruthy(),
    );
  });
});

describe("RecipesCard — recipe generator section", () => {
  it("renders the generator card heading with pantry name", () => {
    renderCard(makeProps());
    expect(screen.getByText(/Рецепти \(Дім\)/i)).toBeTruthy();
  });

  it("renders the 'Запропонувати рецепти' button", () => {
    renderCard(makeProps());
    expect(
      screen.getByRole("button", { name: /Запропонувати рецепти/i }),
    ).toBeTruthy();
  });

  it("disables the recommend button when busy=true", () => {
    renderCard(makeProps({ busy: true }));
    const btn = screen.getByRole("button", {
      name: /Запропонувати рецепти/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("calls recommendRecipes when the button is clicked", () => {
    const recommendRecipes = vi.fn();
    renderCard(makeProps({ recommendRecipes }));
    fireEvent.click(
      screen.getByRole("button", { name: /Запропонувати рецепти/i }),
    );
    expect(recommendRecipes).toHaveBeenCalledTimes(1);
  });

  it("renders generated recipes when recipes prop is non-empty", () => {
    renderCard(makeProps({ recipes: [GENERATED_RECIPE] }));
    expect(screen.getByText(GENERATED_RECIPE.title)).toBeTruthy();
  });

  it("shows macros kcal badge for a generated recipe", () => {
    renderCard(makeProps({ recipes: [GENERATED_RECIPE] }));
    // fmtMacro(280) = 280
    expect(screen.getByText("280")).toBeTruthy();
  });

  it("shows ingredients for a generated recipe", () => {
    renderCard(makeProps({ recipes: [GENERATED_RECIPE] }));
    // Ingredients are joined into a single text node: "яйця, перець, цибуля"
    expect(screen.getAllByText(/яйця/i).length).toBeGreaterThan(0);
  });

  it("shows steps for a generated recipe", () => {
    renderCard(makeProps({ recipes: [GENERATED_RECIPE] }));
    expect(screen.getByText(/Збити яйця/i)).toBeTruthy();
  });

  it("renders 'Зберегти' and '+ У журнал' buttons for generated recipes", () => {
    renderCard(makeProps({ recipes: [GENERATED_RECIPE] }));
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /У журнал/i }).length,
    ).toBeGreaterThan(0);
  });

  it("shows empty-state hint when recipesTried=true, no recipes, no error", () => {
    renderCard(makeProps({ recipesTried: true, recipes: [], err: null }));
    expect(screen.getByText(/Рецептів не повернулося/i)).toBeTruthy();
  });

  it("shows cache hint when recipeCacheEntry has recipes", () => {
    renderCard(
      makeProps({
        recipeCacheEntry: {
          recipes: [GENERATED_RECIPE],
          recipesRaw: "[]",
        },
      }),
    );
    expect(screen.getByText(/є кеш сеансу/i)).toBeTruthy();
  });

  it("shows raw AI response details element when recipesRaw is set", () => {
    renderCard(
      makeProps({
        recipesTried: true,
        recipes: [],
        err: null,
        recipesRaw: "raw-ai-response-123",
      }),
    );
    expect(screen.getByText(/Показати діагностику/i)).toBeTruthy();
  });

  it("calls addMealToLog with correct meal when '+ У журнал' is clicked", async () => {
    const addMealToLog = vi
      .fn<(meal: Meal) => Promise<void>>()
      .mockResolvedValue(undefined);
    renderCard(makeProps({ recipes: [GENERATED_RECIPE], addMealToLog }));
    const logBtns = screen.getAllByRole("button", { name: /У журнал/i });
    fireEvent.click(logBtns[0]!);
    await waitFor(() => expect(addMealToLog).toHaveBeenCalledTimes(1));
    const meal = addMealToLog.mock.calls[0]![0];
    expect(meal.name).toBe(GENERATED_RECIPE.title);
    expect(meal.macros.kcal).toBe(GENERATED_RECIPE.macros.kcal);
  });

  it("renders goal select with the correct initial value", () => {
    renderCard(makeProps());
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("balanced");
  });

  it("calls setPrefs when goal select changes", () => {
    const setPrefs = vi.fn();
    renderCard(makeProps({ setPrefs }));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "high_protein" } });
    expect(setPrefs).toHaveBeenCalledTimes(1);
  });

  it("uses 'Склад' fallback when activePantry is null", () => {
    renderCard(makeProps({ activePantry: null }));
    expect(screen.getByText(/Рецепти \(Склад\)/i)).toBeTruthy();
  });
});
