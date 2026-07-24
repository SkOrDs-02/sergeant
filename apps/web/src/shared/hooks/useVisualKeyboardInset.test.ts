// @vitest-environment jsdom
/**
 * Tests for `useWebVisualKeyboardInset` — bottom-sheet lift over the
 * on-screen keyboard, driven by `window.visualViewport`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebVisualKeyboardInset } from "./useVisualKeyboardInset";

interface FakeVV {
  height: number;
  offsetTop: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _fire: (type: string) => void;
}

function installVisualViewport(height: number, offsetTop = 0): FakeVV {
  const listeners: Record<string, Array<() => void>> = {};
  const vv: FakeVV = {
    height,
    offsetTop,
    addEventListener: vi.fn((type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    }),
    removeEventListener: vi.fn(),
    _fire: (type: string) => {
      for (const cb of listeners[type] ?? []) cb();
    },
  };
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    writable: true,
    value: vv,
  });
  return vv;
}

describe("useWebVisualKeyboardInset", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    vi.restoreAllMocks();
  });

  it("returns 0 when not active", () => {
    installVisualViewport(800);
    const { result } = renderHook(() => useWebVisualKeyboardInset(false));
    expect(result.current).toBe(0);
  });

  it("reports the keyboard gap when active and gap exceeds 56px", () => {
    // innerHeight 800, vv.height 500 → gap 300 > 56
    installVisualViewport(500);
    const { result } = renderHook(() => useWebVisualKeyboardInset(true));
    expect(result.current).toBe(300);
  });

  it("filters out small browser-chrome resizes (gap <= 56px)", () => {
    installVisualViewport(760); // gap = 40
    const { result } = renderHook(() => useWebVisualKeyboardInset(true));
    expect(result.current).toBe(0);
  });

  it("recomputes on visualViewport resize events", () => {
    const vv = installVisualViewport(800);
    const { result } = renderHook(() => useWebVisualKeyboardInset(true));
    expect(result.current).toBe(0);
    act(() => {
      vv.height = 450;
      vv._fire("resize");
    });
    expect(result.current).toBe(350);
  });

  it("ignores offsetTop — the gap is derived from height alone", () => {
    // Would have been 800 - 500 - 50 = 250 under the old formula; the
    // stabilized inset only cares about the height delta (300).
    installVisualViewport(500, 50);
    const { result } = renderHook(() => useWebVisualKeyboardInset(true));
    expect(result.current).toBe(300);
  });

  it("does not recompute on visualViewport scroll events (H1 — no jitter)", () => {
    // iOS fires `scroll` on visualViewport continuously while panning
    // to keep a focused input above the keyboard, shifting offsetTop
    // on every frame. The inset must stay put through that churn —
    // only a real `resize` (keyboard height actually changing) may
    // move it. See keyboard-and-scroll.md § H1.
    const vv = installVisualViewport(500); // gap = 300
    const { result } = renderHook(() => useWebVisualKeyboardInset(true));
    expect(result.current).toBe(300);

    act(() => {
      vv.offsetTop = 40;
      vv._fire("scroll");
    });
    expect(result.current).toBe(300);

    act(() => {
      vv.offsetTop = 90;
      vv._fire("scroll");
    });
    expect(result.current).toBe(300);
  });

  it("only resize is subscribed on visualViewport — no scroll listener", () => {
    const vv = installVisualViewport(800);
    renderHook(() => useWebVisualKeyboardInset(true));
    const listenedTypes = vv.addEventListener.mock.calls.map((call) => call[0]);
    expect(listenedTypes).toEqual(["resize"]);
  });

  it("resets to 0 when toggled inactive", () => {
    installVisualViewport(500);
    const { result, rerender } = renderHook(
      ({ active }) => useWebVisualKeyboardInset(active),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(300);
    rerender({ active: false });
    expect(result.current).toBe(0);
  });

  it("is a no-op when visualViewport is unavailable", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useWebVisualKeyboardInset(true));
    expect(result.current).toBe(0);
  });

  it("scrolls the focused text field into view when the keyboard opens (H2 fallback)", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const vv = installVisualViewport(800); // starts closed
    renderHook(() => useWebVisualKeyboardInset(true));
    expect(input.scrollIntoView).not.toHaveBeenCalled();

    act(() => {
      vv.height = 450; // keyboard opens, gap 350
      vv._fire("resize");
    });

    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    document.body.removeChild(input);
  });

  it("snaps window.scrollY back to 0 when the keyboard closes and the window drifted (H3 fallback)", () => {
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    const vv = installVisualViewport(500); // starts open, gap 300
    renderHook(() => useWebVisualKeyboardInset(true));
    expect(scrollToSpy).not.toHaveBeenCalled();

    Object.defineProperty(window, "scrollY", {
      value: 120,
      configurable: true,
    });
    act(() => {
      vv.height = 800; // keyboard closes, gap 0
      vv._fire("resize");
    });

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});
