import { describe, expect, it, vi } from "vitest";
import { firstCall } from "./firstCall";

describe("firstCall", () => {
  it("returns the first call's argument tuple", () => {
    const fn = vi.fn();
    fn("a", 1);
    fn("b", 2);
    expect(firstCall(fn)).toEqual(["a", 1]);
  });

  it("throws when the mock was never called", () => {
    const fn = vi.fn();
    expect(() => firstCall(fn)).toThrow(
      /expected mock to have been called at least once, got 0 calls/,
    );
  });
});
