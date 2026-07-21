import { act, renderHook, waitFor } from "@testing-library/react-native";
import { defaultNutritionPrefs } from "@sergeant/nutrition-domain";

import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../lib/sqliteReader";
import {
  __resetNutritionSqliteReadGateForTests,
  notifyNutritionSqliteCacheRefresh,
} from "../../lib/sqliteReadGate";
import type { SavedRecipe } from "../../lib/recipeBookStore";
import { useNutritionLog } from "../useNutritionLog";
import { useNutritionPantries } from "../useNutritionPantries";
import { useNutritionPrefs } from "../useNutritionPrefs";
import { useSavedRecipeById } from "../useSavedRecipeById";
import { useSavedRecipesList } from "../useSavedRecipesList";
import { useShoppingList } from "../useShoppingList";
import { useWaterTracker } from "../useWaterTracker";

const recipeOne: SavedRecipe = {
  id: "recipe-1",
  title: "Омлет",
  timeMinutes: 12,
  servings: 1,
  ingredients: ["яйця"],
  steps: ["збити"],
  tips: [],
  macros: { kcal: 320, protein_g: 22, fat_g: null, carbs_g: null },
  createdAt: 100,
  updatedAt: 200,
};

const recipeTwo: SavedRecipe = {
  ...recipeOne,
  id: "recipe-2",
  title: "Салат",
  updatedAt: 300,
};

