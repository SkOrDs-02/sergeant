// @vitest-environment jsdom
/**
 * Tests for `useCoarsePointer` — returns `true` on touch (coarse pointer)
 * devices and re-evaluates when the `(pointer: coarse)` media query flips
 * (mouse plugged into a tablet mid-session).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCoarsePointer } from "./useCoarsePointer";

type Listener = (e: { matches: boolean }) => void;

/**
 * Install a controllable `matchMedia` for `(pointer: coarse)`. Returns a
 * setter that flips `matches` and fires the registered `change` listeners,
 * plus the listener registration spies so a test can pick the legacy
 * `addListener` path when `useModern` is false.
 */
function installMatchMedia(options: {
  initialMatches: boolean;
  useModern?: boolean;
}) {
  const { initialMatches, useModern = true } = options;
  let matches = initialMatches;
  const listeners = new Set<Listener>();
  const addEventListener = vi.fn((_: string, cb: Listener) =>
    listeners.add(cb),
  );
  const removeEventListener = vi.fn((_: string, cb: Listener) =>
    listeners.delete(cb),
  );
  const addListener = vi.fn((cb: Listener) => listeners.add(cb));
  const removeListener = vi.fn((cb: Listener) => listeners.delete(cb));

  const mql = {
    get matches() {
      return matches;
    },
    media: "(pointer: coarse)",
    ...(useModern ? { addEventListener, removeEventListener } : {}),
    addListener,
    removeListener,
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
    addListener,
    removeListener,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useCoarsePointer", () => {
  it("upgrades to true on mount for a coarse-pointer device", () => {
    installMatchMedia({ initialMatches: true });
    const { result } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(true);
  });

  it("stays false for a fine-pointer device", () => {
    installMatchMedia({ initialMatches: false });
    const { result } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(false);
  });

  it("re-evaluates when the media query flips (mouse plugged in)", () => {
    const mm = installMatchMedia({ initialMatches: true });
    const { result } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(true);

    act(() => mm.set(false));
    expect(result.current).toBe(false);

    act(() => mm.set(true));
    expect(result.current).toBe(true);
  });

  it("subscribes and unsubscribes via the modern addEventListener API", () => {
    const mm = installMatchMedia({ initialMatches: false });
    const { unmount } = renderHook(() => useCoarsePointer());
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

  it("falls back to addListener/removeListener on Safari < 14", () => {
    const mm = installMatchMedia({ initialMatches: true, useModern: false });
    const { result, unmount } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(true);
    expect(mm.addListener).toHaveBeenCalledWith(expect.any(Function));

    act(() => mm.set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(mm.removeListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it("stays false (SSR-safe) when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(false);
  });
});
