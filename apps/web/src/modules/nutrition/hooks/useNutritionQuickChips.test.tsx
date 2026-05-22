// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { NutritionLog, PantryItem } from "@sergeant/nutrition-domain";
import { toLocalISODate } from "@sergeant/shared";
import { useNutritionQuickChips } from "./useNutritionQuickChips";

function mkLog(daysAgo: number, meals: Array<Partial<{ name: string; kcal: number; amount_g: number }>>): NutritionLog {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const date = toLocalISODate(d);
  return {
    [date]: {
      meals: meals.map((m, i) => ({
        id: `m_${date}_${i}`,
        name: m.name ?? "Кава",
        time: "08:00",
        mealType: "breakfast",
        label: "Сніданок",
        macros: {
          kcal: m.kcal ?? 50,
          protein_g: 1,
          fat_g: 0,
          carbs_g: 10,
        },
        source: "manual",
        macroSource: "manual",
        amount_g: m.amount_g ?? 100,
        foodId: null,
      })),
    },
  } as NutritionLog;
}

describe("useNutritionQuickChips", () => {
  it("returns [] for empty log", () => {
    const { result } = renderHook(() =>
      useNutritionQuickChips({} as NutritionLog, []),
    );
    expect(result.current).toEqual([]);
  });

  it("skips meals without usable macros", () => {
    const log = mkLog(1, [{ name: "Кава", kcal: 0 }]);
    const { result } = renderHook(() => useNutritionQuickChips(log, []));
    expect(result.current).toEqual([]);
  });

  it("derives a chip from a single recent meal with macros", () => {
    const log = mkLog(1, [{ name: "Кава", kcal: 5, amount_g: 50 }]);
    const { result } = renderHook(() => useNutritionQuickChips(log, []));
    expect(result.current).toHaveLength(1);
    const chip = result.current[0]!;
    expect(chip.label).toBe("Кава");
    expect(chip.macros.kcal).toBe(5);
    expect(chip.grams).toBe(50);
    expect(chip.source).toBe("recent-meal");
  });

  it("tags chips matching a pantry item as 'pantry' and sorts them first", () => {
    const log = mkLog(0, [
      { name: "Яблуко", kcal: 80 },
      { name: "Кава", kcal: 5 },
    ]);
    const pantry: PantryItem[] = [
      { name: "Яблуко", qty: 3, unit: "шт", notes: null },
    ];
    const { result } = renderHook(() => useNutritionQuickChips(log, pantry));
    expect(result.current).toHaveLength(2);
    expect(result.current[0]!.label).toBe("Яблуко");
    expect(result.current[0]!.source).toBe("pantry");
    expect(result.current[1]!.source).toBe("recent-meal");
  });

  it("caps the chip count at 5", () => {
    const log = mkLog(2, [
      { name: "A", kcal: 1 },
      { name: "B", kcal: 1 },
      { name: "C", kcal: 1 },
      { name: "D", kcal: 1 },
      { name: "E", kcal: 1 },
      { name: "F", kcal: 1 },
      { name: "G", kcal: 1 },
    ]);
    const { result } = renderHook(() => useNutritionQuickChips(log, []));
    expect(result.current).toHaveLength(5);
  });

  it("truncates long labels with an ellipsis", () => {
    const log = mkLog(1, [{ name: "Дуже-довга-назва-страви", kcal: 100 }]);
    const { result } = renderHook(() => useNutritionQuickChips(log, []));
    expect(result.current[0]!.label.endsWith("…")).toBe(true);
    expect(result.current[0]!.label.length).toBeLessThanOrEqual(12);
  });
});
