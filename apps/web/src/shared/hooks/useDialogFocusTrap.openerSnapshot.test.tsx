// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Регресія ux-08 (аудит 2026-10-01): знімок «хто мав фокус до відкриття»
 * мусить братись ДО автофокусу самого компонента. HubSearch фокусує інпут у
 * власному `useEffect` (useSearchEngine), який оголошений раніше за
 * `useDialogFocusTrap` і тому відпрацьовував першим: пастка запамʼятовувала
 * сам інпут, той розмонтовувався, і фокус після закриття падав на `<body>`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useEffect, useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  useDialogFocusTrap,
  __resetDialogInertForTests,
} from "./useDialogFocusTrap";

function Overlay({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Власний автофокус у passive-ефекті, оголошений ДО пастки — як у
  // `useSearchEngine`.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useDialogFocusTrap(true, panelRef, { onEscape: onClose });

  return (
    <div ref={panelRef}>
      <input aria-label="Запит" ref={inputRef} />
      <button type="button" onClick={onClose}>
        Скасувати
      </button>
    </div>
  );
}

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Пошук
      </button>
      {open && <Overlay onClose={() => setOpen(false)} />}
    </div>
  );
}

describe("useDialogFocusTrap — знімок фокуса до автофокусу компонента", () => {
  afterEach(() => {
    cleanup();
    __resetDialogInertForTests();
  });

  it("повертає фокус на тригер, хоч компонент сам сфокусував інпут у useEffect", () => {
    render(<Host />);
    const trigger = screen.getByRole("button", { name: "Пошук" });
    trigger.focus();
    fireEvent.click(trigger);

    // Автофокус компонента відпрацював: фокус у полі, не на тригері.
    expect(document.activeElement).toBe(screen.getByLabelText("Запит"));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByLabelText("Запит")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("повертає фокус на тригер і при закритті кнопкою", () => {
    render(<Host />);
    const trigger = screen.getByRole("button", { name: "Пошук" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));

    expect(document.activeElement).toBe(trigger);
  });
});
