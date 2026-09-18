import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetVisualKeyboardInsetAdapter,
  setVisualKeyboardInsetAdapter,
  useVisualKeyboardInset,
  type VisualKeyboardInsetAdapter,
} from "./useVisualKeyboardInset";

describe("shared visual-keyboard-inset contract", () => {
  beforeEach(() => {
    resetVisualKeyboardInsetAdapter();
  });

  it("no-op default adapter returns 0 regardless of `active`", () => {
    expect(useVisualKeyboardInset(true)).toBe(0);
    expect(useVisualKeyboardInset(false)).toBe(0);
  });

  it("routes the call through the registered adapter and forwards `active`", () => {
    const adapter: VisualKeyboardInsetAdapter = vi.fn((active) =>
      active ? 123 : 0,
    );
    setVisualKeyboardInsetAdapter(adapter);

    expect(useVisualKeyboardInset(true)).toBe(123);
    expect(useVisualKeyboardInset(false)).toBe(0);

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(adapter).toHaveBeenNthCalledWith(1, true);
    expect(adapter).toHaveBeenNthCalledWith(2, false);
  });

  it("supports swapping adapters at runtime", () => {
    const first: VisualKeyboardInsetAdapter = vi.fn(() => 10);
    const second: VisualKeyboardInsetAdapter = vi.fn(() => 20);

    setVisualKeyboardInsetAdapter(first);
    expect(useVisualKeyboardInset(true)).toBe(10);

    setVisualKeyboardInsetAdapter(second);
    expect(useVisualKeyboardInset(true)).toBe(20);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("resetVisualKeyboardInsetAdapter restores the no-op default", () => {
    const adapter: VisualKeyboardInsetAdapter = vi.fn(() => 42);
    setVisualKeyboardInsetAdapter(adapter);
    expect(useVisualKeyboardInset(true)).toBe(42);

    resetVisualKeyboardInsetAdapter();
    expect(useVisualKeyboardInset(true)).toBe(0);
    // No further calls on the previously-registered adapter.
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
