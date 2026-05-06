// defaultNutritionPrefs + normalizeNutritionPrefs: парсинг довільного JSON-вводу
// (legacy LS / RN MMKV) у валідні NutritionPrefs.
import { describe, expect, it } from "vitest";

import {
  defaultNutritionPrefs,
  normalizeNutritionPrefs,
} from "./nutritionPrefs.js";

describe("defaultNutritionPrefs", () => {
  it("повертає стабільний дефолт (зміни = міграція)", () => {
    expect(defaultNutritionPrefs()).toEqual({
      goal: "balanced",
      servings: 1,
      timeMinutes: 25,
      exclude: "",
      dailyTargetKcal: null,
      dailyTargetProtein_g: null,
      dailyTargetFat_g: null,
      dailyTargetCarbs_g: null,
      mealTemplates: [],
      reminderEnabled: false,
      reminderHour: 12,
      waterGoalMl: 2000,
    });
  });

  it("кожен виклик дає новий об'єкт", () => {
    const a = defaultNutritionPrefs();
    const b = defaultNutritionPrefs();
    expect(a).not.toBe(b);
    a.mealTemplates.push({
      id: "x",
      name: "y",
      mealType: "snack",
      macros: { kcal: null, protein_g: null, fat_g: null, carbs_g: null },
    });
    expect(b.mealTemplates).toEqual([]);
  });
});

