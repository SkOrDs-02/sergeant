// @vitest-environment jsdom
/**
 * Last validated: 2026-08-02
 * Status: Active
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PantryListGuide, PantryParsePreview } from "./PantryParsePanel";
import type { PantryParsePreview as PantryParsePreviewData } from "../hooks/useNutritionPantries";

const PREVIEW: PantryParsePreviewData = {
  source: "ai",
  pantryId: "home",
  items: [
    { name: "курка", qty: 500, unit: "г", notes: null },
    { name: "рис", qty: null, unit: null, notes: null },
  ],
};

describe("PantryParsePreview", () => {
  it("confirms only the items left checked", async () => {
    const onConfirm = vi.fn();
    render(
      <PantryParsePreview
        preview={PREVIEW}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );

    expect(screen.getByRole("button", { name: /Додати 2/ })).toBeTruthy();

    await userEvent.click(screen.getAllByRole("checkbox")[1]!);
    await userEvent.click(screen.getByRole("button", { name: /Додати 1/ }));

    expect(onConfirm).toHaveBeenCalledWith([PREVIEW.items[0]]);
  });

  it("blocks confirmation when everything is unchecked", async () => {
    const onConfirm = vi.fn();
    render(
      <PantryParsePreview
        preview={PREVIEW}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );

    for (const box of screen.getAllByRole("checkbox")) {
      await userEvent.click(box);
    }

    const confirm = screen.getByRole("button", { name: /Додати 0/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it("labels a local-parser result so the user knows AI was skipped", () => {
    render(
      <PantryParsePreview
        preview={{ ...PREVIEW, source: "local" }}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText(/розібрано на пристрої/i)).toBeTruthy();
  });
});

// UX-4 (аудит 2026-09-01): рядок з `ambiguousQty` несе інлайн-вибір
// «шт»/«г» і не блокує підтвердження решти списку.
describe("PantryParsePreview — ambiguousQty (UX-4)", () => {
  const AMBIGUOUS_PREVIEW: PantryParsePreviewData = {
    source: "local",
    pantryId: "home",
    items: [
      { name: "рис", qty: 2, unit: "кг", notes: null },
      {
        name: "Нутелла",
        qty: 350,
        unit: "шт",
        notes: null,
        ambiguousQty: true,
      },
    ],
  };

  it("shows the уточни badge and шт/г chips only on the ambiguous row", () => {
    render(
      <PantryParsePreview
        preview={AMBIGUOUS_PREVIEW}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("Уточни")).toBeInTheDocument();
    expect(screen.getByText("350 шт")).toBeInTheDocument();
    expect(screen.getByText("350 г")).toBeInTheDocument();
  });

  it("confirming without touching the toggle keeps the parser's шт default", async () => {
    const onConfirm = vi.fn();
    render(
      <PantryParsePreview
        preview={AMBIGUOUS_PREVIEW}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Додати 2/ }));
    expect(onConfirm).toHaveBeenCalledWith(AMBIGUOUS_PREVIEW.items);
  });

  it("tapping «г» resolves the row AND does not block confirming the rest", async () => {
    const onConfirm = vi.fn();
    const onResolveAmbiguousUnit = vi.fn();
    render(
      <PantryParsePreview
        preview={AMBIGUOUS_PREVIEW}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
        busy={false}
        onResolveAmbiguousUnit={onResolveAmbiguousUnit}
      />,
    );

    fireEvent.click(screen.getByText("350 г"));
    expect(onResolveAmbiguousUnit).toHaveBeenCalledWith(
      AMBIGUOUS_PREVIEW.items[1],
      "г",
    );

    await userEvent.click(screen.getByRole("button", { name: /Додати 2/ }));
    expect(onConfirm).toHaveBeenCalledWith([
      AMBIGUOUS_PREVIEW.items[0],
      { name: "Нутелла", qty: 350, unit: "г", notes: null },
    ]);
  });

  it("unchecking the ambiguous row still lets the rest of the list through", async () => {
    const onConfirm = vi.fn();
    render(
      <PantryParsePreview
        preview={AMBIGUOUS_PREVIEW}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    await userEvent.click(screen.getAllByRole("checkbox")[1]!);
    await userEvent.click(screen.getByRole("button", { name: /Додати 1/ }));
    expect(onConfirm).toHaveBeenCalledWith([AMBIGUOUS_PREVIEW.items[0]]);
  });
});

describe("PantryListGuide", () => {
  it("stays collapsed until opened", () => {
    const { container } = render(<PantryListGuide />);
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    expect(screen.getByText(/Як писати список/)).toBeTruthy();
  });
});
