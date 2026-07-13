// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `ShoppingListCard`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const openHubModule = vi.fn();
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModule: (...a: unknown[]) => openHubModule(...a),
}));

import { ShoppingListCard } from "./ShoppingListCard";

const listWithItems = {
  categories: [
    {
      name: "Молочні продукти",
      items: [
        { id: "i1", name: "Молоко", checked: false },
        { id: "i2", name: "Сир", checked: true },
      ],
    },
  ],
} as never;

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    recipes: [],
    weekPlan: null,
    pantryItems: [],
    shoppingList: { categories: [] } as never,
    shoppingBusy: false,
    onGenerate: vi.fn(),
    onToggleItem: vi.fn(),
    onClearChecked: vi.fn(),
    onClearAll: vi.fn(),
    onAddCheckedToPantry: vi.fn(),
    checkedItems: [],
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe("ShoppingListCard", () => {
  it("renders the empty state and disabled generate when no source data", () => {
    render(<ShoppingListCard {...baseProps()} />);
    expect(screen.getByText(/Список покупок порожній/)).toBeInTheDocument();
    expect(screen.getByText(/Спершу згенеруй рецепти/)).toBeInTheDocument();
  });

  it("enables generation when recipes exist and calls onGenerate", () => {
    const onGenerate = vi.fn();
    render(
      <ShoppingListCard
        {...baseProps({ recipes: [{ title: "Борщ" }], onGenerate })}
      />,
    );
    fireEvent.click(screen.getByText("Згенерувати список покупок"));
    expect(onGenerate).toHaveBeenCalledWith("recipes");
  });

  it("switches the source to the week plan", () => {
    const onGenerate = vi.fn();
    render(
      <ShoppingListCard
        {...baseProps({
          weekPlan: { days: [{}, {}] },
          onGenerate,
        })}
      />,
    );
    fireEvent.click(screen.getByText("Тижневий план"));
    fireEvent.click(screen.getByText("Згенерувати список покупок"));
    expect(onGenerate).toHaveBeenCalledWith("weekplan");
  });

  it("renders the item list and toggles an item", () => {
    const onToggleItem = vi.fn();
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listWithItems,
          checkedItems: [{ id: "i2", name: "Сир", checked: true }],
          onToggleItem,
        })}
      />,
    );
    expect(screen.getByText("Молочні продукти")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Молоко"));
    expect(onToggleItem).toHaveBeenCalledWith("Молочні продукти", "i1");
  });

  it("exposes clear + add-to-pantry actions when items are checked", () => {
    const onClearAll = vi.fn();
    const onClearChecked = vi.fn();
    const onAddCheckedToPantry = vi.fn();
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listWithItems,
          checkedItems: [{ id: "i2", name: "Сир", checked: true }],
          onClearAll,
          onClearChecked,
          onAddCheckedToPantry,
        })}
      />,
    );
    fireEvent.click(screen.getByText("+ До комори"));
    expect(onAddCheckedToPantry).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Видалити ✓"));
    expect(onClearChecked).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Очистити"));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("navigates to Finyk analytics from the spend link", () => {
    render(<ShoppingListCard {...baseProps()} />);
    fireEvent.click(screen.getByText(/Скільки витратив/));
    expect(openHubModule).toHaveBeenCalledWith("finyk", "/analytics");
  });
});
