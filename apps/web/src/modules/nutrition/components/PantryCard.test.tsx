// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `PantryCard` (add modes + inventory list).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
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

// `PantrySourceTabs` pulls `useSilpoSyncState` (React Query) — out of scope
// for PantryCard's own tests (no QueryClientProvider here); its own
// coverage lives in PantrySourceTabs.test.tsx. Stub keeps the mode-switch
// and scan-affordance wiring this file already covers.
vi.mock("./PantrySourceTabs", () => ({
  PantrySourceTabs: ({
    onModeChange,
    onScanBarcode,
  }: {
    onModeChange: (mode: "single" | "list") => void;
    onScanBarcode?: () => void;
  }) => (
    <div data-testid="pantry-source-tabs">
      <button type="button" onClick={() => onModeChange("single")}>
        По одному
      </button>
      <button type="button" onClick={() => onModeChange("list")}>
        Списком
      </button>
      {typeof onScanBarcode === "function" && (
        <button
          type="button"
          aria-label="Сканувати штрих-код"
          onClick={onScanBarcode}
        >
          Скан
        </button>
      )}
    </div>
  ),
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
    fireEvent.click(screen.getByText("Списком"));
    fireEvent.click(screen.getByText("Розібрати"));
    expect(parsePantry).toHaveBeenCalled();
  });

  it("routes list-mode text edits through setPantryText", () => {
    const setPantryText = vi.fn();
    render(<Card {...baseProps({ setPantryText })} />);
    fireEvent.click(screen.getByText("Списком"));
    fireEvent.change(screen.getByPlaceholderText(/2 яйця/), {
      target: { value: "банани, молоко" },
    });
    expect(setPantryText).toHaveBeenCalledWith("банани, молоко");
  });

  it("дає полю режиму «Списком» доступну назву, а не лише плейсхолдер", () => {
    // Регресія WF-15 (аудит 2026-09-16): сирий `<textarea>` без мітки —
    // плейсхолдер зникає з першим символом, тож поле лишалось безіменним.
    // Сусідній `Input` режиму «По одному» мітку вже мав.
    render(<Card {...baseProps()} />);
    fireEvent.click(screen.getByText("Списком"));
    const field = screen.getByLabelText("Список продуктів");
    expect(field.tagName).toBe("TEXTAREA");
  });

  it("renders the barcode scan affordance when handler provided", () => {
    const onScanBarcode = vi.fn();
    render(<Card {...baseProps({ onScanBarcode })} />);
    fireEvent.click(screen.getByLabelText("Сканувати штрих-код"));
    expect(onScanBarcode).toHaveBeenCalled();
  });
});

