import { describe, expect, it } from "vitest";
import { PANTRY_ONLY_EMPTY_MESSAGE } from "@sergeant/shared";
import {
  PANTRY_IGNORE_SECTION,
  PANTRY_PRESETS,
  pantryPromptSection,
} from "./prompt-builders.js";

describe("prompt-builders", () => {
  it("PANTRY_PRESETS covers all four nutrition endpoints", () => {
    expect(Object.keys(PANTRY_PRESETS).sort()).toEqual([
      "dayPlan",
      "recipes",
      "shoppingList",
      "weekPlan",
    ]);
  });

  it("pantryPromptSection list preset renders bulleted list", () => {
    const items = [{ name: "яйця", qty: "10", unit: "шт" }, { name: "молоко" }];
    const result = pantryPromptSection({
      pantry: items,
      preset: "dayPlan",
    });
    expect(result).toContain("Наявні продукти:");
    expect(result).toContain("\n- яйця");
    expect(result).toContain("молоко");
  });

  it("pantryPromptSection flat preset renders comma-separated", () => {
    const items = [{ name: "цукор" }, { name: "сіль" }];
    const result = pantryPromptSection({
      pantry: items,
      preset: "shoppingList",
    });
    expect(result).toContain("Наявні продукти:");
    expect(result).toContain("цукор, сіль");
  });

  it("pantryPromptSection respects custom label", () => {
    const result = pantryPromptSection({
      pantry: [{ name: "рис" }],
      preset: "weekPlan",
      label: "Продукти вдома",
    });
    expect(result.startsWith("Продукти вдома:")).toBe(true);
  });

  it("mode=ignore не показує жодної позиції комори", () => {
    // Модель не може використати те, чого не бачить. Інструкція «ігноруй»
    // поруч зі списком продуктів — слабкий важіль; тут перевіряється саме
    // відсутність списку, а не наявність слова «ігноруй».
    const result = pantryPromptSection({
      pantry: [{ name: "яйця", qty: "10", unit: "шт" }, { name: "молоко" }],
      preset: "dayPlan",
      mode: "ignore",
    });
    expect(result).toBe(PANTRY_IGNORE_SECTION);
    expect(result).not.toContain("яйця");
    expect(result).not.toContain("молоко");
  });

  it("mode=only додає жорстке обмеження поверх списку", () => {
    const result = pantryPromptSection({
      pantry: [{ name: "рис" }],
      preset: "dayPlan",
      mode: "only",
    });
    expect(result).toContain("рис");
    expect(result).toContain("ТІЛЬКИ ці продукти");
  });

  it.each(["dayPlan", "weekPlan", "recipes"] as const)(
    "mode=only з порожньою коморою відсікає %s до промпту",
    (preset) => {
      expect(() =>
        pantryPromptSection({ pantry: [], preset, mode: "only" }),
      ).toThrow(PANTRY_ONLY_EMPTY_MESSAGE);
    },
  );

  it("mode=prefer (дефолт) лишає історичну поведінку", () => {
    const items = [{ name: "гречка" }];
    expect(pantryPromptSection({ pantry: items, preset: "dayPlan" })).toBe(
      pantryPromptSection({ pantry: items, preset: "dayPlan", mode: "prefer" }),
    );
  });

  it("pantryPromptSection uses fallbackWhenEmpty from preset", () => {
    const result = pantryPromptSection({
      pantry: [],
      preset: "dayPlan",
    });
    expect(result).toContain("продукти не вказані");
  });

  it.each(["recipes", "weekPlan"] as const)(
    "prefer з порожньою коморою не залишає порожній список у %s",
    (preset) => {
      expect(pantryPromptSection({ pantry: [], preset })).toContain(
        "продукти не вказані",
      );
    },
  );
});
