// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the `useShoppingList` hook.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useShoppingList } from "./useShoppingList";

const CATEGORIES = [
  {
    name: "Молочка",
    items: [
      { id: "i1", name: "Молоко", quantity: "", note: "", checked: false },
      { id: "i2", name: "Сир", quantity: "", note: "", checked: false },
    ],
  },
];

beforeEach(() => {
  localStorage.clear();
});

describe("useShoppingList", () => {
  it("starts empty and accepts a generated list", () => {
    const { result } = renderHook(() => useShoppingList());
    expect(result.current.shoppingList.categories).toEqual([]);

    act(() => result.current.setGeneratedList(CATEGORIES));
    expect(result.current.shoppingList.categories).toHaveLength(1);
    expect(result.current.checkedItems).toEqual([]);
  });

  it("normalizes a null generated list to empty categories", () => {
    const { result } = renderHook(() => useShoppingList());
    act(() => result.current.setGeneratedList(null));
    expect(result.current.shoppingList.categories).toEqual([]);
  });

  it("toggles an item and surfaces it in checkedItems", () => {
    const { result } = renderHook(() => useShoppingList());
    act(() => result.current.setGeneratedList(CATEGORIES));
    act(() => result.current.toggle("Молочка", "i1"));
    expect(result.current.checkedItems.map((x) => x.id)).toContain("i1");
  });

  it("clears checked items", () => {
    const { result } = renderHook(() => useShoppingList());
    act(() => result.current.setGeneratedList(CATEGORIES));
    act(() => result.current.toggle("Молочка", "i1"));
    act(() => result.current.clearChecked());
    expect(result.current.checkedItems).toEqual([]);
    // unchecked item survives
    expect(
      result.current.shoppingList.categories[0]?.items.some(
        (x) => x.id === "i2",
      ),
    ).toBe(true);
  });

  it("clears the whole list", () => {
    const { result } = renderHook(() => useShoppingList());
    act(() => result.current.setGeneratedList(CATEGORIES));
    act(() => result.current.clearAll());
    expect(result.current.shoppingList.categories).toEqual([]);
  });
});
