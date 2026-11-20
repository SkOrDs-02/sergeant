// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  deviceDayKey,
  type NutritionLog,
  type PantryItem,
} from "@sergeant/nutrition-domain";
import { useNutritionQuickChips } from "./useNutritionQuickChips";

// ADR-0078: the hook reads "today"/"recent days" off the device-local key.
function mkLog(
  daysAgo: number,
  meals: Array<Partial<{ name: string; kcal: number; amount_g: number }>>,
): NutritionLog {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const date = deviceDayKey(d);
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

  it("несе звʼязок із продуктом і походження КБЖВ останнього запису", () => {
    const log = mkLog(1, [{ name: "Йогурт", kcal: 150, amount_g: 150 }]);
    const meal = Object.values(log)[0]!.meals[0]!;
    meal.foodId = "food_yogurt";
    meal.macroSource = "productDb";
    const { result } = renderHook(() => useNutritionQuickChips(log, []));
    expect(result.current[0]).toMatchObject({
      foodId: "food_yogurt",
      macroSource: "productDb",
    });
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

  it("keeps the full label: the chip logs the meal under this name", () => {
    const log = mkLog(1, [{ name: "Йогурт грецький 2%", kcal: 100 }]);
    const { result } = renderHook(() => useNutritionQuickChips(log, []));
    expect(result.current[0]!.label).toBe("Йогурт грецький 2%");
  });

  describe("частота для поточного часу доби (OD-27 Х-3 б)", () => {
    function typed(
      daysAgo: number,
      name: string,
      mealType: "breakfast" | "lunch" | "dinner" | "snack",
    ): NutritionLog {
      const log = mkLog(daysAgo, [{ name }]);
      for (const day of Object.values(log)) {
        for (const m of day.meals) m.mealType = mealType;
      }
      return log;
    }
    function merge(...logs: NutritionLog[]): NutritionLog {
      const out: NutritionLog = {};
      for (const l of logs) {
        for (const [date, day] of Object.entries(l)) {
          out[date] = { meals: [...(out[date]?.meals ?? []), ...day.meals] };
        }
      }
      return out;
    }
    // Вівсянку їдять на сніданок тричі, суп — двічі на обід, але вчора.
    const log = merge(
      typed(5, "Вівсянка", "breakfast"),
      typed(4, "Вівсянка", "breakfast"),
      typed(3, "Вівсянка", "breakfast"),
      typed(2, "Суп", "lunch"),
      typed(1, "Суп", "lunch"),
    );

    it("вранці першою йде те, що найчастіше їдять на сніданок", () => {
      const { result } = renderHook(() =>
        useNutritionQuickChips(log, [], "breakfast"),
      );
      expect(result.current.map((c) => c.label)).toEqual(["Вівсянка", "Суп"]);
    });

    it("в обід — найчастіше обіднє, навіть якщо інше свіжіше", () => {
      const lunchLog = merge(log, typed(0, "Вівсянка", "breakfast"));
      const { result } = renderHook(() =>
        useNutritionQuickChips(lunchLog, [], "lunch"),
      );
      expect(result.current.map((c) => c.label)).toEqual(["Суп", "Вівсянка"]);
    });

    it("без часу доби порядок як раніше: свіжіше вище", () => {
      const { result } = renderHook(() => useNutritionQuickChips(log, []));
      expect(result.current.map((c) => c.label)).toEqual(["Суп", "Вівсянка"]);
    });
  });
});
