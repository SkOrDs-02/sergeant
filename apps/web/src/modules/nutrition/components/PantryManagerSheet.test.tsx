// @vitest-environment jsdom
//
// PR-37 ux-roast 2026-Q3 / §3.2 — у формі редагування назви складу
// destructive «Видалити» поряд із «Зберегти» хибно зчитувалось як
// скасування. Контракт:
//   • поряд зі «Зберегти/Створити» стоїть «Скасувати»;
//   • видалення активного складу живе в окремому розділі «Інше →
//     Небезпечна зона» і ховається, коли склад залишився єдиний.
//
// UX-roast 2026-05 §3.4 — додаємо `idle`-режим форми. У цьому стані
// інпут «Назва складу» взагалі не показано, доки користувач явно не
// натиснув «+ Новий склад» або не тапнув по назві активного складу. Перевіряємо:
//   • в `idle` форма прихована;
//   • у режимі `create` поряд зі «Створити» стоїть «Скасувати», а не
//     «Видалити»;
//   • небезпечна зона з'являється лише після натиску на роздільник
//     «Інше».
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Dispatch, SetStateAction } from "react";
import type { Pantry } from "@sergeant/nutrition-domain";

import { PantryManagerSheet, type PantryForm } from "./PantryManagerSheet";

function makeProps(overrides: {
  pantries: Pantry[];
  activePantryId: string;
  onClose?: () => void;
  onBeginDelete?: () => void;
  onSavePantryForm?: (
    name: string,
    mode: Exclude<PantryForm["mode"], "idle">,
  ) => void;
  setActivePantryId?: (id: string) => void;
  setPantryForm?: Dispatch<SetStateAction<PantryForm>>;
  pantryForm?: PantryForm;
}) {
  return {
    open: true,
    onClose: overrides.onClose ?? vi.fn(),
    pantries: overrides.pantries,
    activePantryId: overrides.activePantryId,
    setActivePantryId: overrides.setActivePantryId ?? vi.fn(),
    pantryForm:
      overrides.pantryForm ??
      ({ mode: "rename", name: "Дім", err: "" } as const),
    setPantryForm: overrides.setPantryForm ?? vi.fn(),
    onSavePantryForm: overrides.onSavePantryForm ?? vi.fn(),
    onBeginCreate: vi.fn(),
    onBeginRename: vi.fn(),
    onBeginDelete: overrides.onBeginDelete ?? vi.fn(),
  };
}

afterEach(() => {
  cleanup();
});

