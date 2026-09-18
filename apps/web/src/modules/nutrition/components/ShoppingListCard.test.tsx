// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `ShoppingListCard`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openHubModule = vi.fn();
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModule: (...a: unknown[]) => openHubModule(...a),
}));

// `SilpoCartEntry` (embedded in the header row) gates on
// `useSilpoSyncState` — mocked at the `@finyk/hooks` boundary here so these
// unrelated ShoppingListCard tests don't need a real QueryClientProvider.
// Default "disconnected" makes `SilpoCartEntry` a no-op render (returns
// `null` before it ever mounts `SilpoCartSheet`, which is the component
// that actually touches React Query) — end-to-end "У кошик Сільпо" flow is
// covered by `SilpoCartEntry.test.tsx`.
const syncStateMock = vi.fn(() => ({ status: "disconnected" }));
vi.mock("@finyk/hooks/useSilpoSyncState", () => ({
  useSilpoSyncState: () => syncStateMock(),
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

const listForPantryMath = {
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
    onAddItem: vi.fn(),
    checkedItems: [],
    ...overrides,
  };
}

beforeEach(() => {
  syncStateMock.mockReturnValue({ status: "disconnected" });
  localStorage.clear();
});
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
    fireEvent.click(screen.getByText("Видалити позначені"));
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

describe("ShoppingListCard — manual add", () => {
  it("is disabled with an empty input and does not call onAddItem", () => {
    const onAddItem = vi.fn();
    render(<ShoppingListCard {...baseProps({ onAddItem })} />);
    const addButton = screen.getByText("Додати");
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton);
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("calls onAddItem with the trimmed name and clears the input", () => {
    const onAddItem = vi.fn();
    render(<ShoppingListCard {...baseProps({ onAddItem })} />);
    const input = screen.getByPlaceholderText("напр. хліб");
    fireEvent.change(input, { target: { value: "  Хліб  " } });
    fireEvent.click(screen.getByText("Додати"));
    expect(onAddItem).toHaveBeenCalledWith({ name: "  Хліб  " });
    expect(input).toHaveValue("");
  });

  it("adds a manual item on Enter", () => {
    const onAddItem = vi.fn();
    render(<ShoppingListCard {...baseProps({ onAddItem })} />);
    const input = screen.getByPlaceholderText("напр. хліб");
    fireEvent.change(input, { target: { value: "Молоко" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddItem).toHaveBeenCalledWith({ name: "Молоко" });
  });

  it("does not call onAddItem for a whitespace-only value", () => {
    const onAddItem = vi.fn();
    render(<ShoppingListCard {...baseProps({ onAddItem })} />);
    const input = screen.getByPlaceholderText("напр. хліб");
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByText("Додати")).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddItem).not.toHaveBeenCalled();
  });
});

describe("ShoppingListCard — pantry math (рівень 1)", () => {
  it("reduces a partially-covered item's quantity and shows the calcNote", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listForPantryMath,
          pantryItems: [{ name: "молоко", qty: 400, unit: "г", notes: null }],
        })}
      />,
    );
    expect(screen.getByText("300 г")).toBeInTheDocument();
    expect(screen.getByText("700 г − 400 г у коморі")).toBeInTheDocument();
  });

  it("moves a fully-covered item into the collapsed «Вже вдома» section", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listForPantryMath,
          pantryItems: [{ name: "молоко", qty: 900, unit: "г", notes: null }],
        })}
      />,
    );
    // Не видно в активному списку — воно в «Вже вдома», згорнутому за замовчуванням.
    expect(screen.queryByText("700 г")).not.toBeInTheDocument();
    const athomeToggle = screen.getByText("Вже вдома");
    fireEvent.click(athomeToggle);
    expect(screen.getByText("700 г")).toBeInTheDocument();
    expect(screen.getAllByText("Молоко").length).toBeGreaterThan(0);
  });

  it("merges a low-stock pantry item not already in the list, with the badge", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: { categories: [] } as never,
          pantryItems: [{ name: "сіль", qty: 50, unit: "г", notes: null }],
        })}
      />,
    );
    expect(screen.getByText("сіль")).toBeInTheDocument();
    expect(screen.getByText("Закінчується")).toBeInTheDocument();
  });

  it("toggle off shows the raw list without pantry adjustments", () => {
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listForPantryMath,
          pantryItems: [{ name: "молоко", qty: 400, unit: "г", notes: null }],
        })}
      />,
    );
    // Тумблер за замовчуванням увімкнено — кількість вже скоригована.
    expect(screen.getByText("300 г")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Враховувати комору/ }));
    // Вимкнено — сирий список, без розрахунку.
    expect(screen.queryByText("300 г")).not.toBeInTheDocument();
    expect(screen.getByText("700 г")).toBeInTheDocument();
    expect(
      screen.queryByText("700 г − 400 г у коморі"),
    ).not.toBeInTheDocument();
  });

  it("озвучує стан «куплено» через aria-pressed, а не лише візуально", () => {
    // Регресія WF-17 (аудит 2026-09-16): коло-індикатор має `aria-hidden`,
    // а `opacity-50`/`line-through` скрінрідер не читає — куплений і
    // некуплений пункт звучали ідентично.
    render(
      <ShoppingListCard
        {...baseProps({
          shoppingList: listWithItems,
          checkedItems: [{ id: "i2", name: "Сир", checked: true }],
        })}
      />,
    );
    const row = screen.getByText("Молоко").closest("button")!;
    expect(row).toHaveAttribute("aria-pressed", "false");
  });
});
