// @vitest-environment jsdom
/**
 * Branch coverage for useFinykManualExpenseConflicts hook — subscribe/re-render.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  __resetFinykManualExpenseConflictsForTests,
  recordFinykManualExpenseConflict,
  type FinykManualExpenseConflict,
} from "./store";
import { useFinykManualExpenseConflicts } from "./useFinykManualExpenseConflicts";

function makeConflict(
  overrides: Partial<FinykManualExpenseConflict> = {},
): FinykManualExpenseConflict {
  return {
    transactionId: "tx-hook-1",
    reason: "lww_conflict",
    localDataJson: "{}",
    attemptedClientTs: "2026-06-15T09:00:00.000Z",
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe("useFinykManualExpenseConflicts (branches)", () => {
  afterEach(() => {
    __resetFinykManualExpenseConflictsForTests();
  });

  it("returns empty array initially", () => {
    const { result } = renderHook(() => useFinykManualExpenseConflicts());
    expect(result.current).toEqual([]);
  });

  it("re-renders when a conflict is recorded", () => {
    const { result } = renderHook(() => useFinykManualExpenseConflicts());
    act(() => {
      recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-a" }));
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.transactionId).toBe("tx-a");
  });

  it("reflects multiple conflicts in FIFO order", () => {
    const { result } = renderHook(() => useFinykManualExpenseConflicts());
    act(() => {
      recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-1" }));
      recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-2" }));
    });
    expect(result.current.map((c) => c.transactionId)).toEqual([
      "tx-1",
      "tx-2",
    ]);
  });
});
