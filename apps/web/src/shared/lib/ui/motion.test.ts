/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { prefersReducedMotion, motionScrollBehavior } from "./motion";

function mockReduceMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("reduce") ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefersReducedMotion", () => {
  it("returns true when the OS preference is set to reduce", () => {
    mockReduceMotion(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("returns false when the OS preference is not reduce", () => {
    mockReduceMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("returns false (no-throw) when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("returns false when matchMedia throws", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => {
        throw new Error("legacy webview");
      }),
    );
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("motionScrollBehavior", () => {
  it("resolves to 'auto' (instant) under reduced motion", () => {
    mockReduceMotion(true);
    expect(motionScrollBehavior()).toBe("auto");
  });

  it("resolves to 'smooth' when motion is allowed", () => {
    mockReduceMotion(false);
    expect(motionScrollBehavior()).toBe("smooth");
  });
});
