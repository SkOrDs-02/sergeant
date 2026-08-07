// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const isRegistered = vi.fn();
const trigger = vi.fn();
const extract = vi.fn((..._a: unknown[]) => ({ marker: "next" }));
const diff = vi.fn((..._a: unknown[]) => [{ op: "upsert" }]);

vi.mock("../lib/sqliteWriter/index.js", () => ({
  EMPTY_FINYK_STATE: { marker: "empty" },
  isFinykDualWriteRegistered: () => isRegistered(),
  triggerFinykDualWrite: (...a: unknown[]) => trigger(...a),
  diffFinykDualWriteOps: (...a: unknown[]) => diff(...a),
}));
vi.mock("../lib/sqliteWriter/extract.js", () => ({
  extractFinykDualWriteState: (...a: unknown[]) => extract(...a),
}));

import { useFinykDualWriteSync } from "./useFinykDualWriteSync";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

const slots = { showBalance: true } as unknown as FinykStorageSlots;

beforeEach(() => {
  vi.clearAllMocks();
  diff.mockReturnValue([{ op: "upsert" }]);
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

  it("skips the trigger when the diff is empty", () => {
    // Regression: `useFinykStorageSlots` returns a fresh object literal
    // per render, so this effect fires on every render — and
    // `triggerFinykDualWrite` ends with a cache-refresh notify that
    // re-renders it. Without the diff gate that loops forever
    // (~280 refreshes/s measured on `/finyk`, 2026-08-06).
    isRegistered.mockReturnValue(true);
    diff.mockReturnValue([]);

    const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
      initialProps: { s: slots },
    });
    rerender({ s: { showBalance: true } as unknown as FinykStorageSlots });
    rerender({ s: { showBalance: true } as unknown as FinykStorageSlots });

    expect(trigger).not.toHaveBeenCalled();
  });
});
