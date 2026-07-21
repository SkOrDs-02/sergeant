import { normalizeShoppingList } from "@sergeant/nutrition-domain";

import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
  getCachedNutritionSqliteState,
  refreshNutritionSqliteState,
} from "../sqliteReader";

describe("nutrition sqliteReader (mobile)", () => {
  beforeEach(() => {
    clearNutritionSqliteCache();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-04T10:11:12.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("assembles meals, pantries, prefs, recipes, water and shopping rows", async () => {
    const client = {
      all: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "meal-1",
            eaten_at: "2026-05-04T08:30:00.000Z",
            meal_type: null,
            name: null,
            label: "Сніданок",
            kcal: 410,
            protein_g: 24,
            fat_g: 12,
            carbs_g: 48,
            source: null,
            macro_source: "ai",
            amount_g: 250,
            food_id: "food-1",
            is_demo: 1,
          },
        ])
        .mockResolvedValueOnce([{ id: "pantry-1", name: null, text: null }])
        .mockResolvedValueOnce([
          {
            id: "item-1",
            pantry_id: "pantry-1",
            name: "Гречка",
            qty: 2,
            unit: null,
            notes: "пачки",
            sort_order: 0,
          },
        ])
        .mockResolvedValueOnce([
          {
            user_id: "user-1",
            prefs_json: JSON.stringify({ dailyKcal: 2100, waterGoalMl: 2300 }),
            active_pantry_id: "pantry-1",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "recipe-1",
            name: "fallback",
            data_json: JSON.stringify({
              title: "Омлет",
              timeMinutes: 12,
              servings: 1,
              ingredients: ["яйця"],
              steps: ["збити"],
              tips: ["не пересушити"],
              macros: { kcal: 320, protein_g: 22 },
              createdAt: 100,
              updatedAt: 200,
            }),
          },
          { id: "recipe-bad", name: "bad", data_json: "{" },
        ])
        .mockResolvedValueOnce([{ date_key: "2026-05-04", volume_ml: 750 }])
        .mockResolvedValueOnce([
          {
            user_id: "user-1",
            data_json: JSON.stringify({
              categories: [
                {
                  name: "Бакалія",
                  items: [{ id: "i1", name: "Рис", checked: false }],
                },
              ],
            }),
          },
        ]),
      exec: jest.fn(),
      run: jest.fn(),
    };

    const cache = await refreshNutritionSqliteState(client, "user-1");

    expect(client.all).toHaveBeenCalledTimes(7);
    expect(cache.log["2026-05-04"]?.meals[0]).toMatchObject({
      id: "meal-1",
      name: "",
      time: "08:30",
      mealType: "snack",
      label: "Сніданок",
      source: "manual",
      macroSource: "ai",
      amount_g: 250,
      foodId: "food-1",
      demo: true,
    });
    expect(cache.pantries).toEqual([
      {
        id: "pantry-1",
        name: "",
        text: "",
        items: [{ name: "Гречка", qty: 2, unit: null, notes: "пачки" }],
      },
    ]);
    expect(cache.activePantryId).toBe("pantry-1");
    expect(cache.prefs).toMatchObject({ waterGoalMl: 2300 });
    expect(cache.recipes).toHaveLength(1);
    expect(cache.recipes[0]).toMatchObject({
      id: "recipe-1",
      title: "Омлет",
      timeMinutes: 12,
      servings: 1,
    });
    expect(cache.waterLog).toEqual({ "2026-05-04": 750 });
    expect(cache.shoppingList).toEqual(
      normalizeShoppingList({
        categories: [
          {
            name: "Бакалія",
            items: [{ id: "i1", name: "Рис", checked: false }],
          },
        ],
      }),
    );
    expect(cache.refreshedAt).toBe("2026-05-04T10:11:12.000Z");
  });

  it("clears and seeds the warm cache for hook tests", () => {
    __setNutritionSqliteCacheForTests({
      waterLog: { "2026-05-04": 500 },
    });

    expect(getCachedNutritionSqliteState().waterLog).toEqual({
      "2026-05-04": 500,
    });

    clearNutritionSqliteCache();

    expect(getCachedNutritionSqliteState()).toMatchObject({
      log: {},
      pantries: [],
      activePantryId: null,
      prefs: null,
      recipes: [],
      waterLog: {},
      shoppingList: null,
      refreshedAt: null,
    });
  });
});
