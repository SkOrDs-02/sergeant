/** @vitest-environment jsdom */
/**
 * Last validated: 2026-10-10
 * Status: Active
 *
 * Аудит ux-02: пікер гліфа відкривається всередині Sheet-форми (нова
 * звичка), і системний Back (Android/PWA) закривав усю форму разом із
 * пікером. Тепер у пікера свій запис історії, тож Back знімає лише його.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sheet } from "@shared/components/ui/Sheet";
import { HabitGlyphPicker } from "./HabitGlyphPicker";

afterEach(cleanup);

describe("HabitGlyphPicker — системний Back", () => {
  it("всередині Sheet Back закриває лише пікер, форма лишається", () => {
    const onSheetClose = vi.fn();
    render(
      <Sheet open onClose={onSheetClose} title="Нова звичка">
        <HabitGlyphPicker value={null} onChange={vi.fn()} label="Іконка" />
      </Sheet>,
    );
    // Запис історії Sheet: після відкату пікера він стає верхнім.
    const sheetEntry = window.history.state;

    fireEvent.click(screen.getByRole("button", { name: "Іконка" }));
    expect(screen.getByRole("dialog", { name: "Іконка" })).toBeInTheDocument();

    fireEvent(window, new PopStateEvent("popstate", { state: sheetEntry }));

    expect(screen.queryByRole("dialog", { name: "Іконка" })).toBeNull();
    expect(onSheetClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Нова звичка" }),
    ).toBeInTheDocument();
  });

  it("закритий пікер не реагує на Back", () => {
    render(<HabitGlyphPicker value={null} onChange={vi.fn()} label="Іконка" />);
    fireEvent.popState(window);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
