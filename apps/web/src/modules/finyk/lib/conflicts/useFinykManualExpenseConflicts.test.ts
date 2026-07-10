// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFinykManualExpenseConflicts } from "./useFinykManualExpenseConflicts";
import {
  __resetFinykManualExpenseConflictsForTests,
  recordFinykManualExpenseConflict,
  type FinykManualExpenseConflict,
} from "./store";

function makeConflict(
  overrides: Partial<FinykManualExpenseConflict> = {},
): FinykManualExpenseConflict {
  return {
    transactionId: "tx-hook-1",
    reason: "lww_conflict",
    localDataJson: "{}",
    attemptedClientTs: "2026-06-01T00:00:00.000Z",
    detectedAt: 1,
    ...overrides,
  };
}

describe("useFinykManualExpenseConflicts", () => {
  afterEach(() => {
    __resetFinykManualExpenseConflictsForTests();
  });

  it("starts with an empty conflicts list", () => {
    const { result } = renderHook(() => useFinykManualExpenseConflicts());
    expect(result.current).toEqual([]);
  });

  it("reflects store updates without tearing", () => {
    const { result } = renderHook(() => useFinykManualExpenseConflicts());
    act(() => {
      recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-a" }));
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.transactionId).toBe("tx-a");

    act(() => {
      recordFinykManualExpenseConflict(makeConflict({ transactionId: "tx-b" }));
    });
    expect(result.current).toHaveLength(2);
  });
});
