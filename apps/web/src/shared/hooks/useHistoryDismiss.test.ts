/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

import { useHistoryDismiss } from "./useHistoryDismiss";

afterEach(cleanup);

/**
 * jsdom не ходить по історії по-справжньому, тож Back імітуємо так, як його
 * бачить хук: `popstate` зі станом запису, який став верхнім.
 */
function popTo(state: unknown): void {
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}

describe("useHistoryDismiss", () => {
  it("Back закриває діалог", () => {
    const onClose = vi.fn();
    renderHook(() => useHistoryDismiss(true, onClose));
    popTo(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("закриття вкладеного діалогу не закриває зовнішній", () => {
    // Пікер заняття над формою запису: вкладений відкочує СВІЙ запис історії,
    // `popstate` прилітає обом, і зовнішній мусить впізнати, що його запис
    // усе ще верхній.
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();
    renderHook(() => useHistoryDismiss(true, onCloseOuter));
    const outerEntry = window.history.state;
    const inner = renderHook(
      ({ open }: { open: boolean }) => useHistoryDismiss(open, onCloseInner),
      { initialProps: { open: true } },
    );
    expect(window.history.state).not.toEqual(outerEntry);

    inner.rerender({ open: false });
    popTo(outerEntry);
    expect(onCloseOuter).not.toHaveBeenCalled();
    expect(onCloseInner).not.toHaveBeenCalled();

    // А ось справжній Back тепер закриває саме зовнішній.
    popTo(null);
    expect(onCloseOuter).toHaveBeenCalledTimes(1);
  });
});
