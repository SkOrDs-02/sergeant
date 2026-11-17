// @vitest-environment jsdom
/**
 * Last validated: 2026-11-17
 * Status: Active
 *
 * Чип «Нещодавні прийоми» — повтор запису, а не новий ручний ввід: тип
 * прийому береться з аркуша (людина відкрила «Вечерю»), а звʼязок із
 * продуктом і походження КБЖВ переходять від запису, з якого чип узято.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Meal } from "@sergeant/nutrition-domain";
import type { ToastApi } from "@shared/hooks/useToast";
import { useQuickAddMealFromChip } from "./useQuickAddMealFromChip";
import type { QuickChip } from "./useNutritionQuickChips";

const CHIP: QuickChip = {
  id: "quickchip:йогурт",
  label: "Йогурт",
  grams: 150,
  macros: { kcal: 150, protein_g: 7.5, fat_g: 3, carbs_g: 15 },
  source: "recent-meal",
  lastUsedAt: "2026-11-16",
  foodId: "food_yogurt",
  macroSource: "productDb",
};

function setup() {
  const added: Meal[] = [];
  const log = {
    handleAddMeal: vi.fn((meal: Meal) => {
      added.push(meal);
      return "2026-11-17";
    }),
    handleRemoveMeal: vi.fn(),
  };
  const toast = { success: vi.fn() } as unknown as ToastApi;
  const { result } = renderHook(() => useQuickAddMealFromChip({ log, toast }));
  return { add: result.current, added };
}

describe("useQuickAddMealFromChip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 13:00 за пристроєм — годинник каже «Обід».
    vi.setSystemTime(new Date(2026, 10, 17, 13, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("пише тип прийому, обраний в аркуші, а не вгаданий годинником", () => {
    const { add, added } = setup();
    add(CHIP, "dinner");
    expect(added[0]).toMatchObject({ mealType: "dinner", label: "Вечеря" });
  });

  it("без обраного типу вгадує його годинником, як і раніше", () => {
    const { add, added } = setup();
    add(CHIP);
    expect(added[0]).toMatchObject({ mealType: "lunch", label: "Обід" });
  });

  it("зберігає звʼязок із продуктом і походження КБЖВ вихідного запису", () => {
    const { add, added } = setup();
    add(CHIP, "dinner");
    expect(added[0]).toMatchObject({
      foodId: "food_yogurt",
      macroSource: "productDb",
      amount_g: 150,
    });
  });

  it("чип без продукту лишається ручним записом без звʼязку", () => {
    const { add, added } = setup();
    const { foodId: _f, macroSource: _m, ...plain } = CHIP;
    add(plain);
    expect(added[0]).toMatchObject({ foodId: null, macroSource: "manual" });
  });
});
