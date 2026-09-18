// @vitest-environment jsdom
//
// audit-08 F12 — NutritionMenuPage page-level test coverage.
//
// Integration test (over-mocking refactor): renders NutritionMenuPage with
// its REAL children — SubTabs, DailyPlanCard (goal inputs, plan-generation
// buttons, meal rows), and RecipesCard (saved-recipes + generator) — inside
// the real provider stack the page needs (QueryClientProvider, MemoryRouter
// for `DailyPlanGoalSelectors`' <Link>, ToastProvider for RecipesCard/
// DailyPlanGoalSelectors' `useToast()`). `fake-indexeddb/auto` backs
// RecipesCard's saved-recipe store (`../lib/recipeBook.ts` → IndexedDB) so
// its effects resolve instead of throwing under jsdom.
//
// We assert on real DOM text/roles and real callback-triggering user
// interactions (clicking the actual "Згенерувати денний план" / "↻
// Замінити" / "+ Журнал" buttons rendered by DailyPlanCard), not on
// component-mock echoes.
import "fake-indexeddb/auto";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import type { DataStateQueryLike } from "@shared/components/ui/DataState";
import { ToastProvider } from "@shared/hooks/useToast";

import type { useNutritionPantries } from "../hooks/useNutritionPantries";
import type {
  NutritionDayPlan,
  NutritionRecipe,
} from "../hooks/useNutritionUiState";
import type { RecipeCacheEntry } from "../lib/recipeCache";
import type { PlanMeal } from "../components/DailyPlanMealRow";
import { NutritionMenuPage } from "./NutritionMenuPage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMPTY_PREFS: NutritionPrefs = {} as NutritionPrefs;

function makePantry(): ReturnType<typeof useNutritionPantries> {
  return {
    pantries: [{ id: "home", name: "Комора", items: [], text: "" }],
    placeFilter: null,
    setPlaceFilter: vi.fn(),
    moveItemTo: vi.fn(),
    redistributePlan: [],
    applyRedistribute: vi.fn(),
    pantryText: "",
    pantryItems: [],
    newItemName: "",
    setNewItemName: vi.fn(),
    pantryManagerOpen: false,
    setPantryManagerOpen: vi.fn(),
    pantryForm: { mode: "idle", name: "", err: "", targetId: null },
    setPantryForm: vi.fn(),
    confirmDeleteOpen: false,
    setConfirmDeleteOpen: vi.fn(),
    itemEdit: {
      open: false,
      idx: -1,
      name: "",
      qty: "",
      unit: "",
      err: "",
      pantryId: "",
    },
    setItemEdit: vi.fn(),
    upsertItem: vi.fn(),
    ambiguousPantryItems: [],
    resolveAmbiguousPantryItem: vi.fn(),
    dismissAmbiguousPantryItem: vi.fn(),
    rememberAmbiguousChoice: vi.fn(),
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
    parsePreview: null,
    confirmParsePreview: vi.fn(),
    dismissParsePreview: vi.fn(),
    pantryStorageErr: "",
    consumePantryItem: vi.fn(),
    variantChoice: null,
    resolveVariantChoice: vi.fn(),
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

const SAMPLE_MEAL: PlanMeal = {
  type: "breakfast",
  label: "Сніданок",
  name: "Каша вівсяна",
  kcal: 300,
  protein_g: 10,
  fat_g: 5,
  carbs_g: 50,
  ingredients: [],
};

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

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
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
            dayPlanSavedAt={null}
            dayPlanLoadingSkeleton={
              <div data-testid="skeleton">Завантаження…</div>
            }
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
          />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
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

  it("shows the real DailyPlanCard when menuSubTab is 'plan' and query is ready", () => {
    renderMenuPage({ menuSubTab: "plan" });
    // Real DailyPlanCard content — not a mock testid.
    expect(screen.getByText("Денний план")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Згенерувати денний план" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Мої рецепти")).not.toBeInTheDocument();
  });

  it("shows the real RecipesCard when menuSubTab is 'recipes'", async () => {
    renderMenuPage({ menuSubTab: "recipes" });
    // RecipesCard's SavedSection renders the "Мої рецепти" collapsible.
    expect(await screen.findByText("Мої рецепти")).toBeInTheDocument();
    expect(screen.queryByText("Денний план")).not.toBeInTheDocument();
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

  it("DataState shows the loading skeleton when query is loading (no data)", () => {
    renderMenuPage({
      menuSubTab: "plan",
      dayPlanQuery: makeLoadingQuery<NutritionDayPlan | null>(),
    });
    expect(screen.getByTestId("skeleton")).toBeTruthy();
    expect(screen.queryByText("Денний план")).not.toBeInTheDocument();
  });

  it("real 'Згенерувати денний план' button calls fetchDayPlan(null)", async () => {
    const fetchDayPlan = vi.fn();
    renderMenuPage({ fetchDayPlan });

    await userEvent.click(
      screen.getByRole("button", { name: "Згенерувати денний план" }),
    );
    expect(fetchDayPlan).toHaveBeenCalledWith(null);
  });

  // Кнопка мала мітку «↻ Замінити» — типографічний гліф у ролі іконки.
  // Гліф замінено на `Icon name="refresh-cw"` (анти-слоп атрактор №6), тож
  // accessible name кнопки тепер «Замінити»: `<svg aria-hidden>` у нього не
  // входить.
  it("real meal row's 'Замінити' button calls fetchDayPlan(mealType)", async () => {
    const fetchDayPlan = vi.fn();
    renderMenuPage({
      fetchDayPlan,
      dayPlan: { meals: [SAMPLE_MEAL], totalKcal: 300 } as NutritionDayPlan,
    });

    const mealRow = screen.getByText("Каша вівсяна").closest("div")!
      .parentElement!.parentElement as HTMLElement;
    await userEvent.click(
      within(mealRow).getByRole("button", { name: "Замінити" }),
    );
    expect(fetchDayPlan).toHaveBeenCalledWith("breakfast");
  });

  it("real meal row's '+ Журнал' button calls addMealFromPlan with the meal", async () => {
    const addMealFromPlan = vi.fn();
    renderMenuPage({
      addMealFromPlan,
      dayPlan: { meals: [SAMPLE_MEAL], totalKcal: 300 } as NutritionDayPlan,
    });

    await userEvent.click(screen.getByRole("button", { name: "+ Журнал" }));
    expect(addMealFromPlan).toHaveBeenCalledTimes(1);
    const firstCall = (addMealFromPlan as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const meal = firstCall?.[0];
    expect(meal).toMatchObject({ name: "Каша вівсяна", type: "breakfast" });
  });
});
