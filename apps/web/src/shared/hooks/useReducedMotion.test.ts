// @vitest-environment jsdom
/**
 * Tests for `useReducedMotion` — tracks `(prefers-reduced-motion: reduce)` and
 * updates reactively when the user toggles the OS accessibility setting.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useReducedMotion } from "./useReducedMotion";

type Listener = (e: { matches: boolean }) => void;

/** Controllable `matchMedia` stub for `(prefers-reduced-motion: reduce)`. */
function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<Listener>();
  const addEventListener = vi.fn((_: string, cb: Listener) =>
    listeners.add(cb),
  );
  const removeEventListener = vi.fn((_: string, cb: Listener) =>
    listeners.delete(cb),
  );

  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: globalThis.matchMedia,
  });

  return {
    set(next: boolean) {
      matches = next;
      for (const cb of listeners) cb({ matches: next });
    },
    addEventListener,
    removeEventListener,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useReducedMotion", () => {
  it("returns true when prefers-reduced-motion matches on mount", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("returns false when prefers-reduced-motion does not match on mount", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("updates when the media query flips while mounted", () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => mm.set(true));
    expect(result.current).toBe(true);

    act(() => mm.set(false));
    expect(result.current).toBe(false);
  });

  it("subscribes and unsubscribes via addEventListener", () => {
    const mm = installMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(mm.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    unmount();
    expect(mm.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});
