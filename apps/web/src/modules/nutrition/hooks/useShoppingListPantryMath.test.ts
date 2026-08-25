// @vitest-environment jsdom
/**
 * Last validated: 2026-08-18
 * Status: Active
 * Unit tests for `useShoppingListPantryMath` — toggle persistence + default
 * behavior when no pantry data is available.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ShoppingList } from "@sergeant/nutrition-domain";
import {
  SHOPPING_PANTRY_MATH_TOGGLE_KEY,
  useShoppingListPantryMath,
} from "./useShoppingListPantryMath";

const listWithMilk: ShoppingList = {
  categories: [
    {
      name: "Молочні продукти",
      items: [
        {
          id: "i1",
          name: "Молоко",
          quantity: "700 г",
          note: "",
          checked: false,
        },
      ],
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

describe("useShoppingListPantryMath", () => {
  it("defaults to enabled and mirrors the raw list when the pantry is empty", () => {
    const { result } = renderHook(() =>
      useShoppingListPantryMath(listWithMilk, []),
    );
    expect(result.current.enabled).toBe(true);
    expect(result.current.available).toBe(false);
    expect(result.current.calculated.categories[0]?.items[0]?.quantity).toBe(
      "700 г",
    );
    expect(result.current.calculated.categories[0]?.items[0]?.calcNote).toBe(
      "",
    );
  });

  it("reduces the quantity once pantry data is available and enabled", () => {
    const { result } = renderHook(() =>
      useShoppingListPantryMath(listWithMilk, [
        { name: "молоко", qty: 400, unit: "г", notes: null },
      ]),
    );
    expect(result.current.available).toBe(true);
    expect(result.current.calculated.categories[0]?.items[0]?.quantity).toBe(
      "300 г",
    );
  });

  it("reverts to the raw list once disabled", () => {
    const { result, rerender } = renderHook(
      ({ pantry }) => useShoppingListPantryMath(listWithMilk, pantry),
      {
        initialProps: {
          pantry: [{ name: "молоко", qty: 400, unit: "г", notes: null }],
        },
      },
    );
    expect(result.current.calculated.categories[0]?.items[0]?.quantity).toBe(
      "300 г",
    );

    act(() => result.current.setEnabled(false));
    rerender({
      pantry: [{ name: "молоко", qty: 400, unit: "г", notes: null }],
    });
    expect(result.current.enabled).toBe(false);
    expect(result.current.calculated.categories[0]?.items[0]?.quantity).toBe(
      "700 г",
    );
  });

  it("persists the toggle choice across hook instances", () => {
    const first = renderHook(() => useShoppingListPantryMath(listWithMilk, []));
    act(() => first.result.current.setEnabled(false));
    expect(localStorage.getItem(SHOPPING_PANTRY_MATH_TOGGLE_KEY)).toBe("false");

    const second = renderHook(() =>
      useShoppingListPantryMath(listWithMilk, []),
    );
    expect(second.result.current.enabled).toBe(false);
  });
});
