/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  // CodeRabbit post-merge review PR #757 (зауваження #4): раніше
  // `consoleErrorSpy.mockRestore()` викликався в кінці тіла ОДНОГО тесту
  // (defect #2 нижче) — якщо `render()` чи `expect` ВИЩЕ по тілу того тесту
  // кинули б виняток, `mockRestore()` не виконався б узагалі, і застаблений
  // `console.error` протік би в НАСТУПНІ тести, глушачи їхні реальні
  // попередження без жодного видимого сліду чому. `afterEach` — безумовний:
  // спрацьовує навіть якщо тест впав, тож spy завжди відновлюється.
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    // Імʼя «Скасувати» тепер належить РІВНО кнопці підвалу — скрим зветься
    // «Закрити» (V-8, 2026-08-08), тож обхід через «останній збіг» більше
    // не потрібен і тільки маскував би повернення дубля.
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
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
    const scrim = screen.getByRole("button", { name: "Закрити" });
    expect(scrim.className).toContain("bg-black/40");
    expect(scrim.className).not.toContain("bg-text/40");
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

    const scrim = screen.getByRole("button", { name: "Закрити" });
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
    // Відновлення spy-а — у спільному `afterEach` вище (безумовно, навіть
    // якщо один із `expect` вище впаде).
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

describe("ConfirmDialog — доступні імена скрима і кнопок", () => {
  // V-8 (аудит Профілю/Налаштувань 2026-08-08). Скрим і кнопка «Скасувати»
  // мали однакове `aria-label`, тож у дереві доступності стояли дві кнопки
  // з одним іменем: скрінрідер їх не розрізняв, а role-запит падав на
  // «Found multiple elements». Пін саме на УНІКАЛЬНІСТЬ імені кнопки
  // скасування, а не на конкретний текст скрима — інакше тест ламався б
  // від будь-якої зміни копії, не ловлячи власне дефект.
  it("кнопка скасування має унікальне імʼя — скрим не дублює його", () => {
    render(
      <ConfirmDialog
        open
        title="Видалити?"
        cancelLabel="Скасувати"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Скасувати" })).toHaveLength(
      1,
    );
  });
});
