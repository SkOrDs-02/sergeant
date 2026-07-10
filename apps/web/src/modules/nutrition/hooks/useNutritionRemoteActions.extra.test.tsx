// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Extra branch-coverage tests for useNutritionRemoteActions.ts.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UseNutritionRemoteActionsParams } from "./useNutritionRemoteActions";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    nutritionApi: {
      recommendRecipes: vi.fn(),
      weekPlan: vi.fn(),
      dayHint: vi.fn(),
      dayPlan: vi.fn(),
      shoppingList: vi.fn(),
    },
  };
});
vi.mock("../lib/recipeCache.js", () => ({
  writeRecipeCache: vi.fn(),
}));
vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticSuccess: vi.fn(),
}));

import { useNutritionRemoteActions } from "./useNutritionRemoteActions";
import { nutritionApi } from "@shared/api";
import { toLocalISODate } from "@sergeant/shared";

type MockFn = ReturnType<typeof vi.fn>;
const apiRecommendRecipes = nutritionApi.recommendRecipes as unknown as MockFn;
const apiFetchWeekPlan = nutritionApi.weekPlan as unknown as MockFn;
const apiFetchDayHint = nutritionApi.dayHint as unknown as MockFn;
const apiFetchDayPlan = nutritionApi.dayPlan as unknown as MockFn;
const apiFetchShoppingList = nutritionApi.shoppingList as unknown as MockFn;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function makeHarness(overrides: Partial<UseNutritionRemoteActionsParams> = {}) {
  const setBusy = vi.fn();
  const setErr = vi.fn();
  const setStatusText = vi.fn();
  const setRecipes = vi.fn();
  const setRecipesRaw = vi.fn();
  const setRecipesTried = vi.fn();
  const setWeekPlan = vi.fn();
  const setWeekPlanRaw = vi.fn();
  const setWeekPlanBusy = vi.fn();
  const setDayPlan = vi.fn();
  const setDayPlanBusy = vi.fn();
  const setDayHintBusy = vi.fn();
  const setDayHintText = vi.fn();
  const setShoppingBusy = vi.fn();
  const setGeneratedList = vi.fn();
  const handleAddMeal = vi.fn();

  const base: UseNutritionRemoteActionsParams = {
    setBusy,
    setErr,
    setStatusText,
    pantry: {
      effectiveItems: [{ name: "яйця", qty: 10, unit: "шт", notes: null }],
    },
    prefs: {
      goal: "balanced",
      servings: "bad",
      timeMinutes: 0,
      exclude: null,
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 120,
      dailyTargetFat_g: 70,
      dailyTargetCarbs_g: 200,
    },
    recipes: [],
    setRecipes,
    setRecipesRaw,
    setRecipesTried,
    recipeCacheKey: "k",
    weekPlan: { days: [{ day: 1 }] },
    setWeekPlan,
    setWeekPlanRaw,
    setWeekPlanBusy,
    setDayPlan,
    setDayPlanBusy,
    setDayHintBusy,
    setDayHintText,
    log: {
      nutritionLog: {},
      selectedDate: "2025-01-01",
      handleAddMeal,
    },
    shopping: { setGeneratedList },
    setShoppingBusy,
    ...overrides,
  };

  const { result } = renderHook(
    (p: UseNutritionRemoteActionsParams) => useNutritionRemoteActions(p),
    { wrapper: makeWrapper(), initialProps: base },
  );

  return {
    result,
    spies: {
      setBusy,
      setErr,
      setStatusText,
      setRecipes,
      setRecipesRaw,
      setRecipesTried,
      setWeekPlan,
      setWeekPlanRaw,
      setWeekPlanBusy,
      setDayPlan,
      setDayPlanBusy,
      setDayHintBusy,
      setDayHintText,
      setShoppingBusy,
      setGeneratedList,
      handleAddMeal,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useNutritionRemoteActions — recipe + week plan branches", () => {
  it("coerces invalid pref numbers and handles empty recipe payloads", async () => {
    apiRecommendRecipes.mockResolvedValueOnce({ recipes: null, rawText: 42 });
    const { result, spies } = makeHarness();

    act(() => result.current.recommendRecipes());
    await waitFor(() => expect(spies.setRecipes).toHaveBeenCalledWith([]));
    expect(spies.setRecipesRaw).toHaveBeenCalledWith("");
    expect(apiRecommendRecipes).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          servings: 1,
          timeMinutes: 25,
          exclude: "",
        }),
      }),
    );
  });

  it("rolls week plan back to the snapshot captured on mutate", async () => {
    const prevPlan = { days: [{ day: 99 }] };
    apiFetchWeekPlan.mockRejectedValueOnce(new Error("boom"));
    const { result, spies } = makeHarness({ weekPlan: prevPlan });

    act(() => result.current.fetchWeekPlan());
    await waitFor(() =>
      expect(spies.setWeekPlan).toHaveBeenCalledWith(prevPlan),
    );
    expect(spies.setErr).toHaveBeenLastCalledWith("boom");
    expect(spies.setWeekPlanBusy).toHaveBeenCalledWith(false);
  });
});

