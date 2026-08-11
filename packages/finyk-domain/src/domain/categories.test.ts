import { describe, it, expect } from "vitest";
import { categoryColors } from "@sergeant/design-tokens";
import {
  buildExpenseCategoryList,
  getCatColor,
  getCatTiers,
  getCategorySpendList,
} from "./categories";

describe("categories: getCatColor", () => {
  // Очікування читаємо з токенів, а не з літерала: інакше кожен зсув
  // hue в `categoryColors.gen.js` ламав би цей тест, хоча контракт
  // («колір категорії приходить із дизайн-токенів») не змінився. Сам
  // склад палітри гейтить `categoryColors.contract.test.js`.
  it("returns the preset color for known ids", () => {
    expect(getCatColor("food")).toBe(categoryColors.food.solid);
    expect(getCatColor("restaurant")).toBe(categoryColors.restaurant.solid);
  });

  it("falls back to custom color, then palette by idx", () => {
    expect(
      getCatColor("custom1", [{ id: "custom1", color: "#abcdef" } as never]),
    ).toBe("#abcdef");
    const a = getCatColor("unknown", [], 0);
    const b = getCatColor("unknown", [], 1);
    expect(a).not.toBe(b);
  });
});

describe("categories: getCatTiers", () => {
  it("returns the full tier set for a builtin id", () => {
    expect(getCatTiers("transport")).toBe(categoryColors.transport);
  });

  // Кастомний hex свідомо ігнорується: один довільний колір не дає пари
  // фон/чорнило, тож чип із нього був би нечитабельним.
  it("ignores the user's raw hex and wraps the fallback palette by idx", () => {
    const a = getCatTiers("custom1", 0);
    const b = getCatTiers("custom1", 1);
    expect(a).not.toBe(b);
    expect(getCatTiers("custom1", 0)).toBe(a);
  });
});

describe("categories: buildExpenseCategoryList", () => {
  it("excludes income by default, includes custom categories", () => {
    const list = buildExpenseCategoryList([
      { id: "custom_x", label: "X", emoji: "🧪" } as never,
    ]);
    expect(list.some((c) => c.id === "income")).toBe(false);
    expect(list.some((c) => c.id === "custom_x")).toBe(true);
  });

  it("returns base expense categories regardless of excludeIncome flag", () => {
    const a = buildExpenseCategoryList([]);
    const b = buildExpenseCategoryList([], { excludeIncome: false });
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThanOrEqual(a.length);
    expect(b.some((c) => c.id === "food")).toBe(true);
  });
});

describe("categories: getCategorySpendList", () => {
  it("aggregates spend per category, sorts desc, drops zeros", () => {
    const txs = [
      { id: "1", amount: -10000, mcc: 5411, description: "" },
      { id: "2", amount: -5000, mcc: 5411, description: "" },
      { id: "3", amount: -20000, mcc: 4111, description: "" },
      { id: "4", amount: 5000, mcc: 0, description: "salary" },
    ];
    const res = getCategorySpendList(txs);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]!.spent).toBeGreaterThanOrEqual(res[res.length - 1]!.spent);
    expect(res.every((c) => c.id !== "income")).toBe(true);
    expect(res.every((c) => c.spent > 0)).toBe(true);
  });
});
