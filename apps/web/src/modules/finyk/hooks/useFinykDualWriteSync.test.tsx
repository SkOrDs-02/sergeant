// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const isRegistered = vi.fn();
const trigger = vi.fn();
const extract = vi.fn((..._a: unknown[]) => ({ marker: "next" }));

vi.mock("../lib/dualWrite/index.js", () => ({
  EMPTY_FINYK_STATE: { marker: "empty" },
  isFinykDualWriteRegistered: () => isRegistered(),
  triggerFinykDualWrite: (...a: unknown[]) => trigger(...a),
}));
vi.mock("../lib/dualWrite/extract.js", () => ({
  extractFinykDualWriteState: (...a: unknown[]) => extract(...a),
}));

import { useFinykDualWriteSync } from "./useFinykDualWriteSync";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

const slots = { showBalance: true } as unknown as FinykStorageSlots;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFinykDualWriteSync", () => {
  it("does not trigger a dual-write when no context is registered", () => {
    isRegistered.mockReturnValue(false);
    renderHook(() => useFinykDualWriteSync(slots));
    expect(trigger).not.toHaveBeenCalled();
    // It still snapshots the current state for the next diff.
    expect(extract).toHaveBeenCalledWith(slots, true);
  });

  it("skips the trigger on the first registered render (initial snapshot)", () => {
    isRegistered.mockReturnValue(true);
    renderHook(() => useFinykDualWriteSync(slots));
    expect(trigger).not.toHaveBeenCalled();
  });

  it("triggers a dual-write on a subsequent change after registration", () => {
    isRegistered.mockReturnValue(true);
    extract
      .mockReturnValueOnce({ marker: "first" })
      .mockReturnValueOnce({ marker: "second" });

    const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
      initialProps: { s: slots },
    });
    // Force the effect to run again with a changed slots reference.
    rerender({ s: { showBalance: false } as unknown as FinykStorageSlots });

    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(
      { marker: "first" },
      { marker: "second" },
    );
  });
});
