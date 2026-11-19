/**
 * Last validated: 2026-11-18
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import type { NutritionPhotoResult } from "@shared/api";
import { buildPhotoQuickMeals } from "./photoQuickSave";

function result(
  over: Partial<NutritionPhotoResult> = {},
): NutritionPhotoResult {
  return {
    dishName: "Курка з рисом",
    confidence: 0.8,
    macros: { kcal: 486, protein_g: 40, fat_g: 12, carbs_g: 50 },
    ...over,
  } as NutritionPhotoResult;
}

describe("buildPhotoQuickMeals", () => {
  it("без позицій: один рядок photoAI з назвою страви і типом прийому", () => {
    const out = buildPhotoQuickMeals(result(), "dinner", "m1");
    expect(out?.title).toBe("Курка з рисом");
    expect(out?.meals).toEqual([
      expect.objectContaining({
        id: "m1",
        name: "Курка з рисом",
        mealType: "dinner",
        label: "Вечеря",
        source: "photo",
        macroSource: "photoAI",
        foodId: null,
        macros: { kcal: 486, protein_g: 40, fat_g: 12, carbs_g: 50 },
      }),
    ]);
  });

  it("позиції: N рядків, перший несе переданий id", () => {
    const out = buildPhotoQuickMeals(
      result({
        items: [
          {
            name: "Курка",
            macros: { kcal: 300, protein_g: 35, fat_g: 10, carbs_g: 0 },
            gramsApprox: 150,
            confidence: 0.9,
          },
          {
            name: "Рис",
            macros: { kcal: 186, protein_g: 5, fat_g: 2, carbs_g: 50 },
            gramsApprox: 140,
            confidence: 0.9,
          },
        ],
      } as Partial<NutritionPhotoResult>),
      "lunch",
      "m1",
    );
    expect(out?.meals.map((m) => [m.id === "m1", m.name, m.mealType])).toEqual([
      [true, "Курка", "lunch"],
      [false, "Рис", "lunch"],
    ]);
  });

  it("порожні КБЖВ, не-їжа або без назви: null — лишається крок перевірки", () => {
    expect(
      buildPhotoQuickMeals(
        result({
          macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
        }),
        "dinner",
        "m1",
      ),
    ).toBeNull();
    expect(
      buildPhotoQuickMeals(result({ isFood: false }), "dinner", "m1"),
    ).toBeNull();
    expect(
      buildPhotoQuickMeals(result({ dishName: "Результат" }), "dinner", "m1"),
    ).toBeNull();
  });
});
