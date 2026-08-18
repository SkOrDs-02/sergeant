// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReceiptDraft } from "@sergeant/api-client";
import { ReceiptReviewForm } from "./ReceiptReviewForm";

function baseDraft(): ReceiptDraft {
  return {
    source: "vision",
    fiscalNum: null,
    store: "Сільпо",
    storeTaxId: null,
    purchasedAt: "2026-08-17T10:00:00.000Z",
    totalKopiykas: 15075,
    items: [
      {
        position: 1,
        name: "Хліб",
        qty: 2,
        priceKopiykas: 3000,
        sumKopiykas: 6000,
      },
    ],
    confidence: 0.65,
    rawPayload: {},
  };
}

function Harness({
  initialDraft,
  onDraftChange,
}: {
  initialDraft: ReceiptDraft;
  onDraftChange?: (d: ReceiptDraft) => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [category, setCategory] = useState("other");
  return (
    <ReceiptReviewForm
      draft={draft}
      setDraft={(updater) => {
        setDraft((prev) => {
          const next = typeof updater === "function" ? updater(prev) : updater;
          onDraftChange?.(next);
          return next;
        });
      }}
      category={category}
      setCategory={setCategory}
    />
  );
}

describe("ReceiptReviewForm", () => {
  it("shows the vision confidence badge for a vision-sourced draft", () => {
    render(<Harness initialDraft={baseDraft()} />);
    expect(screen.getByText(/розпізнано з фото/)).toBeInTheDocument();
  });

  it("does not show the confidence badge for a dps-sourced draft", () => {
    render(
      <Harness
        initialDraft={{
          ...baseDraft(),
          source: "dps",
          fiscalNum: "1",
          confidence: null,
        }}
      />,
    );
    expect(screen.queryByText(/розпізнано з фото/)).not.toBeInTheDocument();
  });

  it("editing the store field updates the draft", () => {
    const onDraftChange = vi.fn();
    render(
      <Harness initialDraft={baseDraft()} onDraftChange={onDraftChange} />,
    );
    fireEvent.change(screen.getByLabelText("Магазин"), {
      target: { value: "АТБ" },
    });
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ store: "АТБ" }),
    );
  });

  it("renders every item with its name pre-filled", () => {
    render(<Harness initialDraft={baseDraft()} />);
    expect(screen.getByDisplayValue("Хліб")).toBeInTheDocument();
  });

  it("removing an item drops it from the draft", () => {
    const onDraftChange = vi.fn();
    render(
      <Harness initialDraft={baseDraft()} onDraftChange={onDraftChange} />,
    );
    fireEvent.click(screen.getByLabelText("Видалити позицію 1"));
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ items: [] }),
    );
  });

  it("«Додати позицію» appends a new blank item", () => {
    const onDraftChange = vi.fn();
    render(
      <Harness initialDraft={baseDraft()} onDraftChange={onDraftChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Додати позицію/ }));
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ name: "Хліб" }),
          expect.objectContaining({ name: "", position: 2 }),
        ],
      }),
    );
  });

  it("disables every field when disabled=true", () => {
    const [draft] = [baseDraft()];
    render(
      <ReceiptReviewForm
        draft={draft}
        setDraft={vi.fn()}
        category="other"
        setCategory={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText("Магазин")).toBeDisabled();
    expect(screen.getByLabelText("Категорія")).toBeDisabled();
  });
});
