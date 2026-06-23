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

  it("subtracts offsetTop from the gap", () => {
    installVisualViewport(500, 50); // gap = 800 - 500 - 50 = 250
    const { result } = renderHook(() => useWebVisualKeyboardInset(true));
    expect(result.current).toBe(250);
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
});
