// @vitest-environment jsdom
/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getFoodById = vi.hoisted(() => vi.fn());
vi.mock("../../lib/foodDb/foodDb", () => ({ getFoodById }));

import { useEditedFoodRehydration } from "./useEditedFoodRehydration";

const FOOD = {
  id: "f1",
  name: "Курка",
  brand: "Наша Ряба",
  defaultGrams: 100,
  per100: { kcal: 110, protein_g: 23, fat_g: 2, carbs_g: 0 },
};

afterEach(() => vi.clearAllMocks());

describe("useEditedFoodRehydration", () => {
  // Ядро фікса: без цього читання аркуш редагування не мав ні поля ваги,
  // ні перерахунку — `PickedFoodCard` рендериться лише під `pickedFood`.
  it("піднімає продукт редагованого прийому з бази", async () => {
    getFoodById.mockResolvedValue(FOOD);
    const setPickedFood = vi.fn();
    const { result } = renderHook(() =>
      useEditedFoodRehydration({
        open: true,
        meal: { id: "m1", foodId: "f1" },
        setPickedFood,
      }),
    );

    await waitFor(() => expect(result.current.rehydrated).toBe(true));
    expect(setPickedFood).toHaveBeenCalledWith(
      expect.objectContaining({ id: "f1", per100: FOOD.per100 }),
    );
  });

  it("нічого не читає при створенні нового прийому", () => {
    renderHook(() =>
      useEditedFoodRehydration({
        open: true,
        meal: null,
        setPickedFood: vi.fn(),
      }),
    );
    expect(getFoodById).not.toHaveBeenCalled();
  });

  it("не позначає відновленням продукт, якого вже немає в базі", async () => {
    getFoodById.mockResolvedValue(null);
    const setPickedFood = vi.fn();
    const { result } = renderHook(() =>
      useEditedFoodRehydration({
        open: true,
        meal: { id: "m1", foodId: "gone" },
        setPickedFood,
      }),
    );

    await waitFor(() => expect(getFoodById).toHaveBeenCalled());
    expect(setPickedFood).not.toHaveBeenCalled();
    expect(result.current.rehydrated).toBe(false);
  });

  // Далі будь-який вибір — дія людини, і глушити перерахунок під нього
  // означало б лишити її з макросами від попереднього продукту.
  it("`clear()` знімає позначку, коли людина йде обирати інший продукт", async () => {
    getFoodById.mockResolvedValue(FOOD);
    const { result } = renderHook(() =>
      useEditedFoodRehydration({
        open: true,
        meal: { id: "m1", foodId: "f1" },
        setPickedFood: vi.fn(),
      }),
    );

    await waitFor(() => expect(result.current.rehydrated).toBe(true));
    act(() => result.current.clear());
    expect(result.current.rehydrated).toBe(false);
  });

  it("закритий аркуш не вважається відновленим", () => {
    const { result } = renderHook(() =>
      useEditedFoodRehydration({
        open: false,
        meal: { id: "m1", foodId: "f1" },
        setPickedFood: vi.fn(),
      }),
    );
    expect(getFoodById).not.toHaveBeenCalled();
    expect(result.current.rehydrated).toBe(false);
  });

  // Ревʼю PR #1053. `cancelled` живе в замиканні ефекту, а `clear()` ефект не
  // перезапускає — тож без лічильника поколінь відповідь, яка приїхала ПІСЛЯ
  // того, як людина пішла по інший продукт, ставила старий продукт поверх її
  // нового вибору, і прийом зберігався з чужими макросами.
  it("відповідь, що прийшла після `clear()`, уже нічого не ставить", async () => {
    let release: (food: unknown) => void = () => {};
    getFoodById.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const setPickedFood = vi.fn();
    const { result } = renderHook(() =>
      useEditedFoodRehydration({
        open: true,
        meal: { id: "m1", foodId: "f1" },
        setPickedFood,
      }),
    );

    await waitFor(() => expect(getFoodById).toHaveBeenCalled());
    act(() => result.current.clear());

    await act(async () => {
      release(FOOD);
      await Promise.resolve();
    });

    expect(setPickedFood).not.toHaveBeenCalled();
    expect(result.current.rehydrated).toBe(false);
  });
});
