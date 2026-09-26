// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("./useFinykStatTransactions", () => ({
  useFinykMirrorTransactions: () => [],
}));

import { useMonthlyTrend } from "./useMonthlyTrend";

const storage = { excludedTxIds: new Set<string>(), txSplits: {} };

describe("useMonthlyTrend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 25 вересня 2026, 10:00 за Києвом.
    vi.setSystemTime(new Date("2026-09-25T07:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  // Дзеркало наповнюється помісячно, тож тренд сам дотягує завершені
  // місяці вікна: жовтень 2025 - серпень 2026, одним діапазоном.
  it("requests the 11 completed months of the window once", () => {
    const fetchRange = vi.fn().mockResolvedValue([]);
    const { rerender } = renderHook(() =>
      useMonthlyTrend(storage, null, fetchRange),
    );
    rerender();
    expect(fetchRange).toHaveBeenCalledTimes(1);
    const [from, to] = fetchRange.mock.calls[0] as [string, string];
    expect(new Date(from).toISOString()).toBe("2025-09-30T21:00:00.000Z");
    expect(new Date(to).toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("swallows a range failure (no bank, offline) instead of throwing", async () => {
    const fetchRange = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() =>
      useMonthlyTrend(storage, null, fetchRange),
    );
    await Promise.resolve();
    expect(result.current.points).toEqual([]);
  });
});
