// @vitest-environment jsdom
/**
 * Last validated: 2026-10-18
 * Status: Active
 *
 * Окремий файл, бо тут корпус `GENERIC_FOODS` мусить НЕ завантажитись,
 * а основний тест імпортує його напряму.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getFoodById = vi.hoisted(() => vi.fn());
vi.mock("../../lib/foodDb/foodDb", () => ({ getFoodById }));
vi.mock("@sergeant/shared/data/genericFoods", () => {
  throw new Error("chunk load failed");
});

import { useEditedFoodRehydration } from "./useEditedFoodRehydration";

describe("useEditedFoodRehydration — корпус не завантажився", () => {
  it("все одно відновлює per100 з порції прийому productDb", async () => {
    getFoodById.mockResolvedValue(null);
    const setPickedFood = vi.fn();
    const { result } = renderHook(() =>
      useEditedFoodRehydration({
        open: true,
        meal: {
          id: "m1",
          name: "Гречка",
          foodId: "gen_buckwheat",
          macroSource: "productDb",
          amount_g: 200,
          macros: { kcal: 220, protein_g: 8, fat_g: 2, carbs_g: 42 },
        },
        setPickedFood,
      }),
    );

    await waitFor(() => expect(result.current.rehydrated).toBe(true));
    const picked = setPickedFood.mock.calls[0]![0];
    expect(picked).toMatchObject({ id: "gen_buckwheat", name: "Гречка" });
    expect(picked.per100.kcal).toBeCloseTo(110, 0);
  });
});
