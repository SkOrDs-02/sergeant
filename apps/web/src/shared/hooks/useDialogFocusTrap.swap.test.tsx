// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Регресія до фіксу ux-08: коли один діалог закривається, а інший
 * відкривається в ТОМУ САМОМУ коміті (пункт FAB-меню -> аркуш), знімок
 * «хто мав фокус» у layout-ефекті нового діалогу відпрацьовує раніше за
 * passive-cleanup пастки меню, яка повертає фокус на FAB. Сфокусований
 * пункт меню на той момент уже розмонтовано, тож ранній знімок порожній;
 * без пізнього знімка фокус після закриття аркуша падав на `<body>`.
 * Реальні FloatingActionButton і Sheet, мокається лише haptic.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { __resetDialogInertForTests } from "./useDialogFocusTrap";

vi.mock("../lib/adapters/haptic", () => ({ hapticTap: vi.fn() }));

import { FloatingActionButton } from "../components/ui/FloatingActionButton";
import { Sheet } from "../components/ui/Sheet";

function Host() {
  const [sheet, setSheet] = useState(false);
  return (
    <div>
      <FloatingActionButton
        icon="plus"
        aria-label="Додати"
        actions={[
          {
            id: "expense",
            icon: "plus",
            label: "Додати витрату",
            onClick: () => setSheet(true),
          },
        ]}
      />
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Нова витрата">
        <button type="button">Зберегти</button>
      </Sheet>
    </div>
  );
}

describe("useDialogFocusTrap — swap меню -> аркуш в одному коміті", () => {
  afterEach(() => {
    cleanup();
    __resetDialogInertForTests();
  });

  it("після закриття аркуша фокус повертається на тригер меню (FAB)", async () => {
    render(<Host />);
    const fab = screen.getByRole("button", { name: "Додати" });
    fab.focus();
    fireEvent.click(fab);

    const item = screen.getByRole("menuitem", { name: /Додати витрату/ });
    item.focus();
    // Меню закривається і аркуш відкривається одним батчем.
    fireEvent.click(item);

    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    // exit-анімація Sheet: чекаємо розмонтування.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(document.activeElement).toBe(fab);
  });
});
