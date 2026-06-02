// @vitest-environment jsdom
//
// audit-08 F12 — NutritionMenuPage page-level test coverage.
//
// NutritionMenuPage wires:
//   • SubTabs switching between "plan" and "recipes"
//   • DataState<NutritionDayPlan | null> → DailyPlanCard  (plan tab)
//   • RecipesCard  (recipes tab)
//
// We mock DailyPlanCard and RecipesCard to avoid provisioning their deep
// deps (prefs-editors, recipe-LLM, etc.) and focus on the page's routing
// and callback delegation.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import type { DataStateQueryLike } from "@shared/components/ui/DataState";

import type { useNutritionPantries } from "../hooks/useNutritionPantries";
import type {
  NutritionDayPlan,
  NutritionRecipe,
} from "../hooks/useNutritionUiState";
import type { RecipeCacheEntry } from "../lib/recipeCache";
import type { PlanMeal } from "../components/DailyPlanMealRow";
import { NutritionMenuPage } from "./NutritionMenuPage";

// ---------------------------------------------------------------------------
// Break the import chain that leads to @sergeant/db-schema/sqlite (not built
// in this worktree environment). Chain:
//   NutritionMenuPage → DataState → EmptyState → Icon → @shared/lib
//     → storage/storage → kvStoreBoot → @sergeant/db-schema/sqlite
// This mirrors the pattern used in analytics.test.ts and similar tests.
// ---------------------------------------------------------------------------
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(() => null),
  safeWriteLS: vi.fn(() => true),
  safeReadStringLS: vi.fn(() => null),
  safeReadLSValidated: vi.fn(() => null),
  safeRemoveLS: vi.fn(() => true),
  safeListLSKeys: vi.fn(() => []),
  webKVStore: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock DailyPlanCard to expose the key callback props as buttons.
