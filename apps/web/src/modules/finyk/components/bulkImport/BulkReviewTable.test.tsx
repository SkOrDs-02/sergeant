// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import { BulkReviewTable } from "./BulkReviewTable";
import type { BulkReviewRow } from "./bulkImportRows";

function rows(): BulkReviewRow[] {
  return [
    {
      id: "r1",
      date: "2026-08-01",
      description: "Сільпо",
      amountKopiykas: 15000,
      direction: "expense",
      category: "other",
      confidence: 0.9,
      transferLikely: false,
      selected: true,
    },
    {
      id: "r2",
      date: "2026-08-02",
      description: "Зарплата",
      amountKopiykas: 500000,
      direction: "income",
      category: "salary",
      confidence: 0.4,
      transferLikely: false,
      selected: false,
    },
  ];
}

const CUSTOM_CATEGORIES: CustomCategoryInput[] = [
  { id: "custom-hobby", label: "Хобі" },
];

describe("BulkReviewTable", () => {
  it("shows the selected-count summary and direction badges", () => {
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
      />,
    );
    expect(screen.getByText("Обрано 1 з 2")).toBeInTheDocument();
    expect(screen.getByText("витрата")).toBeInTheDocument();
    expect(screen.getByText("дохід")).toBeInTheDocument();
  });

  it("shows a low-confidence badge only under the threshold", () => {
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
      />,
    );
    // Only the income row (confidence 0.4 < 0.7) gets the warning badge.
    expect(screen.getAllByText("перевір суму")).toHaveLength(1);
  });

  it("shows the transfer badge only on transferLikely rows", () => {
    const withTransfer = rows().map((r) =>
      r.id === "r1"
        ? { ...r, description: "Поповнення «просто»", transferLikely: true }
        : r,
    );
    render(
      <BulkReviewTable
        rows={withTransfer}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
      />,
    );
    expect(screen.getAllByText("схоже на переказ")).toHaveLength(1);
    // Пояснення механіки «підтвердити/спростувати» — видиме лише коли
    // такі рядки взагалі є (бета-фідбек 2026-08-18).
    expect(
      screen.getByText(/за замовчуванням не імпортуються/),
    ).toBeInTheDocument();
  });

  it("не показує transfer-підказку, коли transferLikely-рядків немає", () => {
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/за замовчуванням не імпортуються/),
    ).not.toBeInTheDocument();
  });

  it("calls onToggleRow with the row id when its checkbox is tapped", () => {
    const onToggleRow = vi.fn();
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={onToggleRow}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByLabelText(/вибір рядка|Вибрати рядок/)[0]!);
    expect(onToggleRow).toHaveBeenCalledWith("r1");
  });

  it("editing the description field calls onEditRow with the new value", () => {
    const onEditRow = vi.fn();
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={onEditRow}
      />,
    );
    const descriptionInput = screen.getAllByLabelText("Опис")[0]!;
    fireEvent.change(descriptionInput, {
      target: { value: "Сільпо (виправлено)" },
    });
    expect(onEditRow).toHaveBeenCalledWith("r1", {
      description: "Сільпо (виправлено)",
    });
  });

  it("bulk category apply calls onBulkCategory with the chosen category", () => {
    const onBulkCategory = vi.fn();
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={onBulkCategory}
        onEditRow={vi.fn()}
      />,
    );
    // "food" — an active (non-legacy) picker slug; "groceries" is a
    // legacy resolve-only alias no longer offered by `CATEGORY_SLUGS`
    // (`MANUAL_EXPENSE_PICKER` excludes `legacy: true` entries).
    fireEvent.change(screen.getByLabelText("Категорія для вибраних витрат"), {
      target: { value: "food" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Застосувати" }));
    expect(onBulkCategory).toHaveBeenCalledWith("food");
  });

  it("disables the bulk-category action when only income rows are selected", () => {
    const incomeOnlySelected = rows().map((r) => ({
      ...r,
      selected: r.direction === "income",
    }));
    render(
      <BulkReviewTable
        rows={incomeOnlySelected}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText("Категорія для вибраних витрат"),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Застосувати" })).toBeDisabled();
  });

  it("enables the bulk-category action once at least one expense row is selected", () => {
    render(
      <BulkReviewTable
        rows={rows()} // r1 (expense) selected, r2 (income) not
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText("Категорія для вибраних витрат"),
    ).not.toBeDisabled();
  });

  it("merges customCategories into the per-row expense category picker", () => {
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
        customCategories={CUSTOM_CATEGORIES}
      />,
    );
    // r1 is an expense row — its per-row picker gets the custom option.
    const expenseRowPicker = screen.getAllByLabelText("Категорія")[0]!;
    expect(
      Array.from(expenseRowPicker.querySelectorAll("option")).map(
        (o) => o.textContent,
      ),
    ).toContain("Хобі");
  });

  it("does NOT offer a custom (expense-only) category on the income row's per-row picker", () => {
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
        customCategories={CUSTOM_CATEGORIES}
      />,
    );
    const incomeRowPicker = screen.getAllByLabelText("Категорія")[1]!;
    expect(
      Array.from(incomeRowPicker.querySelectorAll("option")).map(
        (o) => o.textContent,
      ),
    ).not.toContain("Хобі");
  });

  it("merges customCategories into the bulk-category picker", () => {
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
        customCategories={CUSTOM_CATEGORIES}
      />,
    );
    const bulkPicker = screen.getByLabelText("Категорія для вибраних витрат");
    expect(
      Array.from(bulkPicker.querySelectorAll("option")).map(
        (o) => o.textContent,
      ),
    ).toContain("Хобі");
  });

  it("toggling select-all calls onToggleAll with the opposite of the current all-selected state", () => {
    const onToggleAll = vi.fn();
    render(
      <BulkReviewTable
        rows={rows()}
        onToggleRow={vi.fn()}
        onToggleAll={onToggleAll}
        onBulkCategory={vi.fn()}
        onEditRow={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Обрано 1 з 2/));
    expect(onToggleAll).toHaveBeenCalledWith(true); // not all selected yet → select all
  });
});
