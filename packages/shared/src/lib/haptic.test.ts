import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hapticCancel,
  hapticError,
  hapticPattern,
  hapticSuccess,
  hapticTap,
  hapticWarning,
  resetHapticAdapter,
  setHapticAdapter,
  type HapticAdapter,
} from "./haptic";

function makeMockAdapter(): HapticAdapter {
  return {
    tap: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    cancel: vi.fn(),
    pattern: vi.fn(),
  };
}

describe("shared haptic contract", () => {
  beforeEach(() => {
    resetHapticAdapter();
  });

  it("no-op default adapter does not throw", () => {
    expect(() => hapticTap()).not.toThrow();
    expect(() => hapticSuccess()).not.toThrow();
    expect(() => hapticWarning()).not.toThrow();
    expect(() => hapticError()).not.toThrow();
    expect(() => hapticCancel()).not.toThrow();
    expect(() => hapticPattern(10)).not.toThrow();
    expect(() => hapticPattern([10, 20, 30])).not.toThrow();
  });

  it("routes every helper to the registered adapter", () => {
    const adapter = makeMockAdapter();
    setHapticAdapter(adapter);

    hapticTap();
    hapticSuccess();
    hapticWarning();
    hapticError();
    hapticCancel();
    hapticPattern(25);
    hapticPattern([10, 20, 30]);

    expect(adapter.tap).toHaveBeenCalledTimes(1);
    expect(adapter.success).toHaveBeenCalledTimes(1);
    expect(adapter.warning).toHaveBeenCalledTimes(1);
    expect(adapter.error).toHaveBeenCalledTimes(1);
    expect(adapter.cancel).toHaveBeenCalledTimes(1);
    expect(adapter.pattern).toHaveBeenCalledTimes(2);
    expect(adapter.pattern).toHaveBeenNthCalledWith(1, 25);
    expect(adapter.pattern).toHaveBeenNthCalledWith(2, [10, 20, 30]);
  });

  it("supports swapping adapters at runtime", () => {
    const first = makeMockAdapter();
    const second = makeMockAdapter();

    setHapticAdapter(first);
    hapticTap();

    setHapticAdapter(second);
    hapticTap();
    hapticSuccess();

    expect(first.tap).toHaveBeenCalledTimes(1);
    expect(first.success).not.toHaveBeenCalled();
    expect(second.tap).toHaveBeenCalledTimes(1);
    expect(second.success).toHaveBeenCalledTimes(1);
  });

  it("resetHapticAdapter restores the no-op default", () => {
    const adapter = makeMockAdapter();
    setHapticAdapter(adapter);
    hapticTap();
    expect(adapter.tap).toHaveBeenCalledTimes(1);

    resetHapticAdapter();
    hapticTap();
    // No further calls on the previously-registered adapter.
    expect(adapter.tap).toHaveBeenCalledTimes(1);
  });
});