// ---------------------------------------------------------------------------
vi.mock("../components/DailyPlanCard", () => ({
  DailyPlanCard: ({
    fetchDayPlan,
    regenMeal,
    addMealToLog,
  }: {
    fetchDayPlan: () => void;
    regenMeal: (mealType: string) => void;
    addMealToLog: (meal: PlanMeal) => void;
  }) => (
    <div data-testid="daily-plan-card">
      <button onClick={fetchDayPlan}>Оновити план</button>
      <button onClick={() => regenMeal("breakfast")}>
        Регенерувати сніданок
      </button>
      <button
        onClick={() =>
          addMealToLog({
            id: "pm1",
            name: "Каша",
            time: "08:00",
            mealType: "breakfast",
            macros: { kcal: 300, protein_g: 10, fat_g: 5, carbs_g: 50 },
            label: "",
            source: "plan",
            macroSource: "plan",
            amount_g: null,
            foodId: null,
          })
        }
      >
        Додати до журналу
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Mock RecipesCard.
// ---------------------------------------------------------------------------
vi.mock("../components/RecipesCard", () => ({
  RecipesCard: () => <div data-testid="recipes-card">Рецепти</div>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMPTY_PREFS: NutritionPrefs = {} as NutritionPrefs;

function makePantry(): ReturnType<typeof useNutritionPantries> {
  return {
    pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
    activePantryId: "home",
    setActivePantryId: vi.fn(),
    activePantry: { id: "home", name: "Дім", items: [], text: "" },
    pantryText: "",
    pantryItems: [],
    newItemName: "",
    setNewItemName: vi.fn(),
    pantryManagerOpen: false,
    setPantryManagerOpen: vi.fn(),
    pantryForm: { mode: "idle", name: "", err: "" },
    setPantryForm: vi.fn(),
    confirmDeleteOpen: false,
    setConfirmDeleteOpen: vi.fn(),
    itemEdit: { open: false, idx: -1, name: "", qty: "", unit: "", err: "" },
    setItemEdit: vi.fn(),
    upsertItem: vi.fn(),
    removeItem: vi.fn(),
    editItemAt: vi.fn(),
    removeItemAt: vi.fn(),
    beginRenamePantry: vi.fn(),
    beginCreatePantry: vi.fn(),
    beginDeletePantry: vi.fn(),
    onSavePantryForm: vi.fn(),
    onConfirmDeletePantry: vi.fn(),
    onSaveItemEdit: vi.fn(),
    setPantryText: vi.fn(),
    effectiveItems: [],
    pantrySummary: "—",
    parsePantry: vi.fn(),
    pantryStorageErr: "",
    consumePantryItem: vi.fn(),
  } as ReturnType<typeof useNutritionPantries>;
}

/** A DataState-compatible query that is already in success state. */
function makeReadyQuery<T>(data: T): DataStateQueryLike<T> {
  return {
    data,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
  };
}

/** A DataState-compatible query that is loading (no data yet). */
function makeLoadingQuery<T>(): DataStateQueryLike<T> {
  return {
    data: undefined,
    isLoading: true,
    isPending: true,
    isError: false,
    error: null,
  };
}

interface RenderMenuPageOptions {
  menuSubTab?: "plan" | "recipes";
  setMenuSubTab?: (id: "plan" | "recipes") => void;
  dayPlan?: NutritionDayPlan | null;
  dayPlanBusy?: boolean;
  dayPlanQuery?: DataStateQueryLike<NutritionDayPlan | null>;
  fetchDayPlan?: (mealType: string | null) => void;
  addMealFromPlan?: (meal: PlanMeal) => void | Promise<void>;
  firstRunHint?: boolean;
  recipes?: NutritionRecipe[];
}

function renderMenuPage(overrides: RenderMenuPageOptions = {}) {
  const menuSubTab = overrides.menuSubTab ?? "plan";
  const setMenuSubTab = overrides.setMenuSubTab ?? vi.fn();
  const dayPlan = overrides.dayPlan !== undefined ? overrides.dayPlan : null;
  const dayPlanQuery =
    overrides.dayPlanQuery ?? makeReadyQuery<NutritionDayPlan | null>(dayPlan);
  const fetchDayPlan = overrides.fetchDayPlan ?? vi.fn();
  const addMealFromPlan = overrides.addMealFromPlan ?? vi.fn();

  render(
    <NutritionMenuPage
      menuSubTab={menuSubTab}
      setMenuSubTab={setMenuSubTab}
      pantry={makePantry()}
      prefs={EMPTY_PREFS}
      setPrefs={vi.fn()}
      busy={false}
      err=""
      dayPlan={dayPlan}
      dayPlanBusy={overrides.dayPlanBusy ?? false}
      dayPlanQuery={dayPlanQuery}
      dayPlanLoadingSkeleton={<div data-testid="skeleton">Завантаження…</div>}
      fetchDayPlan={fetchDayPlan}
      addMealFromPlan={addMealFromPlan}
      weekPlan={null}
      weekPlanRaw=""
      weekPlanBusy={false}
      fetchWeekPlan={vi.fn()}
      firstRunHint={overrides.firstRunHint ?? false}
      onDismissFirstRunHint={vi.fn()}
      recommendRecipes={vi.fn()}
      recipes={overrides.recipes ?? []}
      recipesTried={false}
      recipesRaw=""
      recipeCacheEntry={null as RecipeCacheEntry<unknown> | null}
      wrappedSaveMeal={vi.fn()}
      selectedDate="2025-01-01"
    />,
  );

  return { setMenuSubTab, fetchDayPlan, addMealFromPlan };
}

afterEach(() => cleanup());

describe("NutritionMenuPage", () => {
  it("renders without crashing — shows SubTabs with plan and recipes tabs", () => {
    renderMenuPage();
    expect(screen.getByRole("tab", { name: "План на день" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Рецепти" })).toBeTruthy();
  });

  it("shows DailyPlanCard when menuSubTab is 'plan' and query is ready", () => {
    renderMenuPage({ menuSubTab: "plan" });
    expect(screen.getByTestId("daily-plan-card")).toBeTruthy();
    expect(screen.queryByTestId("recipes-card")).toBeNull();
  });

  it("shows RecipesCard when menuSubTab is 'recipes'", () => {
    renderMenuPage({ menuSubTab: "recipes" });
    expect(screen.getByTestId("recipes-card")).toBeTruthy();
    expect(screen.queryByTestId("daily-plan-card")).toBeNull();
  });

  it("clicking 'Рецепти' tab calls setMenuSubTab('recipes')", async () => {
    const setMenuSubTab = vi.fn();
    renderMenuPage({ menuSubTab: "plan", setMenuSubTab });

    await userEvent.click(screen.getByRole("tab", { name: "Рецепти" }));
    expect(setMenuSubTab).toHaveBeenCalledWith("recipes");
  });

  it("clicking 'План на день' tab calls setMenuSubTab('plan')", async () => {
    const setMenuSubTab = vi.fn();
    renderMenuPage({ menuSubTab: "recipes", setMenuSubTab });

    await userEvent.click(screen.getByRole("tab", { name: "План на день" }));
    expect(setMenuSubTab).toHaveBeenCalledWith("plan");
  });

  it("DataState shows skeleton when query is loading (no data)", () => {
    renderMenuPage({
      menuSubTab: "plan",
      dayPlanQuery: makeLoadingQuery<NutritionDayPlan | null>(),
    });
    expect(screen.getByTestId("skeleton")).toBeTruthy();
    expect(screen.queryByTestId("daily-plan-card")).toBeNull();
  });

  it("DailyPlanCard's fetchDayPlan button calls fetchDayPlan(null)", async () => {
    const fetchDayPlan = vi.fn();
    renderMenuPage({ fetchDayPlan });

    await userEvent.click(screen.getByRole("button", { name: "Оновити план" }));
    expect(fetchDayPlan).toHaveBeenCalledWith(null);
  });

  it("DailyPlanCard's regenMeal button calls fetchDayPlan('breakfast')", async () => {
    const fetchDayPlan = vi.fn();
    renderMenuPage({ fetchDayPlan });

    await userEvent.click(
      screen.getByRole("button", { name: "Регенерувати сніданок" }),
    );
    expect(fetchDayPlan).toHaveBeenCalledWith("breakfast");
  });

  it("DailyPlanCard's addMealToLog button calls addMealFromPlan with the meal", async () => {
    const addMealFromPlan = vi.fn();
    renderMenuPage({ addMealFromPlan });

    await userEvent.click(
      screen.getByRole("button", { name: "Додати до журналу" }),
    );
    expect(addMealFromPlan).toHaveBeenCalledTimes(1);
    const firstCall = (addMealFromPlan as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const meal = firstCall?.[0];
    expect(meal).toMatchObject({ id: "pm1", name: "Каша" });
  });
});