describe("useNutritionRemoteActions — day hint branches", () => {
  it("maps photo meals to photoAI macro source and calls API without macros", async () => {
    apiFetchDayHint.mockResolvedValueOnce({ hint: "Більше білка" });
    const { result, spies } = makeHarness({
      log: {
        nutritionLog: {
          "2025-01-01": {
            meals: [
              {
                id: "m1",
                source: "photo",
                macros: {},
              },
            ],
          },
        },
        selectedDate: "2025-01-01",
        handleAddMeal: vi.fn(),
      },
    });

    act(() => result.current.fetchDayHint());
    await waitFor(() =>
      expect(spies.setDayHintText).toHaveBeenCalledWith("Більше білка"),
    );
    expect(apiFetchDayHint).toHaveBeenCalledWith(
      expect.objectContaining({
        hasMeals: true,
        hasAnyMacros: false,
        macroSources: { photoAI: 1 },
      }),
    );
  });
});

describe("useNutritionRemoteActions — day plan error branch", () => {
  it("clears day plan on partial-regen failure (prevDayPlan null)", async () => {
    apiFetchDayPlan.mockRejectedValueOnce(new Error("fail"));
    const { result, spies } = makeHarness();

    act(() => result.current.fetchDayPlan("lunch"));
    await waitFor(() => expect(spies.setDayPlan).toHaveBeenCalledWith(null));
    expect(spies.setErr).toHaveBeenLastCalledWith("fail");
  });
});

describe("useNutritionRemoteActions — addMealFromPlan branches", () => {
  it("stamps current time only when selectedDate is today", () => {
    const today = toLocalISODate(new Date());
    const handleAddMeal = vi.fn();
    const todayHarness = makeHarness({
      log: { nutritionLog: {}, selectedDate: today, handleAddMeal },
    });

    act(() =>
      todayHarness.result.current.addMealFromPlan({
        type: "breakfast",
        name: "Омлет",
        kcal: 300,
      }),
    );
    expect(handleAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        mealType: "breakfast",
        label: "Сніданок",
        time: expect.stringMatching(/^\d{2}:\d{2}$/),
      }),
    );

    handleAddMeal.mockClear();
    const pastHarness = makeHarness({
      log: {
        nutritionLog: {},
        selectedDate: "2020-01-01",
        handleAddMeal,
      },
    });
    act(() =>
      pastHarness.result.current.addMealFromPlan({
        type: "dinner",
        name: "Риба",
      }),
    );
    expect(handleAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({ time: "", label: "Вечеря" }),
    );
  });

  it("falls back to snack label when meal type is unknown", () => {
    const handleAddMeal = vi.fn();
    const { result } = makeHarness({
      log: {
        nutritionLog: {},
        selectedDate: "2020-01-01",
        handleAddMeal,
      },
    });

    act(() => result.current.addMealFromPlan({ name: "Перекус" }));
    expect(handleAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        mealType: "snack",
        label: "Прийом їжі",
        name: "Перекус",
      }),
    );
  });
});

describe("useNutritionRemoteActions — shopping list branches", () => {
  it("posts weekPlan when source is weekplan and days exist", async () => {
    apiFetchShoppingList.mockResolvedValueOnce({
      categories: [
        {
          name: "Молочне",
          items: [{ name: "Молоко", quantity: "1 л", note: "" }],
        },
      ],
    });
    const weekPlan = { days: [{ day: 1, meals: [] }] };
    const { result, spies } = makeHarness({ weekPlan });

    act(() => result.current.generateShoppingList("weekplan"));
    await waitFor(() => expect(spies.setGeneratedList).toHaveBeenCalled());
    const body = apiFetchShoppingList.mock.calls.at(-1)?.[0];
    expect(body.weekPlan).toEqual(weekPlan);
    const adapted = spies.setGeneratedList.mock.calls.at(-1)?.[0];
    expect(adapted[0].items[0]).toEqual(
      expect.objectContaining({
        name: "Молоко",
        quantity: "1 л",
        checked: false,
        id: expect.stringMatching(/^sl_/),
      }),
    );
  });

  it("surfaces an error when categories are missing from the response", async () => {
    apiFetchShoppingList.mockResolvedValueOnce({ categories: null });
    const { result, spies } = makeHarness({
      recipes: [{ id: "r1", name: "Омлет" }],
    });

    act(() => result.current.generateShoppingList("recipes"));
    await waitFor(() =>
      expect(spies.setErr).toHaveBeenCalledWith(
        "Не вдалося згенерувати список покупок.",
      ),
    );
  });
});
