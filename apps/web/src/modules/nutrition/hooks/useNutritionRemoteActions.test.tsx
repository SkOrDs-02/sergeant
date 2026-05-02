// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
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

import { useNutritionRemoteActions } from "./useNutritionRemoteActions";
import { nutritionApi } from "@shared/api";
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

  const base: UseNutritionRemoteActionsParams = {
    setBusy,
    setErr,
    setStatusText,
    pantry: {
      effectiveItems: [{ name: "яйця", qty: 10, unit: "шт", notes: null }],
    },
    prefs: {
      goal: "balanced",
      servings: 2,
      timeMinutes: 30,
      exclude: "",
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
    weekPlan: null,
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
      handleAddMeal: vi.fn(),
    },
    shopping: { setGeneratedList },
    setShoppingBusy,
    ...overrides,
  };

  const { result, rerender } = renderHook(
    (p: UseNutritionRemoteActionsParams) => useNutritionRemoteActions(p),
    {
      wrapper: makeWrapper(),
      initialProps: base,
    },
  );
  return {
    result,
    rerender,
    base,
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
    },
  };
}

describe("useNutritionRemoteActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recommendRecipes", () => {
    it("posts items + preferences and feeds result through setters", async () => {
      apiRecommendRecipes.mockResolvedValueOnce({
        recipes: [
          { id: "r1", name: "Омлет", kcal: 300 },
          { name: "Яєчня" /* no id — derive */ },
        ],
        rawText: "raw blob",
      });
      const { result, spies } = makeHarness();

      act(() => {
        result.current.recommendRecipes();
      });

      await waitFor(() => expect(spies.setRecipes).toHaveBeenCalled());
      const pushed = spies.setRecipes.mock.calls.at(-1)![0];
      expect(pushed).toHaveLength(2);
      expect(pushed[0].id).toBe("r1");
      expect(pushed[1].id).toBeTruthy(); // derived id
      expect(spies.setRecipesRaw).toHaveBeenCalledWith("raw blob");
      expect(spies.setRecipesTried).toHaveBeenCalledWith(true);
      expect(apiRecommendRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          pantry: expect.any(Array),
          preferences: expect.objectContaining({
            goal: "balanced",
            locale: "uk-UA",
          }),
        }),
      );
    });

    it("throws validation error when pantry is empty", async () => {
      const { result, spies } = makeHarness({ pantry: { effectiveItems: [] } });
      act(() => {
        result.current.recommendRecipes();
      });
      await waitFor(() => {
        expect(spies.setErr).toHaveBeenCalledWith(
          "Дай хоча б 2–3 продукти для рецептів.",
        );
      });
      expect(apiRecommendRecipes).not.toHaveBeenCalled();
    });
  });

  describe("fetchWeekPlan", () => {
    it("sets week plan + raw text on success", async () => {
      apiFetchWeekPlan.mockResolvedValueOnce({
        plan: { days: [{ day: 1 }] },
        rawText: "wk-raw",
      });
      const { result, spies } = makeHarness();
      act(() => {
        result.current.fetchWeekPlan();
      });
      await waitFor(() =>
        expect(spies.setWeekPlan).toHaveBeenCalledWith({ days: [{ day: 1 }] }),
      );
      expect(spies.setWeekPlanRaw).toHaveBeenCalledWith("wk-raw");
    });

    it("throws when pantry is empty", async () => {
      const { result, spies } = makeHarness({ pantry: { effectiveItems: [] } });
      act(() => {
        result.current.fetchWeekPlan();
      });
      await waitFor(() =>
        expect(spies.setErr).toHaveBeenCalledWith("Додай продукти на склад."),
      );
      expect(apiFetchWeekPlan).not.toHaveBeenCalled();
    });
  });

  describe("fetchDayHint", () => {
    it("skips network and emits synthetic hint when day has no meals", async () => {
      const { result, spies } = makeHarness();
      act(() => {
        result.current.fetchDayHint();
      });
      await waitFor(() =>
        expect(spies.setDayHintText).toHaveBeenCalledWith(
          "День порожній. Додай прийом їжі — і я зможу дати підказку.",
        ),
      );
      expect(apiFetchDayHint).not.toHaveBeenCalled();
    });

    it("calls API when day has meals and feeds hint to setter", async () => {
      apiFetchDayHint.mockResolvedValueOnce({ hint: "Додай білка" });
      const { result, spies } = makeHarness({
        log: {
          nutritionLog: {
            "2025-01-01": {
              meals: [
                {
                  id: "m1",
                  mealType: "breakfast",
                  macros: { kcal: 300, protein_g: 20, fat_g: 10, carbs_g: 30 },
                  macroSource: "manual",
                },
              ],
            },
          },
          selectedDate: "2025-01-01",
          handleAddMeal: vi.fn(),
        },
      });
      act(() => {
        result.current.fetchDayHint();
      });
      await waitFor(() =>
        expect(spies.setDayHintText).toHaveBeenCalledWith("Додай білка"),
      );
      expect(apiFetchDayHint).toHaveBeenCalled();
    });
  });

  describe("fetchDayPlan", () => {
    it("sets the returned plan on success (no regenerate)", async () => {
      const plan = {
        meals: [
          { type: "breakfast", name: "Омлет", kcal: 300 },
          { type: "lunch", name: "Борщ", kcal: 500 },
        ],
        totalKcal: 800,
      };
      apiFetchDayPlan.mockResolvedValueOnce({ plan });
      const { result, spies } = makeHarness();

      act(() => {
        result.current.fetchDayPlan();
      });
      await waitFor(() => expect(spies.setDayPlan).toHaveBeenCalled());

      // Functional setState — call the updater with null prev to see the
      // "plain replace" branch.
      const updater = spies.setDayPlan.mock.calls.at(-1)![0];
      expect(typeof updater).toBe("function");
      expect(updater(null)).toEqual(plan);
    });

    it("throws when server returns empty plan", async () => {
      apiFetchDayPlan.mockResolvedValueOnce({ plan: null });
      const { result, spies } = makeHarness();
      act(() => {
        result.current.fetchDayPlan();
      });
      await waitFor(() =>
        expect(spies.setErr).toHaveBeenCalledWith(
          "Не вдалося отримати план харчування",
        ),
      );
    });

    it("posts `pantry` (not `items`) and omits regenerateMealType when no regen target", async () => {
      // Matches server DayPlanSchema: expects `pantry: [...]` and
      // `regenerateMealType` as a valid enum value or absent — not `null`.
      apiFetchDayPlan.mockResolvedValueOnce({ plan: { meals: [] } });
      const { result } = makeHarness();
      act(() => {
        result.current.fetchDayPlan();
      });
      await waitFor(() => expect(apiFetchDayPlan).toHaveBeenCalled());
      const body = apiFetchDayPlan.mock.calls.at(-1)?.[0];
      expect(body).toEqual(
        expect.objectContaining({
          pantry: expect.any(Array),
          targets: expect.any(Object),
          locale: "uk-UA",
        }),
      );
      expect(body).not.toHaveProperty("items");
      expect(body).not.toHaveProperty("regenerateMealType");
    });

    it("includes regenerateMealType when regenerating a specific meal", async () => {
      apiFetchDayPlan.mockResolvedValueOnce({ plan: { meals: [] } });
      const { result } = makeHarness();
      act(() => {
        result.current.fetchDayPlan("lunch");
      });
      await waitFor(() => expect(apiFetchDayPlan).toHaveBeenCalled());
      const body = apiFetchDayPlan.mock.calls.at(-1)?.[0];
      expect(body).toEqual(
        expect.objectContaining({
          pantry: expect.any(Array),
          regenerateMealType: "lunch",
        }),
      );
    });
  });

  describe("regression: fetchDayPlan regenerateMealType (issue #189)", () => {
    it("uses functional setDayPlan so merge happens against LATEST state, not stale closure", async () => {
      // Simulates regenerating only the `lunch` meal while breakfast/dinner
      // already exist in the prior plan. The merge must preserve breakfast
      // and dinner from `prev`, replace lunch, and recompute totals.
      apiFetchDayPlan.mockResolvedValueOnce({
        plan: {
          meals: [
            {
              type: "lunch",
              name: "Новий суп",
              kcal: 400,
              protein_g: 30,
              fat_g: 10,
              carbs_g: 40,
            },
          ],
        },
      });
      const { result, spies } = makeHarness();

      act(() => {
        result.current.fetchDayPlan("lunch");
      });
      await waitFor(() => expect(spies.setDayPlan).toHaveBeenCalled());

      const updater = spies.setDayPlan.mock.calls.at(-1)![0];
      expect(typeof updater).toBe("function");

      // Simulate "latest committed state" — stale closure would have missed
      // these recent edits entirely.
      const latestPrev = {
        meals: [
          {
            type: "breakfast",
            name: "Омлет",
            kcal: 300,
            protein_g: 20,
            fat_g: 15,
            carbs_g: 10,
          },
          {
            type: "lunch",
            name: "СТАРИЙ",
            kcal: 999,
            protein_g: 1,
            fat_g: 1,
            carbs_g: 1,
          },
          {
            type: "dinner",
            name: "Риба",
            kcal: 500,
            protein_g: 40,
            fat_g: 20,
            carbs_g: 10,
          },
        ],
        totalKcal: 1799,
      };

      const merged = updater(latestPrev);
      const byType = Object.fromEntries(
        merged.meals.map((m: { type: string }) => [m.type, m]),
      );

      // Breakfast + dinner preserved from prev.
      expect(byType.breakfast.name).toBe("Омлет");
      expect(byType.dinner.name).toBe("Риба");
      // Lunch replaced by regenerated meal.
      expect(byType.lunch.name).toBe("Новий суп");
      // Totals recomputed off merged meals, not prev's stale totalKcal.
      expect(merged.totalKcal).toBe(300 + 400 + 500);
      expect(merged.totalProtein_g).toBe(20 + 30 + 40);
      expect(merged.totalFat_g).toBe(15 + 10 + 20);
      expect(merged.totalCarbs_g).toBe(10 + 40 + 10);
    });

    it("falls back to plain replace when prev has no meals (first-time generate)", async () => {
      const plan = {
        meals: [{ type: "breakfast", name: "Only meal", kcal: 100 }],
        totalKcal: 100,
      };
      apiFetchDayPlan.mockResolvedValueOnce({ plan });
      const { result, spies } = makeHarness();

      act(() => {
        // Even though regenerate is requested, prev has no meals → replace.
        result.current.fetchDayPlan("breakfast");
      });
      await waitFor(() => expect(spies.setDayPlan).toHaveBeenCalled());

      const updater = spies.setDayPlan.mock.calls.at(-1)![0];
      expect(updater({ meals: [] })).toEqual(plan);
      expect(updater(null)).toEqual(plan);
    });
  });

  describe("generateShoppingList", () => {
    it("throws if neither recipes nor weekPlan available", async () => {
      const { result, spies } = makeHarness();
      act(() => {
        result.current.generateShoppingList("weekplan");
      });
      await waitFor(() =>
        expect(spies.setErr).toHaveBeenCalledWith(
          "Немає рецептів чи тижневого плану для генерації.",
        ),
      );
      expect(apiFetchShoppingList).not.toHaveBeenCalled();
    });

    it("posts recipes when source fallback and feeds categories to shopping", async () => {
      apiFetchShoppingList.mockResolvedValueOnce({
        categories: [{ name: "Овочі", items: [] }],
      });
      const { result, spies } = makeHarness({
        recipes: [{ id: "r1", name: "Омлет" }],
      });
      act(() => {
        result.current.generateShoppingList("recipes");
      });
      await waitFor(() =>
        expect(spies.setGeneratedList).toHaveBeenCalledWith([
          { name: "Овочі", items: [] },
        ]),
      );
    });
  });
});
