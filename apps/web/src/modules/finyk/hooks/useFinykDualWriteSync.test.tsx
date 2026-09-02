// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const isRegistered = vi.fn();
const trigger = vi.fn();
const extract = vi.fn((..._a: unknown[]) => ({ marker: "next" }));
const diff = vi.fn((..._a: unknown[]) => [{ op: "upsert" }]);
const readTick = vi.fn(() => 0);

vi.mock("../lib/sqliteWriter/index.js", () => ({
  EMPTY_FINYK_STATE: { marker: "empty" },
  isFinykDualWriteRegistered: () => isRegistered(),
  triggerFinykDualWrite: (...a: unknown[]) => trigger(...a),
  diffFinykDualWriteOps: (...a: unknown[]) => diff(...a),
}));
vi.mock("../lib/sqliteWriter/extract.js", () => ({
  extractFinykDualWriteState: (...a: unknown[]) => extract(...a),
}));
vi.mock("../lib/sqliteReadGate.js", () => ({
  useFinykSqliteReadTick: () => readTick(),
}));

import { useFinykDualWriteSync } from "./useFinykDualWriteSync";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

const slots = { showBalance: true } as unknown as FinykStorageSlots;

beforeEach(() => {
  vi.clearAllMocks();
  diff.mockReturnValue([{ op: "upsert" }]);
  readTick.mockReturnValue(0);
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

  it("SYNC-3: does not re-push a change that arrived via a SQLite cache-overlay tick (pull echo)", () => {
    // Regression: `docs/90-work/audits/2026-09-01-product-audit/findings.md`
    // § SYNC-3. `useFinykStorageSlots` overlays every slot from
    // `getCachedFinykSqliteState()` whenever the read-tick bumps — both
    // for a genuine remote pull AND for the echo of this device's own
    // just-settled local write. Before the fix, ANY slot difference
    // (including rows this device only just pulled from another device)
    // got diffed and pushed straight back out — an infinite re-push
    // loop. A tick change must resync the baseline WITHOUT triggering.
    isRegistered.mockReturnValue(true);
    readTick.mockReturnValue(0);
    extract.mockReturnValueOnce({ marker: "initial" });

    const { rerender } = renderHook(({ s }) => useFinykDualWriteSync(s), {
      initialProps: { s: slots },
    });
    // First render after registration: snapshot only, no trigger.
    expect(trigger).not.toHaveBeenCalled();

    // Simulate a pull landing: the read-tick bumps AND the slots object
    // now contains a row that wasn't in the previous snapshot (a diff
    // would be non-empty — `diff` is stubbed to always return an op).
    readTick.mockReturnValue(1);
    extract.mockReturnValueOnce({ marker: "pulled-in" });
    rerender({ s: { showBalance: true } as unknown as FinykStorageSlots });

    expect(trigger).not.toHaveBeenCalled();

    // A subsequent render with the tick UNCHANGED (a genuine local
    // mutation, not a cache overlay) must still trigger normally.
    extract.mockReturnValueOnce({ marker: "local-edit" });
    rerender({ s: { showBalance: false } as unknown as FinykStorageSlots });

    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(
      { marker: "pulled-in" },
      { marker: "local-edit" },
    );
  });
});
