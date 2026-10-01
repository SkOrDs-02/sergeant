// @vitest-environment jsdom
/**
 * Last validated: 2026-08-02
 * Status: Active
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("PantryListGuide", () => {
  it("stays collapsed until opened", () => {
    const { container } = render(<PantryListGuide />);
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    expect(screen.getByText(/Як писати список/)).toBeTruthy();
  });
});
