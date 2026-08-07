import { describe, expect, it } from "vitest";
import {
  normalizePantryItems,
  normalizePhotoResult,
  normalizeRecipes,
} from "./nutritionResponse.js";

describe("nutritionResponse normalizers", () => {
  it("normalizePhotoResult clamps confidence and sanitizes fields", () => {
    const out = normalizePhotoResult({
      dishName: "  Борщ ",
      confidence: 5,
      portion: { label: "   ", gramsApprox: "320" },
      ingredients: [{ name: "  буряк " }, { name: "" }, null],
      macros: { kcal: "400", protein_g: "x", fat_g: 12, carbs_g: 55.2 },
      questions: ["  Скільки сметани?  ", "", 123],
    });
    expect(out.dishName).toBe("Борщ");
    expect(out.confidence).toBe(1);
    expect(out.portion).toEqual({ label: null, gramsApprox: 320 });
    expect(out.ingredients).toEqual([{ name: "буряк", notes: null }]);
    expect(out.macros).toEqual({
      kcal: 400,
      protein_g: null,
      fat_g: 12,
      carbs_g: 55.2,
    });
    expect(out.questions).toEqual(["Скільки сметани?", "123"]);
  });

  it("normalizePhotoResult uses fallback grams when portion missing", () => {
    const out = normalizePhotoResult(
      {
        dishName: "x",
        confidence: 0.2,
        portion: null,
        ingredients: [],
        macros: {},
        questions: [],
      },
      { fallbackGrams: 250 },
    );
    expect(out.portion).toEqual({ label: "250 г", gramsApprox: 250 });
  });

  it("normalizePhotoResult keeps isFood true when macros are present", () => {
    const out = normalizePhotoResult({
      dishName: "Борщ",
      confidence: 0.8,
      macros: { kcal: 280, protein_g: 18, fat_g: 12, carbs_g: 22 },
      questions: ["Чи був хліб?"],
    });
    expect(out.isFood).toBe(true);
    expect(out.questions).toEqual(["Чи був хліб?"]);
  });

  it("normalizePhotoResult drops macros and questions when the model says isFood:false", () => {
    const out = normalizePhotoResult({
      isFood: false,
      dishName: "Кіт",
      confidence: 1,
      macros: { kcal: 250, protein_g: 10, fat_g: 5, carbs_g: 30 },
      questions: ["Яка вага порції?"],
    });
    expect(out.isFood).toBe(false);
    expect(out.dishName).toBe("Кіт");
    expect(out.macros).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
    expect(out.questions).toEqual([]);
  });

  it("normalizePhotoResult treats a macro-less answer without isFood as a refusal", () => {
    // Рівно та відповідь, яку прод показував на фото кота до появи прапорця:
    // впевненість 1.0, нулі в КБЖВ і питання про порцію того, чого не їдять.
    const out = normalizePhotoResult({
      dishName: "Кіт",
      confidence: 1,
      macros: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
      questions: ["Чи є на фото щось інше, окрім кота?"],
    });
    expect(out.isFood).toBe(false);
    expect(out.questions).toEqual([]);
    expect(out.macros.kcal).toBeNull();
  });

  it("normalizePhotoResult trusts an explicit isFood:true with zero macros (вода, чай)", () => {
    const out = normalizePhotoResult({
      isFood: true,
      dishName: "Склянка води",
      confidence: 0.9,
      macros: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
      questions: [],
    });
    expect(out.isFood).toBe(true);
    expect(out.macros.kcal).toBe(0);
  });

  it("normalizePhotoResult reads stringified and numeric isFood flags", () => {
    expect(
      normalizePhotoResult({ dishName: "Кіт", isFood: "false", macros: {} })
        .isFood,
    ).toBe(false);
    expect(
      normalizePhotoResult({ dishName: "Вода", isFood: "true", macros: {} })
        .isFood,
    ).toBe(true);
    expect(
      normalizePhotoResult({ dishName: "Кіт", isFood: 0, macros: {} }).isFood,
    ).toBe(false);
  });

  it("normalizePantryItems accepts {items} and drops invalid rows", () => {
    const out = normalizePantryItems({
      items: [
        { name: "яйця", qty: "2", unit: "шт", notes: "" },
        { name: "  ", qty: 1 },
        null,
      ],
    });
    expect(out).toEqual([{ name: "яйця", qty: 2, unit: "шт", notes: null }]);
  });

  it("normalizePantryItems sets unit to шт when qty is present but unit is null", () => {
    const out = normalizePantryItems({
      items: [{ name: "огірок", qty: 4, unit: null, notes: null }],
    });
    expect(out).toEqual([{ name: "огірок", qty: 4, unit: "шт", notes: null }]);
  });

  it("normalizePantryItems merges duplicates, qty-bearing row wins", () => {
    // Рівно той вхід, на якому всі перевірені моделі 0/3: надиктований список
    // із повторами, де кількість вказана то в першій, то в другій згадці.
    const out = normalizePantryItems({
      items: [
        { name: "молоко", qty: 1, unit: "л", notes: null },
        { name: "банан", qty: 2, unit: "шт", notes: null },
        { name: " Молоко ", qty: null, unit: null, notes: "холодне" },
        { name: "йогурт", qty: null, unit: null, notes: null },
        { name: "йогурт", qty: 2, unit: null, notes: null },
      ],
    });
    expect(out).toEqual([
      { name: "молоко", qty: 1, unit: "л", notes: "холодне" },
      { name: "банан", qty: 2, unit: "шт", notes: null },
      { name: "йогурт", qty: 2, unit: "шт", notes: null },
    ]);
  });

  it("normalizeRecipes trims arrays and shapes macros", () => {
    const out = normalizeRecipes({
      recipes: [
        {
          title: "  Омлет ",
          timeMinutes: "10",
          servings: 1,
          ingredients: ["яйця", "  ", 123],
          steps: ["збити", "посмажити"],
          tips: ["сіль"],
          macros: { kcal: "250", protein_g: 20, fat_g: 18, carbs_g: "x" },
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: "Омлет",
      timeMinutes: 10,
      servings: 1,
      ingredients: ["яйця", "123"],
      steps: ["збити", "посмажити"],
      tips: ["сіль"],
      macros: { kcal: 250, protein_g: 20, fat_g: 18, carbs_g: null },
    });
  });
});
