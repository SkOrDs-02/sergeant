/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("exposes an alertdialog role for assistive tech", () => {
    render(
      <ConfirmDialog
        open
        title="Видалити звичку?"
        description="Відмітки по днях теж зникнуть."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Видалити звичку?",
    });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("describes the dialog with the warning text so screen readers announce it", () => {
    render(
      <ConfirmDialog
        open
        title="Видалити транзакцію?"
        description="Без можливості відновлення."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const dialog = screen.getByRole("alertdialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const desc = document.getElementById(describedBy as string);
    expect(desc).toHaveTextContent("Без можливості відновлення.");
  });

  it("omits aria-describedby when there is no description", () => {
    render(
      <ConfirmDialog
        open
        title="Підтвердити?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole("alertdialog")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("does not render when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Hidden"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("fires onConfirm and onCancel from the action buttons", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Видалити?"
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // The scrim and the footer button share the "Скасувати" name; the
    // footer cancel button is the last match.
    const cancelButtons = screen.getAllByRole("button", { name: "Скасувати" });
    fireEvent.click(cancelButtons[cancelButtons.length - 1] as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("portals to document.body with Sheet/Modal-aligned black scrim", () => {
    render(
      <ConfirmDialog
        open
        title="Portal?"
        cancelLabel="Скасувати"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.ownerDocument.body.contains(dialog)).toBe(true);
    const scrim = screen.getAllByRole("button", { name: "Скасувати" })[0];
    expect(scrim?.className).toContain("bg-black/40");
    expect(scrim?.className).not.toContain("bg-text/40");
  });

  it("keyboard-activating the scrim cancels the dialog", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Cancel?"
        cancelLabel="Скасувати"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    const scrim = screen.getAllByRole("button", { name: "Скасувати" })[0]!;
    fireEvent.keyDown(scrim, { key: "Enter" });
    fireEvent.keyDown(scrim, { key: " " });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  // Дефект #2 (CodeRabbit post-merge review PR #756): опис міг містити
  // блочний контент (наприклад `<ul>`, як у `HubBackupPanel`) — обгортка
  // `<p>` для такого контенту невалідна за HTML-специфікацією й породжує
  // React DOM-nesting warning. Перевіряємо і фактичний тег обгортки, і
  // відсутність попередження в консолі.
  it("wraps a block-level description (e.g. a <ul>) in a <div>, not a <p> (defect #2)", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <ConfirmDialog
        open
        title="Замінити дані з файлу?"
        description={
          <>
            Список:
            <ul className="mt-2">
              <li>Раз</li>
              <li>Два</li>
            </ul>
          </>
        }
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const dialog = screen.getByRole("alertdialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    const desc = document.getElementById(describedBy as string);
    expect(desc?.tagName).toBe("DIV");
    expect(screen.getByRole("list")).toBeInTheDocument();

    const nestingWarning = consoleErrorSpy.mock.calls.some((args) =>
      args.some(
        (arg) =>
          typeof arg === "string" &&
          arg.includes("cannot appear as a descendant of"),
      ),
    );
    expect(nestingWarning).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it("supports non-danger confirmations with the primary button variant", () => {
    render(
      <ConfirmDialog
        open
        danger={false}
        title="Зберегти зміни?"
        confirmLabel="Зберегти"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Зберегти" }).className,
    ).toContain("bg-brand-strong");
  });
});