describe("PantryManagerSheet (PR-37 / §3.2 + 2026-05 §3.4)", () => {
  it("offers Cancel next to Save in rename mode, not Delete", () => {
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

  it("offers Create + Cancel pair in create mode", () => {
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            { id: "home", name: "Дім", items: [], text: "" },
            { id: "work", name: "Робота", items: [], text: "" },
          ],
          activePantryId: "home",
          pantryForm: { mode: "create", name: "", err: "" },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Створити" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Скасувати" })).toBeTruthy();
  });

  it("hides the form entirely in idle mode", () => {
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            { id: "home", name: "Дім", items: [], text: "" },
            { id: "work", name: "Робота", items: [], text: "" },
          ],
          activePantryId: "home",
          pantryForm: { mode: "idle", name: "", err: "" },
        })}
      />,
    );

    // No Save / Create / Cancel buttons until the user picks a mode.
    expect(screen.queryByRole("button", { name: "Зберегти" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Створити" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Скасувати" })).toBeNull();
    // The action triggers (still visible) confirm the sheet is interactive.
    expect(screen.getByRole("button", { name: "+ Нова комора" })).toBeTruthy();
  });

  it("triggers onBeginRename when tapping the active pantry row", () => {
    const onBeginRename = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            { id: "home", name: "Дім", items: [], text: "" },
            { id: "work", name: "Робота", items: [], text: "" },
          ],
          activePantryId: "home",
        })}
        onBeginRename={onBeginRename}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Дім/ }));
    expect(onBeginRename).toHaveBeenCalledTimes(1);
  });

  it("sets another pantry active when tapping an inactive pantry row", () => {
    const setActivePantryId = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            { id: "home", name: "Дім", items: [], text: "" },
            { id: "work", name: "Робота", items: [], text: "" },
          ],
          activePantryId: "home",
          setActivePantryId,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Робота/ }));
    expect(setActivePantryId).toHaveBeenCalledWith("work");
  });

  it("invokes setPantryForm with idle when Cancel is clicked", () => {
    const setPantryForm = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [
            { id: "home", name: "Дім", items: [], text: "" },
            { id: "work", name: "Робота", items: [], text: "" },
          ],
          activePantryId: "home",
        })}
        setPantryForm={setPantryForm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(setPantryForm).toHaveBeenCalledWith({
      mode: "idle",
      name: "",
      err: "",
    });
  });

  it("clears the inline error while editing the pantry name", () => {
    let currentForm: PantryForm = {
      mode: "create",
      name: "Стара",
      err: "Вкажи назву.",
    };
    const setPantryForm = vi.fn((update: SetStateAction<PantryForm>) => {
      currentForm = typeof update === "function" ? update(currentForm) : update;
    });
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
          activePantryId: "home",
          pantryForm: currentForm,
          setPantryForm,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Назва комори"), {
      target: { value: "Нова" },
    });
    expect(currentForm).toEqual({ mode: "create", name: "Нова", err: "" });
  });

  it("validates an empty create name before saving", () => {
    const setPantryForm = vi.fn();
    const onSavePantryForm = vi.fn();
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
          activePantryId: "home",
          pantryForm: { mode: "create", name: "   ", err: "" },
          setPantryForm,
          onSavePantryForm,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Створити" }));
    const update = setPantryForm.mock.calls[0]?.[0] as (
      form: PantryForm,
    ) => PantryForm;
    expect(update({ mode: "create", name: "   ", err: "" })).toEqual({
      mode: "create",
      name: "   ",
      err: "Вкажи назву.",
    });
    expect(onSavePantryForm).not.toHaveBeenCalled();
  });

  it("saves a trimmed pantry name from the button and Enter key", () => {
    const onSavePantryForm = vi.fn();
    const { rerender } = render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
          activePantryId: "home",
          pantryForm: { mode: "create", name: "  Дача  ", err: "" },
          onSavePantryForm,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Створити" }));
    expect(onSavePantryForm).toHaveBeenCalledWith("Дача", "create");

    rerender(
      <PantryManagerSheet
        {...makeProps({
          pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
          activePantryId: "home",
          pantryForm: { mode: "rename", name: "  Робота  ", err: "" },
          onSavePantryForm,
        })}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("Нова назва"), { key: "Enter" });
    expect(onSavePantryForm).toHaveBeenCalledWith("Робота", "rename");
  });

  it("resets a visible form when the sheet closes", () => {
    const setPantryForm = vi.fn();
    const props = makeProps({
      pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
      activePantryId: "home",
      pantryForm: { mode: "rename", name: "Дім", err: "Помилка" },
      setPantryForm,
    });
    const { rerender } = render(<PantryManagerSheet {...props} />);

    rerender(<PantryManagerSheet {...props} open={false} />);

    const update = setPantryForm.mock.calls[0]?.[0] as (
      form: PantryForm,
    ) => PantryForm;
    expect(update({ mode: "rename", name: "Дім", err: "Помилка" })).toEqual({
      mode: "idle",
      name: "",
      err: "",
    });
  });

  it("hides danger-zone behind 'Інше' until expanded", () => {
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

    // Collapsed by default — danger zone copy/button is not rendered yet.
    expect(screen.queryByText(/Небезпечна зона/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Видалити активну комору/ }),
    ).toBeNull();

    // Expand the «Інше» section.
    fireEvent.click(screen.getByRole("button", { name: /Інше/ }));

    const deleteBtn = screen.getByRole("button", {
      name: /Видалити активну комору/,
    });
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn).toHaveClass("touch-target");
    expect(deleteBtn).not.toHaveTextContent("🗑");
    fireEvent.click(deleteBtn);
    expect(onBeginDelete).toHaveBeenCalledTimes(1);
  });

  it("hides 'Інше' / danger-zone affordance when only one pantry remains", () => {
    render(
      <PantryManagerSheet
        {...makeProps({
          pantries: [{ id: "home", name: "Дім", items: [], text: "" }],
          activePantryId: "home",
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /Інше/ })).toBeNull();
    expect(screen.queryByText(/Небезпечна зона/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Видалити активну комору/ }),
    ).toBeNull();
  });
});
