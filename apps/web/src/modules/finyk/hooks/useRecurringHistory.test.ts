// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../lib/monoMirrorReader";
import {
  __resetFinykMonoMirrorGateForTests,
  notifyFinykMonoMirrorRefresh,
} from "../lib/monoMirrorGate";
import { useRecurringHistory } from "./useRecurringHistory";

function mirrorTx(id: string, time: number): Transaction {
  return {
    id,
    amount: -19_900,
    time,
    date: "2026-08-01",
    description: "Netflix",
    mcc: 5815,
    categoryId: "other",
    type: "expense",
    source: "mono",
    accountId: "black",
    manual: false,
    _source: "mono",
    _accountId: "black",
    _manual: false,
  };
}

describe("useRecurringHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 25 вересня 2026, 10:00 за Києвом.
    vi.setSystemTime(new Date("2026-09-25T07:00:00Z"));
    clearFinykMonoMirrorCache();
    __resetFinykMonoMirrorGateForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearFinykMonoMirrorCache();
    __resetFinykMonoMirrorGateForTests();
  });

  // Корінь «хвиль»: `mono.transactions` після відповіді мережі лише поточний
  // місяць. Хук від стану завантаження не залежить: джерело — дзеркало.
  it("returns the mirrored history, not the current-month network slice", () => {
    const history = [
      mirrorTx("aug", 1_788_000_000),
      mirrorTx("jul", 1_785_400_000),
      mirrorTx("jun", 1_782_800_000),
    ];
    __setFinykMonoMirrorCacheForTests({ transactions: history });

    const { result } = renderHook(() => useRecurringHistory());

    expect(result.current.map((tx) => tx.id)).toEqual(["aug", "jul", "jun"]);
  });

  it("follows mirror refreshes", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [mirrorTx("one", 1_788_000_000)],
    });
    const { result } = renderHook(() => useRecurringHistory());
    expect(result.current).toHaveLength(1);

    act(() => {
      __setFinykMonoMirrorCacheForTests({
        transactions: [
          mirrorTx("one", 1_788_000_000),
          mirrorTx("two", 1_785_400_000),
        ],
      });
      notifyFinykMonoMirrorRefresh();
    });

    expect(result.current).toHaveLength(2);
  });

  // 120 днів історії = чотири повні минулі місяці + поточний: з травня
  // по серпень 2026, одним діапазоном (поточний місяць уже в дзеркалі).
  it("tops up the four completed months before the current one, once", () => {
    const fetchRange = vi.fn().mockResolvedValue([]);
    const { rerender } = renderHook(() => useRecurringHistory(fetchRange));
    rerender();

    expect(fetchRange).toHaveBeenCalledTimes(1);
    const [from, to] = fetchRange.mock.calls[0] as [string, string];
    expect(new Date(from).toISOString()).toBe("2026-04-30T21:00:00.000Z");
    expect(new Date(to).toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("works without a range loader and swallows a failed top-up", async () => {
    expect(() => renderHook(() => useRecurringHistory())).not.toThrow();

    const fetchRange = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useRecurringHistory(fetchRange));
    await Promise.resolve();
    expect(result.current).toEqual([]);
  });
});
