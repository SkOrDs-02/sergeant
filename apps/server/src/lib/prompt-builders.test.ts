import { describe, expect, it } from "vitest";
import { PANTRY_PRESETS, pantryPromptSection } from "./prompt-builders.js";

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

  it("pantryPromptSection uses fallbackWhenEmpty from preset", () => {
    const result = pantryPromptSection({
      pantry: [],
      preset: "dayPlan",
    });
    expect(result).toContain("продукти не вказані");
  });
});
