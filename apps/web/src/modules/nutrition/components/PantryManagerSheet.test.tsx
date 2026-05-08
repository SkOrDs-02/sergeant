// @vitest-environment jsdom
//
// PR-37 ux-roast 2026-Q3 / §3.2 — у формі редагування назви складу
// destructive «Видалити» поряд із «Зберегти» хибно зчитувалось як
// скасування. Тут перевіряємо новий контракт:
//   • поряд зі «Зберегти» стоїть «Скасувати», що закриває sheet;
//   • видалення активного складу живе в окремій «Небезпечній зоні»
//     і ховається, коли склад залишився єдиний (UX-guard).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Pantry } from "@sergeant/nutrition-domain";

import { PantryManagerSheet, type PantryForm } from "./PantryManagerSheet";

function makeProps(overrides: {
  pantries: Pantry[];
  activePantryId: string;
  onClose?: () => void;
  onBeginDelete?: () => void;
  onSavePantryForm?: (name: string, mode: PantryForm["mode"]) => void;
  pantryForm?: PantryForm;
}) {
  return {
    open: true,
    onClose: overrides.onClose ?? vi.fn(),
    pantries: overrides.pantries,
    activePantryId: overrides.activePantryId,
    setActivePantryId: vi.fn(),
    pantryForm:
      overrides.pantryForm ??
      ({ mode: "rename", name: "Дім", err: "" } as const),
    setPantryForm: vi.fn(),
    onSavePantryForm: overrides.onSavePantryForm ?? vi.fn(),
    onBeginCreate: vi.fn(),
    onBeginRename: vi.fn(),
    onBeginDelete: overrides.onBeginDelete ?? vi.fn(),
  };
}

afterEach(() => {
  cleanup();
});

describe("PantryManagerSheet (PR-37 / §3.2)", () => {
  it("offers Cancel next to Save in the form, not Delete", () => {
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            { id: "home", name: "Дім", items: [], text: "" },
            { id: "work", name: "Робота", items: [], text: "" },
          ],
          activePantryId: "home",
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Зберегти" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Скасувати" })).toBeTruthy();
    // Old destructive label is gone from this row entirely.
    expect(
      screen.queryByRole("button", { name: "Видалити активний" }),
    ).toBeNull();
  });

  it("invokes onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            { id: "home", name: "Дім", items: [], text: "" },
            { id: "work", name: "Робота", items: [], text: "" },
          ],
          activePantryId: "home",
          onClose,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders danger-zone delete button when more than one pantry exists", () => {
    const onBeginDelete = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            { id: "home", name: "Дім", items: [], text: "" },
            { id: "work", name: "Робота", items: [], text: "" },
          ],
          activePantryId: "home",
          onBeginDelete,
        })}
      />,
    );

    const deleteBtn = screen.getByRole("button", {
      name: /Видалити активний склад/,
    });
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);
    expect(onBeginDelete).toHaveBeenCalledTimes(1);
  });

  it("hides danger-zone delete when only one pantry remains", () => {
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
          activePantryId: "home",
        })}
      />,
    );

    expect(screen.queryByText(/Небезпечна зона/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Видалити активний склад/ }),
    ).toBeNull();
  });
});
