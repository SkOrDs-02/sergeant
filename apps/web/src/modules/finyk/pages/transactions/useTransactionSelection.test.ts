// @vitest-environment jsdom
/**
 * Unit tests for useTransactionSelection.
 *
 * The hook owns batch-selection state (selectMode, selectedIds, batchCatPicker)
 * and delegates undo-toast-wrapped actions (applyBatchHide, applyBatchExclude,
 * applyBatchCategory) plus stable row-level callbacks.
 *
 * We verify:
 *   - initial state defaults
 *   - toggleSelect adds/removes ids
 *   - exitSelectMode clears all selection state
 *   - applyBatchCategory calls overrideCategory for each selected id
 *   - applyBatchHide only hides *newly* hidden ids
 *   - applyBatchExclude only excludes *newly* excluded ids
 *   - stable callbacks (stableHideTx, stableOverrideCategory) delegate to
 *     current handler via ref
 *   - stableSwipeDeleteManual guards on missing manualId
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { useTransactionSelection } from "./useTransactionSelection";
import type { UseTransactionSelectionParams } from "./useTransactionSelection";

// ── helpers ───────────────────────────────────────────────────────────────────

function mkTx(id: string, amount: number): Transaction {
  return {
    id,
    amount,
    time: Math.floor(Date.now() / 1000),
    date: "2025-06-04",
    description: "test",
    mcc: 0,
    categoryId: "other",
    type: amount > 0 ? "income" : "expense",
    source: "manual",
    accountId: null,
    manual: false,
    _source: "manual",
    _accountId: null,
    _manual: false,
  };
}

// Minimal mock for the `toast` API surface used by `showUndoToast`.
// `showUndoToast` calls `toast.show(msg, "info", duration, { ... })`.
function mkToast() {
  return {
    show: vi.fn().mockReturnValue(1),
    success: vi.fn().mockReturnValue(1),
    error: vi.fn().mockReturnValue(1),
    info: vi.fn().mockReturnValue(1),
    warning: vi.fn().mockReturnValue(1),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  } as unknown as ReturnType<typeof import("@shared/hooks/useToast").useToast>;
}

function buildParams(
  overrides: Partial<UseTransactionSelectionParams> = {},
): UseTransactionSelectionParams {
  return {
    hiddenTxIds: [],
    excludedStatTxIds: [],
    txCategories: {},
    hideTx: vi.fn(),
    toggleExcludeFromStats: vi.fn(),
    overrideCategory: vi.fn(),
    setSplitTx: vi.fn(),
    removeManualExpense: vi.fn(),
    addManualExpense: vi.fn(),
    onEditManualExpense: vi.fn(),
    toast: mkToast(),
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useTransactionSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("starts with selectMode=false", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      expect(result.current.selectMode).toBe(false);
    });

    it("starts with an empty selectedIds Set", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      expect(result.current.selectedIds.size).toBe(0);
    });

    it("starts with batchCatPicker=false", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      expect(result.current.batchCatPicker).toBe(false);
    });
  });

  describe("toggleSelect", () => {
    it("adds an id to selectedIds", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      act(() => result.current.toggleSelect("tx1"));
      expect(result.current.selectedIds.has("tx1")).toBe(true);
    });

    it("removes an id that is already selected", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      act(() => result.current.toggleSelect("tx1"));
      act(() => result.current.toggleSelect("tx1"));
      expect(result.current.selectedIds.has("tx1")).toBe(false);
    });

    it("accumulates multiple ids", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      act(() => {
        result.current.toggleSelect("a");
        result.current.toggleSelect("b");
      });
      expect(result.current.selectedIds.size).toBe(2);
    });
  });

  describe("exitSelectMode", () => {
    it("clears selectedIds and resets selectMode and batchCatPicker", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      act(() => {
        result.current.setSelectMode(true);
        result.current.toggleSelect("tx1");
        result.current.setBatchCatPicker(true);
      });
      act(() => result.current.exitSelectMode());
      expect(result.current.selectMode).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.batchCatPicker).toBe(false);
    });
  });

  describe("applyBatchCategory", () => {
    it("calls overrideCategory for each selected id", () => {
      const overrideCategory = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams({ overrideCategory })),
      );
      act(() => {
        result.current.toggleSelect("tx1");
        result.current.toggleSelect("tx2");
      });
      act(() => result.current.applyBatchCategory("food"));
      expect(overrideCategory).toHaveBeenCalledWith("tx1", "food");
      expect(overrideCategory).toHaveBeenCalledWith("tx2", "food");
    });

    it("exits select mode after applying", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      act(() => result.current.toggleSelect("tx1"));
      act(() => result.current.applyBatchCategory("food"));
      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectMode).toBe(false);
    });
  });

  describe("applyBatchHide", () => {
    it("calls hideTx for each selected id that is not already hidden", () => {
      const hideTx = vi.fn();
      const params = buildParams({ hideTx, hiddenTxIds: ["tx2"] });
      const { result } = renderHook(() => useTransactionSelection(params));
      act(() => {
        result.current.toggleSelect("tx1");
        result.current.toggleSelect("tx2"); // already hidden
      });
      act(() => result.current.applyBatchHide());
      // tx1 should be hidden, tx2 already was hidden so skip
      expect(hideTx).toHaveBeenCalledWith("tx1");
      expect(hideTx).not.toHaveBeenCalledWith("tx2");
    });

    it("exits select mode after applying", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      act(() => result.current.toggleSelect("tx1"));
      act(() => result.current.applyBatchHide());
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe("applyBatchExclude", () => {
    it("calls toggleExcludeFromStats for ids not already excluded", () => {
      const toggleExcludeFromStats = vi.fn();
      const params = buildParams({
        toggleExcludeFromStats,
        excludedStatTxIds: ["tx2"],
      });
      const { result } = renderHook(() => useTransactionSelection(params));
      act(() => {
        result.current.toggleSelect("tx1");
        result.current.toggleSelect("tx2"); // already excluded
      });
      act(() => result.current.applyBatchExclude());
      expect(toggleExcludeFromStats).toHaveBeenCalledWith("tx1");
      expect(toggleExcludeFromStats).not.toHaveBeenCalledWith("tx2");
    });

    it("exits select mode after applying", () => {
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams()),
      );
      act(() => result.current.toggleSelect("tx1"));
      act(() => result.current.applyBatchExclude());
      expect(result.current.selectMode).toBe(false);
    });
  });

  describe("stable callbacks", () => {
    it("stableHideTx delegates to the current hideTx handler", () => {
      const hideTx = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams({ hideTx })),
      );
      act(() => result.current.stableHideTx("tx1"));
      expect(hideTx).toHaveBeenCalledWith("tx1");
    });

    it("stableOverrideCategory delegates to overrideCategory", () => {
      const overrideCategory = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams({ overrideCategory })),
      );
      act(() => result.current.stableOverrideCategory("tx1", "food"));
      expect(overrideCategory).toHaveBeenCalledWith("tx1", "food");
    });

    it("stableSwipeHideTx delegates to hideTx", () => {
      const hideTx = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams({ hideTx })),
      );
      act(() => result.current.stableSwipeHideTx("tx1"));
      expect(hideTx).toHaveBeenCalledWith("tx1");
    });

    it("stableSetSplitTx delegates to setSplitTx", () => {
      const setSplitTx = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams({ setSplitTx })),
      );
      act(() =>
        result.current.stableSetSplitTx("tx1", [
          { categoryId: "food", amount: 100 },
        ]),
      );
      expect(setSplitTx).toHaveBeenCalledWith("tx1", [
        { categoryId: "food", amount: 100 },
      ]);
    });

    it("stableOnEditManual invokes onEditManualExpense when manualId is a string", () => {
      const onEditManualExpense = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams({ onEditManualExpense })),
      );
      act(() => result.current.stableOnEditManual("manual123"));
      expect(onEditManualExpense).toHaveBeenCalledWith("manual123");
    });

    it("stableOnEditManual is a no-op when manualId is undefined", () => {
      const onEditManualExpense = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams({ onEditManualExpense })),
      );
      act(() => result.current.stableOnEditManual(undefined));
      expect(onEditManualExpense).not.toHaveBeenCalled();
    });
  });

  describe("stableSwipeDeleteManual", () => {
    it("is a no-op when tx has no manualId", () => {
      const removeManualExpense = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(buildParams({ removeManualExpense })),
      );
      const tx = mkTx("tx1", -100);
      act(() => result.current.stableSwipeDeleteManual(tx));
      expect(removeManualExpense).not.toHaveBeenCalled();
    });

    it("calls removeManualExpense when tx has a manualId", () => {
      const removeManualExpense = vi.fn();
      const addManualExpense = vi.fn();
      const { result } = renderHook(() =>
        useTransactionSelection(
          buildParams({ removeManualExpense, addManualExpense }),
        ),
      );
      const tx = { ...mkTx("tx1", -100), manualId: "m123" } as Transaction & {
        manualId: string;
      };
      act(() => result.current.stableSwipeDeleteManual(tx));
      expect(removeManualExpense).toHaveBeenCalledWith("m123");
    });
  });
});
