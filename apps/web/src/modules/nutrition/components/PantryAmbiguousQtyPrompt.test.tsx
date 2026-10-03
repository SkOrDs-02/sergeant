// @vitest-environment jsdom
/**
 * Last validated: 2026-09-01
 * Status: Active
 * UX-4 (аудит 2026-09-01) — «шт чи г?» тапом, не модалкою.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PantryAmbiguousQtyPrompt } from "./PantryAmbiguousQtyPrompt";
import type { PantryItem } from "../lib/pantryTextParser";

const NUTELLA: PantryItem = {
  name: "Нутелла",
  qty: 350,
  unit: "шт",
  notes: null,
  ambiguousQty: true,
};

describe("PantryAmbiguousQtyPrompt", () => {
  it("renders nothing when there is nothing to resolve", () => {
    const { container } = render(
      <PantryAmbiguousQtyPrompt
        items={[]}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the item name, qty and an uncertainty badge", () => {
    render(
      <PantryAmbiguousQtyPrompt
        items={[NUTELLA]}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("Нутелла")).toBeInTheDocument();
    expect(screen.getByText("Уточни")).toBeInTheDocument();
    expect(screen.getByText("350 шт")).toBeInTheDocument();
    expect(screen.getByText("350 г")).toBeInTheDocument();
  });

  it("tapping «шт» resolves that row to шт with one click", () => {
    const onResolve = vi.fn();
    render(
      <PantryAmbiguousQtyPrompt
        items={[NUTELLA]}
        onResolve={onResolve}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByText("350 шт"));
    expect(onResolve).toHaveBeenCalledWith(0, "шт");
  });

  it("tapping «г» resolves that row to г with one click", () => {
    const onResolve = vi.fn();
    render(
      <PantryAmbiguousQtyPrompt
        items={[NUTELLA]}
        onResolve={onResolve}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByText("350 г"));
    expect(onResolve).toHaveBeenCalledWith(0, "г");
  });

  it("cancel drops the row without resolving a unit", () => {
    const onDismiss = vi.fn();
    const onResolve = vi.fn();
    render(
      <PantryAmbiguousQtyPrompt
        items={[NUTELLA]}
        onResolve={onResolve}
        onDismiss={onDismiss}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByText("Не додавати"));
    expect(onDismiss).toHaveBeenCalledWith(0);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("renders one row per ambiguous item and addresses each by its own index", () => {
    const onResolve = vi.fn();
    render(
      <PantryAmbiguousQtyPrompt
        items={[
          NUTELLA,
          {
            name: "Цукор",
            qty: 200,
            unit: "шт",
            notes: null,
            ambiguousQty: true,
          },
        ]}
        onResolve={onResolve}
        onDismiss={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("Цукор")).toBeInTheDocument();
    fireEvent.click(screen.getByText("200 г"));
    expect(onResolve).toHaveBeenCalledWith(1, "г");
  });

  it("disables the actions while busy", () => {
    render(
      <PantryAmbiguousQtyPrompt
        items={[NUTELLA]}
        onResolve={vi.fn()}
        onDismiss={vi.fn()}
        busy={true}
      />,
    );
    expect(screen.getByText("350 шт").closest("button")).toBeDisabled();
    expect(screen.getByText("350 г").closest("button")).toBeDisabled();
  });
});
