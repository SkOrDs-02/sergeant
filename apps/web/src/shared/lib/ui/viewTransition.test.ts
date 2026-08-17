// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { startViewTransition, supportsViewTransitions } from "./viewTransition";

const matchMediaStub = (matches: boolean) =>
  vi.fn(() => ({
    matches,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Ensure the API is cleaned up between cases.
  delete (document as unknown as { startViewTransition?: unknown })
    .startViewTransition;
});

describe("startViewTransition (R2-V-1/V-2)", () => {
  it("runs the mutation directly when the API is unavailable", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(false));
    const mutate = vi.fn();
    startViewTransition(mutate);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("runs the mutation directly (no transition) under reduced motion", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(true));
    const startVT = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    (
      document as unknown as { startViewTransition: typeof startVT }
    ).startViewTransition = startVT;

    const mutate = vi.fn();
    startViewTransition(mutate);

    // Reduced motion → bypass the API entirely.
    expect(startVT).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("drives the mutation through the API when supported", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(false));
    const startVT = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    (
      document as unknown as { startViewTransition: typeof startVT }
    ).startViewTransition = startVT;

    const mutate = vi.fn();
    startViewTransition(mutate);

    expect(startVT).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("falls back to a direct mutation if the API throws", () => {
    vi.stubGlobal("matchMedia", matchMediaStub(false));
    const startVT = vi.fn(() => {
      throw new Error("boom");
    });
    (
      document as unknown as { startViewTransition: typeof startVT }
    ).startViewTransition = startVT;

    const mutate = vi.fn();
    expect(() => startViewTransition(mutate)).not.toThrow();
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("supportsViewTransitions reflects API presence", () => {
    expect(supportsViewTransitions()).toBe(false);
    (
      document as unknown as { startViewTransition: () => void }
    ).startViewTransition = () => {};
    expect(supportsViewTransitions()).toBe(true);
  });
});