describe("normalizeNutritionPrefs", () => {
  describe("invalid input → defaults", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["array", []],
      ["string", "garbage"],
      ["number", 42],
    ])("повертає defaults для %s", (_label, input) => {
      expect(normalizeNutritionPrefs(input)).toEqual(defaultNutritionPrefs());
    });
  });

  describe("scalar coercion", () => {
    it("servings: NaN/0/null → 1", () => {
      expect(normalizeNutritionPrefs({ servings: "garbage" }).servings).toBe(1);
      expect(normalizeNutritionPrefs({ servings: 0 }).servings).toBe(1);
      expect(normalizeNutritionPrefs({ servings: null }).servings).toBe(1);
    });

    it("servings: позитивне число лишається", () => {
      expect(normalizeNutritionPrefs({ servings: 4 }).servings).toBe(4);
    });

    it("timeMinutes: NaN → 25 (default)", () => {
      expect(
        normalizeNutritionPrefs({ timeMinutes: "garbage" }).timeMinutes,
      ).toBe(25);
      expect(normalizeNutritionPrefs({ timeMinutes: 0 }).timeMinutes).toBe(25);
      expect(normalizeNutritionPrefs({ timeMinutes: 60 }).timeMinutes).toBe(60);
    });

    it("exclude: null → '', інше → String", () => {
      expect(normalizeNutritionPrefs({ exclude: null }).exclude).toBe("");
      expect(normalizeNutritionPrefs({ exclude: 42 }).exclude).toBe("42");
    });

    it("goal: falsy → 'balanced'", () => {
      expect(normalizeNutritionPrefs({ goal: "" }).goal).toBe("balanced");
      expect(normalizeNutritionPrefs({ goal: 0 }).goal).toBe("balanced");
      expect(normalizeNutritionPrefs({ goal: "loss" }).goal).toBe("loss");
    });

    it("dailyTarget*: <=0 / NaN → null; >0 → значення", () => {
      const out = normalizeNutritionPrefs({
        dailyTargetKcal: 2000,
        dailyTargetProtein_g: -10, // negative → null
        dailyTargetFat_g: "abc", // NaN → null
        dailyTargetCarbs_g: 0, // 0 не позитивне → null
      });
      expect(out.dailyTargetKcal).toBe(2000);
      expect(out.dailyTargetProtein_g).toBeNull();
      expect(out.dailyTargetFat_g).toBeNull();
      expect(out.dailyTargetCarbs_g).toBeNull();
    });

    it("reminderEnabled: завжди Boolean()", () => {
      expect(
        normalizeNutritionPrefs({ reminderEnabled: 1 }).reminderEnabled,
      ).toBe(true);
      expect(
        normalizeNutritionPrefs({ reminderEnabled: 0 }).reminderEnabled,
      ).toBe(false);
      expect(
        normalizeNutritionPrefs({ reminderEnabled: "yes" }).reminderEnabled,
      ).toBe(true);
    });

    it("reminderHour: clamp у [0, 23] + floor", () => {
      expect(normalizeNutritionPrefs({ reminderHour: 7.9 }).reminderHour).toBe(
        7,
      );
      expect(normalizeNutritionPrefs({ reminderHour: -5 }).reminderHour).toBe(
        0,
      );
      expect(normalizeNutritionPrefs({ reminderHour: 99 }).reminderHour).toBe(
        23,
      );
      expect(
        normalizeNutritionPrefs({ reminderHour: "garbage" }).reminderHour,
      ).toBe(12); // default
    });

    it("waterGoalMl: <=0 / NaN → дефолт 2000; позитивне зберігається", () => {
      expect(normalizeNutritionPrefs({ waterGoalMl: 0 }).waterGoalMl).toBe(
        2000,
      );
      expect(normalizeNutritionPrefs({ waterGoalMl: -100 }).waterGoalMl).toBe(
        2000,
      );
      expect(
        normalizeNutritionPrefs({ waterGoalMl: "garbage" }).waterGoalMl,
      ).toBe(2000);
      expect(normalizeNutritionPrefs({ waterGoalMl: 2500 }).waterGoalMl).toBe(
        2500,
      );
    });
  });

  describe("mealTemplates", () => {
    it("не масив → []", () => {
      expect(
        normalizeNutritionPrefs({ mealTemplates: "garbage" }).mealTemplates,
      ).toEqual([]);
    });

    it("обрізає до 40 шаблонів (slice 0..40)", () => {
      const tpls = Array.from({ length: 50 }, (_, i) => ({
        id: `t${i}`,
        name: `Тплт ${i}`,
        mealType: "snack",
      }));
      expect(
        normalizeNutritionPrefs({ mealTemplates: tpls }).mealTemplates,
      ).toHaveLength(40);
    });

    it("відкидає шаблон без name (після trim) і non-object", () => {
      const out = normalizeNutritionPrefs({
        mealTemplates: [
          { id: "t1", name: "  Сніданок  ", mealType: "breakfast" },
          { id: "t2", name: "", mealType: "lunch" }, // пустий name → drop
          { id: "t3", name: "   ", mealType: "snack" }, // тільки whitespace → drop
          "garbage",
          null,
        ],
      });
      expect(out.mealTemplates).toHaveLength(1);
      expect(out.mealTemplates[0]!.name).toBe("Сніданок");
      expect(out.mealTemplates[0]!.mealType).toBe("breakfast");
    });

    it("невалідний mealType → fallback 'snack'", () => {
      const out = normalizeNutritionPrefs({
        mealTemplates: [{ id: "t1", name: "Х", mealType: "wrong" }],
      });
      expect(out.mealTemplates[0]!.mealType).toBe("snack");
    });

    it("шаблон без id → синтетичний tpl_<ts>", () => {
      const out = normalizeNutritionPrefs({
        mealTemplates: [{ name: "Х", mealType: "lunch" }],
      });
      expect(out.mealTemplates[0]!.id).toMatch(/^tpl_\d+$/);
    });

    it("macros нормалізується через @sergeant/shared (negative → null)", () => {
      const out = normalizeNutritionPrefs({
        mealTemplates: [
          {
            id: "t1",
            name: "Х",
            mealType: "lunch",
            macros: { kcal: 500, protein_g: -10, fat_g: "abc", carbs_g: 50 },
          },
        ],
      });
      expect(out.mealTemplates[0]!.macros).toEqual({
        kcal: 500,
        protein_g: null, // <0
        fat_g: null, // NaN
        carbs_g: 50,
      });
    });
  });
});