describe("PantryCard inventory", () => {
  it("renders an empty state instead of hiding the inventory card", () => {
    render(<Card {...baseProps()} />);
    expect(screen.queryByText("Моя комора")).not.toBeInTheDocument();
    expect(screen.getByText("Тут поки порожньо")).toBeInTheDocument();
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

  // Звіт власника 2026-08-31: дві банки Red Bull 0,25 л із чека показувались
  // у розкладі позиції як одна «500 мл» — пляшка, якої він не купував.
  // `qty` варіанта лишається добутком (інваріант суми), тож розмір фасування
  // деривується з `packCount`.
  it("shows a multi-pack purchase as «2 × 250 мл», not a phantom 500 ml bottle", () => {
    const sources = [
      {
        name: "Напій енергетичний Red Bull",
        qty: 250,
        unit: "мл",
        addedAt: "2026-08-30",
        packCount: null,
      },
      {
        name: "Напій енергетичний Red Bull",
        qty: 500,
        unit: "мл",
        addedAt: "2026-08-31",
        packCount: 2,
      },
    ];
    render(
      <Card
        {...baseProps({
          effectiveItems: [
            {
              name: "Напій енергетичний Red Bull",
              qty: 750,
              unit: "мл",
              sources,
            },
          ],
          pantryItemsLength: 1,
        })}
      />,
    );
    // Категорія з однією позицією розкрита за замовчуванням; клікаємо лише
    // якщо вона згорнута, інакше клік її ЗАКРИВ би.
    if (!screen.queryByRole("button", { name: "Показати покупки" })) {
      fireEvent.click(screen.getByRole("button", { name: /Інше/ }));
    }
    // Розкриваємо розклад варіантів позиції.
    fireEvent.click(screen.getByRole("button", { name: "Показати покупки" }));
    expect(screen.getByText("2 × 250 мл")).toBeInTheDocument();
    // Одинична покупка лишається просто «250 мл» — «1 ×» було б шумом.
    expect(screen.getByText("250 мл")).toBeInTheDocument();
    expect(screen.queryByText("500 мл")).not.toBeInTheDocument();
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

describe("PantryCard: список першим, додавання в аркуші", () => {
  const filled = () =>
    baseProps({
      effectiveItems: [{ name: "Молоко", qty: 1, unit: "л" }],
      pantryItemsLength: 1,
    });

  it("наповнена комора не показує форму інлайн, а «Додати» відкриває аркуш із фокусом у полі", () => {
    render(<Card {...filled()} />);
    expect(screen.queryByPlaceholderText(/лосось/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Додати продукти" }));

    const dialog = screen.getByRole("dialog", { name: "Додати продукти" });
    const field = screen.getByPlaceholderText(/лосось/);
    expect(dialog).toContainElement(field);
    expect(field).toHaveFocus();
    // Список стоїть у DOM раніше за форму. Роль тут не годиться: відкритий
    // аркуш робить фон інертним, і кнопка списку ховається від `getByRole`.
    const list = screen.getByText("Моя комора");
    expect(
      list.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("аркуш лишається відкритим після додавання, щоб ввести наступний продукт", () => {
    const upsertItem = vi.fn();
    render(<Card {...filled()} newItemName="Рис" upsertItem={upsertItem} />);
    fireEvent.click(screen.getByRole("button", { name: "Додати продукти" }));
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(upsertItem).toHaveBeenCalledWith("Рис");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("порожня комора показує форму інлайн і не має кнопки аркуша", () => {
    render(<Card {...baseProps()} />);
    expect(screen.getByPlaceholderText(/лосось/)).not.toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Додати продукти" }),
    ).not.toBeInTheDocument();
  });

  it("неоднозначна позиція повертає форму інлайн, поки аркуш закритий", () => {
    render(
      <Card
        {...filled()}
        ambiguousPantryItems={[{ name: "яйця", qty: 10, unit: null }]}
        resolveAmbiguousPantryItem={vi.fn()}
        dismissAmbiguousPantryItem={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText(/лосось/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("PantryCard: режим «Списком» на порожній коморі (ux-12)", () => {
  // Повторює контракт `useNutritionPantries`: коли збережених позицій немає,
  // `effectiveItems` - це живий парс чернетки textarea.
  function EmptyPantryWithDraft() {
    const [pantryText, setPantryText] = useState("");
    const effectiveItems = pantryText
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    return (
      <Card
        {...baseProps({
          pantryText,
          setPantryText,
          effectiveItems,
          pantryItemsLength: 0,
        })}
      />
    );
  }

  it("перша літера не розмонтовує форму, не губить фокус і не створює фантомну позицію", () => {
    render(<EmptyPantryWithDraft />);
    fireEvent.click(screen.getByText("Списком"));
    const field = screen.getByLabelText("Список продуктів");
    field.focus();
    expect(field).toHaveFocus();

    fireEvent.change(field, { target: { value: "я" } });

    const after = screen.getByLabelText("Список продуктів");
    expect(after).toBe(field);
    expect(after).toBeInTheDocument();
    expect(after).toHaveFocus();
    expect(after).toHaveValue("я");
    expect(screen.getByText("Розібрати")).toBeInTheDocument();
    // Фантомної позиції «я» у списку немає: лишається порожній стан комори.
    expect(screen.queryByLabelText("Редагувати я")).not.toBeInTheDocument();
    expect(screen.queryByText("Моя комора")).not.toBeInTheDocument();
    expect(screen.getByText("Тут поки порожньо")).toBeInTheDocument();
  });

  it("далі набір триває: наступні символи теж лягають у те саме поле", () => {
    render(<EmptyPantryWithDraft />);
    fireEvent.click(screen.getByText("Списком"));
    const field = screen.getByLabelText("Список продуктів");
    fireEvent.change(field, { target: { value: "я" } });
    fireEvent.change(field, { target: { value: "яйця, молоко" } });
    expect(screen.getByLabelText("Список продуктів")).toHaveValue(
      "яйця, молоко",
    );
    expect(screen.queryByLabelText("Редагувати яйця")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Редагувати молоко"),
    ).not.toBeInTheDocument();
  });

  it("не відкриває аркуш, поки в коморі немає збережених позицій", () => {
    render(
      <Card
        {...baseProps({
          pantryText: "я",
          effectiveItems: [{ name: "я" }],
          pantryItemsLength: 0,
        })}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Додати продукти" }),
    ).not.toBeInTheDocument();
  });
});
