/**
 * Last validated: 2026-11-18
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import type { Meal, NutritionLog } from "@sergeant/nutrition-domain";
import { lastFoodPortion } from "./lastFoodPortion";

function meal(over: Partial<Meal>): Meal {
  return {
    id: over.id ?? "m",
    name: "Банан",
    time: "12:00",
    mealType: "lunch",
    label: "Обід",
    macros: { kcal: 100, protein_g: 1, fat_g: 0, carbs_g: 23 },
    source: "manual",
    macroSource: "productDb",
    amount_g: 100,
    foodId: "gen_banan",
    ...over,
  };
}

const TODAY = "2026-11-18";

describe("lastFoodPortion", () => {
  it("бере вагу найсвіжішого запису того самого продукту", () => {
    const log: NutritionLog = {
      "2026-11-10": { meals: [meal({ id: "a", amount_g: 150 })] },
      "2026-11-15": {
        meals: [
          meal({ id: "b", amount_g: 90, time: "08:00" }),
          meal({ id: "c", amount_g: 120, time: "19:40" }),
          meal({ id: "d", amount_g: 300, foodId: "gen_other", time: "21:00" }),
        ],
      },
    };
    expect(lastFoodPortion(log, "gen_banan", TODAY)).toEqual({
      grams: 120,
      date: "2026-11-15",
    });
  });

  it("немає запису з цим продуктом або з вагою: null", () => {
    const log: NutritionLog = {
      "2026-11-15": {
        meals: [
          meal({ id: "a", foodId: "gen_other" }),
          meal({ id: "b", amount_g: null }),
          meal({ id: "c", amount_g: 0 }),
        ],
      },
    };
    expect(lastFoodPortion(log, "gen_banan", TODAY)).toBeNull();
    expect(lastFoodPortion({}, "gen_banan", TODAY)).toBeNull();
    expect(lastFoodPortion(log, "", TODAY)).toBeNull();
  });

  it("майбутні дні (план, а не зʼїдене) не рахуються", () => {
    const log: NutritionLog = {
      "2026-11-12": { meals: [meal({ id: "a", amount_g: 80 })] },
      "2026-11-20": { meals: [meal({ id: "b", amount_g: 500 })] },
    };
    expect(lastFoodPortion(log, "gen_banan", TODAY)).toEqual({
      grams: 80,
      date: "2026-11-12",
    });
  });
});
