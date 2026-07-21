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

  it("routes single-item input changes through setNewItemName", () => {
    const setNewItemName = vi.fn();
    render(<Card {...baseProps({ setNewItemName })} />);
    fireEvent.change(screen.getByPlaceholderText(/лосось/), {
      target: { value: "Авокадо" },
    });
    expect(setNewItemName).toHaveBeenCalledWith("Авокадо");
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

  it("routes list-mode text edits through setPantryText", () => {
    const setPantryText = vi.fn();
    render(<Card {...baseProps({ setPantryText })} />);
    fireEvent.click(screen.getByText("Список"));
    fireEvent.change(screen.getByPlaceholderText(/2 яйця/), {
      target: { value: "банани, молоко" },
    });
    expect(setPantryText).toHaveBeenCalledWith("банани, молоко");
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
    expect(screen.queryByText("Моя комора")).not.toBeInTheDocument();
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
    expect(screen.getByText("Моя комора")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Редагувати Молоко"));
    expect(editItemAt).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByLabelText("Прибрати Молоко"));
    expect(removeItemAtOrByName).toHaveBeenCalledWith(0, "Молоко");
  });

  it("collapses the inventory card when the heading is toggled", () => {
    render(
      <Card
        {...baseProps({
          effectiveItems: [{ name: "Молоко", qty: 1, unit: "л" }],
          pantryItemsLength: 1,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Моя комора/ }));
    expect(
      screen.queryByLabelText("Редагувати Молоко"),
    ).not.toBeInTheDocument();
  });

  it("opens a large inventory category before routing item actions", () => {
    const editItemAt = vi.fn();
    const effectiveItems = Array.from({ length: 13 }, (_, idx) => ({
      name: `Продукт ${idx + 1}`,
      unit: idx === 0 ? "шт" : undefined,
    }));

    render(
      <Card
        {...baseProps({
          effectiveItems,
          pantryItemsLength: effectiveItems.length,
          editItemAt,
        })}
      />,
    );
    expect(
      screen.queryByLabelText("Редагувати Продукт 1"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Інше/ }));
    fireEvent.click(screen.getByLabelText("Редагувати Продукт 1"));
    expect(editItemAt).toHaveBeenCalledWith(0);
  });

  it("renders fallback labels for unnamed inventory items", () => {
    const removeItemAtOrByName = vi.fn();
    render(
      <Card
        {...baseProps({
          effectiveItems: [{ qty: 3 }],
          pantryItemsLength: 1,
          removeItemAtOrByName,
        })}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Прибрати продукт"));
    expect(removeItemAtOrByName).toHaveBeenCalledWith(0, undefined);
  });
});
