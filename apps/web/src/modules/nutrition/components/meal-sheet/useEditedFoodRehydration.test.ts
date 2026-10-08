// @vitest-environment jsdom
/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getFoodById = vi.hoisted(() => vi.fn());
vi.mock("../../lib/foodDb/foodDb", () => ({ getFoodById }));

import { GENERIC_FOODS } from "@sergeant/shared/data/genericFoods";
import {
  per100FromMeal,
  useEditedFoodRehydration,
} from "./useEditedFoodRehydration";

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
        meal: { id: "m1", foodId: "f1", macroSource: "productDb" },
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
        meal: { id: "m1", foodId: "gone", macroSource: "productDb" },
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
        meal: { id: "m1", foodId: "f1", macroSource: "productDb" },
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
        meal: { id: "m1", foodId: "f1", macroSource: "productDb" },
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
        meal: { id: "m1", foodId: "f1", macroSource: "productDb" },
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

  // ux-13: на іншому пристрої локальної foodDb з `food_<uuid>` немає, і поле
  // ваги зникало. Прийом сам несе порцію, тож етикетка виводиться з неї.
  describe("продукту немає в локальній базі (інший пристрій)", () => {
    it("відновлює per100 з порції прийому productDb", async () => {
      getFoodById.mockResolvedValue(null);
      const setPickedFood = vi.fn();
      const { result } = renderHook(() =>
        useEditedFoodRehydration({
          open: true,
          meal: {
            id: "m1",
            name: "Яйце куряче",
            foodId: "food_x",
            macroSource: "productDb",
            amount_g: 120,
            macros: { kcal: 172, protein_g: 15, fat_g: 13, carbs_g: 1 },
          },
          setPickedFood,
        }),
      );

      await waitFor(() => expect(result.current.rehydrated).toBe(true));
      const picked = setPickedFood.mock.calls[0]![0];
      expect(picked).toMatchObject({ id: "food_x", name: "Яйце куряче" });
      expect(picked.per100.kcal).toBeCloseTo(143, 0);
      expect(picked.per100.protein_g).toBeCloseTo(12.5, 1);
    });

    it("не вигадує продукт для ручного прийому", async () => {
      getFoodById.mockResolvedValue(null);
      const setPickedFood = vi.fn();
      const { result } = renderHook(() =>
        useEditedFoodRehydration({
          open: true,
          meal: {
            id: "m1",
            name: "Суп",
            foodId: "food_x",
            macroSource: "manual",
            amount_g: 120,
            macros: { kcal: 172, protein_g: 15, fat_g: 13, carbs_g: 1 },
          },
          setPickedFood,
        }),
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(setPickedFood).not.toHaveBeenCalled();
      expect(result.current.rehydrated).toBe(false);
    });

    it("`gen_<slug>` відновлюється зі спільного корпусу GENERIC_FOODS", async () => {
      getFoodById.mockResolvedValue(null);
      const generic = GENERIC_FOODS[0]!;
      const setPickedFood = vi.fn();
      const { result } = renderHook(() =>
        useEditedFoodRehydration({
          open: true,
          // Без ваги: відновлення має спрацювати саме по id.
          meal: {
            id: "m1",
            foodId: `gen_${generic.slug}`,
            macroSource: "productDb",
          },
          setPickedFood,
        }),
      );

      await waitFor(() => expect(result.current.rehydrated).toBe(true));
      expect(setPickedFood).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `gen_${generic.slug}`,
          name: generic.name,
          per100: generic.per100,
        }),
      );
    });

    // Ревʼю ux-13: ручна правка КБЖВ лишає `foodId`, але ставить `manual`.
    // Відновлений продукт відкрив би поле ваги, і його зміна затерла б ручні
    // цифри значенням з каталогу.
    it("`gen_<slug>` з macroSource manual не відновлюється", async () => {
      getFoodById.mockResolvedValue(null);
      const generic = GENERIC_FOODS[0]!;
      const setPickedFood = vi.fn();
      const { result } = renderHook(() =>
        useEditedFoodRehydration({
          open: true,
          meal: {
            id: "m1",
            name: generic.name,
            foodId: `gen_${generic.slug}`,
            macroSource: "manual",
            amount_g: 200,
            macros: { kcal: 999, protein_g: 1, fat_g: 1, carbs_g: 1 },
          },
          setPickedFood,
        }),
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(setPickedFood).not.toHaveBeenCalled();
      expect(result.current.rehydrated).toBe(false);
    });

    it("локальний продукт з macroSource manual не відновлюється", async () => {
      getFoodById.mockResolvedValue(FOOD);
      const setPickedFood = vi.fn();
      const { result } = renderHook(() =>
        useEditedFoodRehydration({
          open: true,
          meal: { id: "m1", foodId: "f1", macroSource: "manual" },
          setPickedFood,
        }),
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(setPickedFood).not.toHaveBeenCalled();
      expect(result.current.rehydrated).toBe(false);
    });

    it("`per100FromMeal` відхиляє нульову вагу й порожні макроси", () => {
      expect(per100FromMeal(0, { kcal: 100 })).toBeNull();
      expect(per100FromMeal(null, { kcal: 100 })).toBeNull();
      expect(per100FromMeal(100, { kcal: null })).toBeNull();
      expect(per100FromMeal(100, null)).toBeNull();
    });
  });
});