beforeEach(() => {
  clearNutritionSqliteCache();
  __resetNutritionSqliteReadGateForTests();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-05-04T10:00:00.000Z"));
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("nutrition state hooks", () => {
  it("overlays and mutates the meal log from the warm SQLite cache", async () => {
    const { result } = renderHook(() => useNutritionLog());
    expect(result.current.nutritionLog).toEqual({});

    act(() => {
      __setNutritionSqliteCacheForTests({
        log: {
          "2026-05-04": {
            meals: [
              {
                id: "meal-1",
                name: "Омлет",
                time: "08:00",
                mealType: "breakfast",
                label: "",
                macros: {
                  kcal: 320,
                  protein_g: 22,
                  fat_g: null,
                  carbs_g: null,
                },
                source: "manual",
                macroSource: "manual",
                amount_g: 180,
                foodId: null,
              },
            ],
          },
        },
      });
      notifyNutritionSqliteCacheRefresh();
    });

    await waitFor(() => {
      expect(result.current.nutritionLog["2026-05-04"]?.meals).toHaveLength(1);
    });

    act(() => {
      result.current.addMeal("2026-05-04", {
        id: "meal-2",
        name: "Йогурт",
        time: "11:00",
        mealType: "snack",
      });
    });
    expect(result.current.nutritionLog["2026-05-04"]?.meals).toHaveLength(2);

    act(() => {
      result.current.updateMeal("2026-05-04", {
        id: "meal-2",
        name: "Грецький йогурт",
      });
    });
    expect(
      result.current.nutritionLog["2026-05-04"]?.meals.find(
        (meal) => meal.id === "meal-2",
      )?.name,
    ).toBe("Грецький йогурт");

    act(() => {
      result.current.removeMeal("2026-05-04", "meal-1");
      result.current.setSelectedDate("2026-05-05");
    });
    expect(result.current.selectedDate).toBe("2026-05-05");
    expect(
      result.current.nutritionLog["2026-05-04"]?.meals.some(
        (meal) => meal.id === "meal-1",
      ),
    ).toBe(false);
  });

  it("manages active pantry items and applies SQLite overlays", async () => {
    const { result } = renderHook(() => useNutritionPantries());
    expect(result.current.activePantryId).toBe("home");

    act(() => {
      __setNutritionSqliteCacheForTests({
        pantries: [
          {
            id: "pantry-1",
            name: "Дім",
            text: "",
            items: [{ name: "Рис", qty: 1, unit: "кг", notes: null }],
          },
        ],
        activePantryId: "pantry-1",
      });
      notifyNutritionSqliteCacheRefresh();
    });

    await waitFor(() => {
      expect(result.current.activePantryId).toBe("pantry-1");
    });
    expect(result.current.pantryItems).toHaveLength(1);

    act(() => {
      result.current.addLine("гречка 2 кг");
      result.current.applyParsedItems([
        { name: "Молоко", qty: 1, unit: "л", notes: null },
      ]);
    });
    expect(result.current.pantryItems.length).toBeGreaterThanOrEqual(2);

    const removed = result.current.pantryItems[0]!;
    act(() => {
      result.current.removeItemAt(0);
    });
    expect(
      result.current.pantryItems.some((item) => item.name === removed.name),
    ).toBe(false);

    act(() => {
      result.current.restoreItemAt(0, removed);
      result.current.addPantry("Офіс");
    });
    expect(result.current.activePantryId).toBe(`p_${Date.now()}`);
    expect(
      result.current.pantries.some((pantry) => pantry.name === "Офіс"),
    ).toBe(true);
  });

  it("updates prefs and water tracker state", () => {
    __setNutritionSqliteCacheForTests({
      prefs: { ...defaultNutritionPrefs(), waterGoalMl: 2100 },
      waterLog: {},
    });

    const prefsHook = renderHook(() => useNutritionPrefs());
    expect(prefsHook.result.current.prefs.waterGoalMl).toBe(2100);

    act(() => {
      prefsHook.result.current.updatePrefs({ waterGoalMl: 2400 });
    });
    expect(prefsHook.result.current.prefs.waterGoalMl).toBe(2400);

    const waterHook = renderHook(() => useWaterTracker());
    expect(waterHook.result.current.todayMl).toBe(0);

    act(() => {
      waterHook.result.current.add(250);
    });
    expect(waterHook.result.current.todayMl).toBe(250);

    act(() => {
      waterHook.result.current.reset();
    });
    expect(waterHook.result.current.todayMl).toBe(0);
  });

  it("manages shopping list generated, manual, checked, and clear flows", () => {
    __setNutritionSqliteCacheForTests({
      shoppingList: {
        categories: [
          {
            name: "Овочі",
            items: [
              {
                id: "item-1",
                name: "Огірки",
                quantity: "",
                note: "",
                checked: false,
              },
            ],
          },
        ],
      },
    });
    jest.spyOn(Math, "random").mockReturnValue(0.123456);

    const { result } = renderHook(() => useShoppingList());
    expect(result.current.totalCount).toEqual({ total: 1, checked: 0 });

    act(() => {
      result.current.toggle("Овочі", "item-1");
    });
    expect(result.current.checkedItems).toHaveLength(1);

    act(() => {
      result.current.clearChecked();
    });
    expect(result.current.totalCount).toEqual({ total: 0, checked: 0 });

    act(() => {
      result.current.setGeneratedList([
        {
          name: "Фрукти",
          items: [
            {
              id: "item-2",
              name: "Яблука",
              quantity: "",
              note: "",
              checked: false,
            },
          ],
        },
      ]);
      result.current.addItemToCategory("Фрукти", " Банани ");
    });
    expect(result.current.shoppingList.categories[0]?.items).toHaveLength(2);

    act(() => {
      result.current.addItemToCategory("", "  ");
      result.current.clearAll();
    });
    expect(result.current.shoppingList.categories).toEqual([]);
  });

  it("reads saved recipe lists and recipe ids from cache ticks", async () => {
    __setNutritionSqliteCacheForTests({ recipes: [recipeOne] });
    let currentRecipeId: string | string[] | undefined = ["recipe-1"];
    const listHook = renderHook(() => useSavedRecipesList());
    const byIdHook = renderHook(() => useSavedRecipeById(currentRecipeId));

    expect(listHook.result.current.recipes).toEqual([recipeOne]);
    expect(byIdHook.result.current.recipe).toEqual(recipeOne);
    expect(byIdHook.result.current.recipeId).toBe("recipe-1");

    act(() => {
      __setNutritionSqliteCacheForTests({ recipes: [recipeTwo] });
      notifyNutritionSqliteCacheRefresh();
      currentRecipeId = "recipe-2";
      byIdHook.rerender(undefined);
    });

    await waitFor(() => {
      expect(listHook.result.current.recipes).toEqual([recipeTwo]);
      expect(byIdHook.result.current.recipe).toEqual(recipeTwo);
    });
  });
});
