// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Регресія до фіксу ux-08: коли один діалог закривається, а інший
 * відкривається в ТОМУ САМОМУ коміті (пункт меню -> аркуш), знімок
 * «хто мав фокус» у layout-ефекті нового діалогу відпрацьовує раніше за
 * passive-cleanup пастки меню, яка повертає фокус на тригер. Сфокусований
 * пункт меню на той момент уже розмонтовано, тож ранній знімок порожній;
 * без пізнього знімка фокус після закриття аркуша падав на `<body>`.
 * Меню - мінімальний діалог на тому самому хуку (FAB-меню, де сценарій
 * виник, знято редизайном v3); Sheet реальний, мокається лише haptic.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  __resetDialogInertForTests,
  useDialogFocusTrap,
} from "./useDialogFocusTrap";

vi.mock("../lib/adapters/haptic", () => ({ hapticTap: vi.fn() }));

import { Sheet } from "../components/ui/Sheet";

function Menu({ open, onPick }: { open: boolean; onPick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(open, ref);
  if (!open) return null;
  return (
    <div ref={ref} role="menu">
      <button type="button" role="menuitem" onClick={onPick}>
        Додати витрату
      </button>
    </div>
  );
}

function Host() {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setMenu(true)}>
        Додати
      </button>
      <Menu
        open={menu}
        onPick={() => {
          setMenu(false);
          setSheet(true);
        }}
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

  it("після закриття аркуша фокус повертається на тригер меню", async () => {
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
