// @vitest-environment jsdom
/**
 * Branch-focused coverage for TransactionsBatchToolbar — visibility gates,
 * empty-selection prompt, batch actions, and category-picker sheet.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionsBatchToolbar } from "./TransactionsBatchToolbar";

function buildProps(
  overrides: Partial<Parameters<typeof TransactionsBatchToolbar>[0]> = {},
) {
  return {
    selectMode: false,
    selectedSize: 0,
    onOpenCatPicker: vi.fn(),
    onApplyHide: vi.fn(),
    onApplyExclude: vi.fn(),
    batchCatPicker: false,
    onCloseCatPicker: vi.fn(),
    onApplyCategory: vi.fn(),
    customCategories: [],
    ...overrides,
  };
}

describe("TransactionsBatchToolbar (branches)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render the floating toolbar when selectMode=false", () => {
    render(<TransactionsBatchToolbar {...buildProps({ selectMode: false })} />);
    expect(screen.queryByText("Оберіть транзакції")).toBeNull();
    expect(screen.queryByText(/обрано/)).toBeNull();
  });

  it("shows the empty-selection prompt when selectMode=true and selectedSize=0", () => {
    render(
      <TransactionsBatchToolbar
        {...buildProps({ selectMode: true, selectedSize: 0 })}
      />,
    );
    expect(screen.getByText("Оберіть транзакції")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Категорія" })).toBeNull();
  });

  it("shows batch action buttons when at least one row is selected", () => {
    const props = buildProps({ selectMode: true, selectedSize: 2 });
    render(<TransactionsBatchToolbar {...props} />);
    expect(screen.getByText("2 обрано")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Категорія" }));
    fireEvent.click(screen.getByRole("button", { name: "Приховати" }));
    fireEvent.click(screen.getByRole("button", { name: "Зі статистики" }));
    expect(props.onOpenCatPicker).toHaveBeenCalledTimes(1);
    expect(props.onApplyHide).toHaveBeenCalledTimes(1);
    expect(props.onApplyExclude).toHaveBeenCalledTimes(1);
  });

  it("uses singular copy in the category sheet when selectedSize=1", () => {
    render(
      <TransactionsBatchToolbar
        {...buildProps({
          selectMode: true,
          selectedSize: 1,
          batchCatPicker: true,
        })}
      />,
    );
    expect(
      screen.getByText("Застосується до 1 транзакції"),
    ).toBeInTheDocument();
  });

  it("uses plural copy in the category sheet when selectedSize>1", () => {
    render(
      <TransactionsBatchToolbar
        {...buildProps({
          selectMode: true,
          selectedSize: 3,
          batchCatPicker: true,
        })}
      />,
    );
    expect(
      screen.getByText("Застосується до 3 транзакцій"),
    ).toBeInTheDocument();
  });

  it("applies a picked category from the sheet", () => {
    const onApplyCategory = vi.fn();
    render(
      <TransactionsBatchToolbar
        {...buildProps({
          selectMode: true,
          selectedSize: 1,
          batchCatPicker: true,
          onApplyCategory,
          customCategories: [
            { id: "food", label: "Їжа", emoji: "🍎" },
          ] as never,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Їжа/ }));
    expect(onApplyCategory).toHaveBeenCalledWith("food");
  });

  it("filters out the income category from the picker list", () => {
    render(
      <TransactionsBatchToolbar
        {...buildProps({
          selectMode: true,
          selectedSize: 1,
          batchCatPicker: true,
          customCategories: [
            { id: "income", label: "Дохід", emoji: "💰" },
            { id: "food", label: "Їжа", emoji: "🍎" },
          ] as never,
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: /Дохід/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Їжа/ })).toBeInTheDocument();
  });
});
