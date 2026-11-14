/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAnalyticsPeriodData } from "./useAnalyticsPeriodData";

describe("useAnalyticsPeriodData", () => {
  it("збій місяця порівняння видно як comparisonError, а не мовчазне зникнення", async () => {
    const fetchMonth = vi.fn().mockRejectedValue(new Error("503"));
    const period = {
      kind: "month" as const,
      fromKey: "2026-10-01",
      toKey: "2026-10-31",
    };
    const { result } = renderHook(() =>
      useAnalyticsPeriodData({
        period,
        todayKey: "2026-10-15",
        realTx: [],
        fetchMonth,
        manualExpenses: [],
      }),
    );

    await waitFor(() => expect(result.current.comparisonError).toBe(true));
    expect(result.current.fetchError).toBeNull();
    expect(result.current.prevLoaded).toBe(false);
  });
});
