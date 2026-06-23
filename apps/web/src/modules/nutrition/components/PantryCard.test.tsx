// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `PantryCard` (add modes + inventory list).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/foodCategories", () => ({
  groupItemsByCategory: (items: Array<{ name?: string }>) =>
    items.length === 0
      ? []
      : [
          {
            cat: { id: "other", emoji: "🛒", label: "Інше" },
            items: items.map((item, idx) => ({ item, idx })),
          },
        ],
}));

import { PantryCard } from "./PantryCard";

const Card = PantryCard as unknown as (
  p: Record<string, unknown>,
) => ReactElement;

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    busy: false,
    parsePantry: vi.fn(),
    newItemName: "",
    setNewItemName: vi.fn(),
    upsertItem: vi.fn(),
    pantryText: "",
    setPantryText: vi.fn(),
    effectiveItems: [],
    editItemAt: vi.fn(),
    removeItemAtOrByName: vi.fn(),
    pantryItemsLength: 0,
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe("PantryCard add modes", () => {
  it("adds a single item on button click", () => {
    const upsertItem = vi.fn();
    const setNewItemName = vi.fn();
    render(
      <Card
        {...baseProps({
          newItemName: "Лосось 300г",
          upsertItem,
          setNewItemName,
        })}
      />,
    );
    fireEvent.click(screen.getByText("Додати"));
    expect(upsertItem).toHaveBeenCalledWith("Лосось 300г");
    expect(setNewItemName).toHaveBeenCalledWith("");
  });

  it("adds a single item on Enter", () => {
    const upsertItem = vi.fn();
    render(<Card {...baseProps({ newItemName: "Рис", upsertItem })} />);
    fireEvent.keyDown(screen.getByPlaceholderText(/лосось/), {
      key: "Enter",
    });
    expect(upsertItem).toHaveBeenCalledWith("Рис");
  });

  it("switches to list mode and parses pantry text", () => {
    const parsePantry = vi.fn();
    render(
      <Card
        {...baseProps({
          pantryText: "2 яйця, курка 500г",
          parsePantry,
        })}
      />,
    );
    fireEvent.click(screen.getByText("Список"));
    fireEvent.click(screen.getByText("Розібрати"));
    expect(parsePantry).toHaveBeenCalled();
  });

  it("renders the barcode scan affordance when handler provided", () => {
    const onScanBarcode = vi.fn();
    render(<Card {...baseProps({ onScanBarcode })} />);
    fireEvent.click(screen.getByLabelText("Сканувати штрих-код"));
    expect(onScanBarcode).toHaveBeenCalled();
  });
});

describe("PantryCard inventory", () => {
  it("renders nothing for an empty inventory", () => {
    render(<Card {...baseProps()} />);
    expect(screen.queryByText("Мій склад")).not.toBeInTheDocument();
  });

  it("renders inventory items and routes edit/remove", () => {
    const editItemAt = vi.fn();
    const removeItemAtOrByName = vi.fn();
    render(
      <Card
        {...baseProps({
          effectiveItems: [{ name: "Молоко", qty: 1, unit: "л" }],
          pantryItemsLength: 1,
          editItemAt,
          removeItemAtOrByName,
        })}
      />,
    );
    expect(screen.getByText("Мій склад")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Редагувати Молоко"));
    expect(editItemAt).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByLabelText("Прибрати Молоко"));
    expect(removeItemAtOrByName).toHaveBeenCalledWith(0, "Молоко");
  });
});
