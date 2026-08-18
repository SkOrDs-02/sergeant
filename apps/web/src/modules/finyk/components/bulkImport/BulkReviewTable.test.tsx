// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      selected: false,
    },
  ];
}

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
    fireEvent.change(screen.getByLabelText("Категорія для вибраних"), {
      target: { value: "food" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Застосувати" }));
    expect(onBulkCategory).toHaveBeenCalledWith("food");
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
