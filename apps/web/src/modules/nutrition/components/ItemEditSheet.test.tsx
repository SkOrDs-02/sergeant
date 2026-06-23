// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `ItemEditSheet`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ItemEditSheet, type ItemEditState } from "./ItemEditSheet";

function state(overrides: Partial<ItemEditState> = {}): ItemEditState {
  return {
    open: true,
    idx: 0,
    name: "Молоко",
    qty: "2",
    unit: "л",
    err: "",
    ...overrides,
  };
}

describe("ItemEditSheet", () => {
  it("renders the item name and current qty/unit", () => {
    render(
      <ItemEditSheet
        itemEdit={state()}
        setItemEdit={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Кількість") as HTMLInputElement).value).toBe(
      "2",
    );
    expect((screen.getByLabelText("Одиниця") as HTMLInputElement).value).toBe(
      "л",
    );
  });

  it("saves the parsed qty + normalized unit", () => {
    const onSave = vi.fn();
    render(
      <ItemEditSheet
        itemEdit={state({ qty: "3,5", unit: "л" })}
        setItemEdit={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Зберегти"));
    expect(onSave).toHaveBeenCalledWith(0, 3.5, expect.any(String));
  });

  it("flags an invalid quantity", () => {
    const setItemEdit = vi.fn();
    const onSave = vi.fn();
    render(
      <ItemEditSheet
        itemEdit={state({ qty: "abc" })}
        setItemEdit={setItemEdit}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Зберегти"));
    expect(onSave).not.toHaveBeenCalled();
    expect(setItemEdit).toHaveBeenCalled();
  });

  it("saves null qty when the field is empty", () => {
    const onSave = vi.fn();
    render(
      <ItemEditSheet
        itemEdit={state({ qty: "", unit: "" })}
        setItemEdit={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByText("Зберегти"));
    expect(onSave).toHaveBeenCalledWith(0, null, null);
  });

  it("invokes onClose from cancel", () => {
    const onClose = vi.fn();
    render(
      <ItemEditSheet
        itemEdit={state()}
        setItemEdit={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Скасувати"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders an error message when present", () => {
    render(
      <ItemEditSheet
        itemEdit={state({ err: "Некоректна кількість." })}
        setItemEdit={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Некоректна кількість.")).toBeInTheDocument();
  });
});
