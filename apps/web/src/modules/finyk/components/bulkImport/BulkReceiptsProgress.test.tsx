// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceiptDraft } from "@sergeant/api-client";
import { BulkReceiptsProgress } from "./BulkReceiptsProgress";
import type { BatchReceiptItem } from "../../hooks/useBulkReceiptsImport";

function draft(): ReceiptDraft {
  return {
    source: "vision",
    fiscalNum: null,
    store: "Сільпо",
    storeTaxId: null,
    purchasedAt: "2026-08-17T10:00:00.000Z",
    totalKopiykas: 15075,
    items: [],
    confidence: 0.9,
    rawPayload: {},
  };
}

function item(overrides: Partial<BatchReceiptItem> = {}): BatchReceiptItem {
  return {
    id: "1-a.jpg-10",
    fileName: "a.jpg",
    status: "drafted",
    draft: draft(),
    category: "other",
    included: true,
    error: null,
    ...overrides,
  };
}

describe("BulkReceiptsProgress", () => {
  it("shows the store name and total for a drafted item", () => {
    render(
      <BulkReceiptsProgress
        items={[item()]}
        isProcessing={false}
        isSaving={false}
        onSetCategory={vi.fn()}
        onToggleIncluded={vi.fn()}
        onSaveAll={vi.fn()}
      />,
    );
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
  });

  it("shows the file name and error text for a fetch-error item", () => {
    render(
      <BulkReceiptsProgress
        items={[
          item({
            status: "fetch-error",
            draft: null,
            included: false,
            error: "Не вдалось розпізнати чек.",
          }),
        ]}
        isProcessing={false}
        isSaving={false}
        onSetCategory={vi.fn()}
        onToggleIncluded={vi.fn()}
        onSaveAll={vi.fn()}
      />,
    );
    expect(screen.getByText("a.jpg")).toBeInTheDocument();
    expect(screen.getByText("Не вдалось розпізнати чек.")).toBeInTheDocument();
  });

  it("save button shows the count of ready (drafted + included) items", () => {
    render(
      <BulkReceiptsProgress
        items={[item({ id: "1" }), item({ id: "2", included: false })]}
        isProcessing={false}
        isSaving={false}
        onSetCategory={vi.fn()}
        onToggleIncluded={vi.fn()}
        onSaveAll={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Зберегти вибрані (1)" }),
    ).toBeInTheDocument();
  });

  it("toggling a checkbox calls onToggleIncluded with the item id", () => {
    const onToggleIncluded = vi.fn();
    render(
      <BulkReceiptsProgress
        items={[item()]}
        isProcessing={false}
        isSaving={false}
        onSetCategory={vi.fn()}
        onToggleIncluded={onToggleIncluded}
        onSaveAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Виключити чек"));
    expect(onToggleIncluded).toHaveBeenCalledWith(item().id);
  });

  it("shows a final tally once every item has settled", () => {
    render(
      <BulkReceiptsProgress
        items={[
          item({ status: "saved" }),
          item({ id: "2", status: "save-error", draft: null }),
        ]}
        isProcessing={false}
        isSaving={false}
        onSetCategory={vi.fn()}
        onToggleIncluded={vi.fn()}
        onSaveAll={vi.fn()}
      />,
    );
    expect(screen.getByText("Збережено 1 з 2.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Зберегти вибрані/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a busy label while processing (drafting) is still in flight", () => {
    render(
      <BulkReceiptsProgress
        items={[item({ status: "fetching", draft: null })]}
        isProcessing
        isSaving={false}
        onSetCategory={vi.fn()}
        onToggleIncluded={vi.fn()}
        onSaveAll={vi.fn()}
      />,
    );
    expect(screen.getByText("Розпізнаю чеки…")).toBeInTheDocument();
  });
});
