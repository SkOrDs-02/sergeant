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

// 15075 kopiykas renders as "150,75" + a narrow no-break space (codepoint
// 0x202F, `NARROW_NBSP` in `Money`) + the currency symbol. Built via
// `String.fromCharCode` (not a literal special character pasted into the
// source, which `eslint no-irregular-whitespace` rightly flags outside
// string literals) so the exact codepoint is unambiguous. The
// amount/separator/symbol render as sibling DOM nodes inside `Money`, so
// match on full `textContent` via a matcher function rather than a
// single-node `getByText` string (same pattern as
// `TxRow.coverage.test.tsx` / `DebtCard.test.tsx`).
const NARROW_NBSP_CHAR = String.fromCharCode(0x202f);
const EXPECTED_TOTAL_TEXT = `150,75${NARROW_NBSP_CHAR}₴`;

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
    // `Money`'s wrapping `<span>` here has no sibling — its own span and
    // the caption wrapper around it end up with IDENTICAL aggregated
    // `textContent`, so `getByText` (singular) throws "multiple elements
    // found". `getAllByText` sidesteps that ambiguity: the assertion only
    // cares that the formatted total renders somewhere, not which of the
    // two nested wrapper nodes technically "owns" it.
    expect(
      screen.getAllByText((_, el) => el?.textContent === EXPECTED_TOTAL_TEXT)
        .length,
    ).toBeGreaterThan(0);
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
