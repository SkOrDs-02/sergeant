// @vitest-environment jsdom
/**
 * Tests for `useHaptic` — web haptic feedback hook.
 *
 * Verifies the reduced-motion guard, `navigator.vibrate` no-op fallbacks,
 * and that the celebration sequence helpers fire timed vibrations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { hapticCancel } from "@shared/lib/adapters/haptic";
import { useHaptic } from "./useHaptic";

function setMatchMediaReduced(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce") ? reduced : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
  // also expose on window for code that reads window.matchMedia
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: globalThis.matchMedia,
  });
}

describe("useHaptic", () => {
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      writable: true,
      value: vibrate,
    });
    setMatchMediaReduced(false);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes the full API surface", () => {
    const { result } = renderHook(() => useHaptic());
    const api = result.current;
    for (const m of [
      "tap",
      "light",
      "medium",
      "heavy",
      "success",
      "warning",
      "error",
      "celebration",
      "levelUp",
      "streak",
      "goalComplete",
      "destructive",
      "toggle",
    ] as const) {
      expect(typeof api[m]).toBe("function");
    }
    expect(api.reduceMotion).toBe(false);
  });

  it("fires vibration for light/medium/heavy when motion allowed", () => {
    const { result } = renderHook(() => useHaptic());
    act(() => result.current.light());
    act(() => result.current.medium());
    act(() => result.current.heavy());
    expect(vibrate).toHaveBeenCalledWith(6);
    expect(vibrate).toHaveBeenCalledWith(15);
    expect(vibrate).toHaveBeenCalledWith(30);
  });

  it("toggle vibrates differently for on vs off", () => {
    const { result } = renderHook(() => useHaptic());
    act(() => result.current.toggle(true));
    expect(vibrate).toHaveBeenLastCalledWith(10);
    act(() => result.current.toggle(false));
    expect(vibrate).toHaveBeenLastCalledWith(6);
  });

  it("celebration fires the immediate success burst plus timed follow-ups", () => {
    const { result } = renderHook(() => useHaptic());
    act(() => result.current.celebration());
    // hapticSuccess pattern fires immediately
    const callsBefore = vibrate.mock.calls.length;
    expect(callsBefore).toBeGreaterThanOrEqual(1);
    act(() => vi.advanceTimersByTime(250));
    expect(vibrate.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("levelUp and goalComplete schedule rising-intensity vibrations", () => {
    const { result } = renderHook(() => useHaptic());
    act(() => result.current.levelUp());
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.goalComplete());
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.streak());
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.destructive());
    act(() => vi.advanceTimersByTime(200));
    expect(vibrate).toHaveBeenCalled();
  });

  it("respects prefers-reduced-motion: all methods become no-ops", () => {
    setMatchMediaReduced(true);
    const { result } = renderHook(() => useHaptic());
    expect(result.current.reduceMotion).toBe(true);
    act(() => result.current.tap());
    act(() => result.current.light());
    act(() => result.current.success());
    act(() => result.current.celebration());
    act(() => vi.advanceTimersByTime(500));
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("is a safe no-op when navigator.vibrate is unavailable", () => {
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useHaptic());
    expect(() => {
      act(() => result.current.medium());
      act(() => result.current.success());
    }).not.toThrow();
  });

  it("swallows exceptions thrown by navigator.vibrate", () => {
    vibrate.mockImplementation(() => {
      throw new Error("NotAllowedError");
    });
    const { result } = renderHook(() => useHaptic());
    expect(() => act(() => result.current.heavy())).not.toThrow();
  });

  it("cancel bypasses reduced motion and remains safe across browser fallbacks", () => {
    setMatchMediaReduced(true);

    expect(() => hapticCancel()).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith(0);

    vibrate.mockImplementation(() => {
      throw new Error("NotAllowedError");
    });
    expect(() => hapticCancel()).not.toThrow();

    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(() => hapticCancel()).not.toThrow();
  });
});
