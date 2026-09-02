/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTtvMock, getModuleMock } = vi.hoisted(() => ({
  getTtvMock: vi.fn(),
  getModuleMock: vi.fn(),
}));

vi.mock("./vibePicks", () => ({ getTimeToValueMs: getTtvMock }));
vi.mock("./firstRealEntry", () => ({
  getFirstRealEntryModule: getModuleMock,
}));

import { useFirstEntryCelebration } from "./useFirstEntryCelebration";

describe("useFirstEntryCelebration", () => {
  beforeEach(() => {
    getTtvMock.mockReset().mockReturnValue(12345);
    getModuleMock.mockReset().mockReturnValue("routine");
  });

  it("does not open when the user already had real data on mount", () => {
    const { result } = renderHook(() => useFirstEntryCelebration(true, 1));
    expect(result.current.open).toBe(false);
    expect(getTtvMock).not.toHaveBeenCalled();
  });

  it("stays closed while there is no real entry", () => {
    const { result } = renderHook(() => useFirstEntryCelebration(false, 0));
    expect(result.current.open).toBe(false);
  });

  it("opens once when the flag flips from false to true with a genuine single entry", () => {
    const { result, rerender } = renderHook(
      ({ has, count }) => useFirstEntryCelebration(has, count),
      { initialProps: { has: false, count: 0 } },
    );
    expect(result.current.open).toBe(false);

    rerender({ has: true, count: 1 });
    expect(result.current.open).toBe(true);
    expect(result.current.ttvMs).toBe(12345);
    expect(result.current.moduleId).toBe("routine");
  });

  it("fires exactly once — closing then re-flipping does not reopen", () => {
    const { result, rerender } = renderHook(
      ({ has, count }) => useFirstEntryCelebration(has, count),
      { initialProps: { has: false, count: 0 } },
    );
    rerender({ has: true, count: 1 });
    expect(result.current.open).toBe(true);

    act(() => {
      result.current.close();
    });
    expect(result.current.open).toBe(false);

    rerender({ has: false, count: 0 });
    rerender({ has: true, count: 1 });
    expect(result.current.open).toBe(false);
  });

  // LOG-8 (2026-09-01 product audit, major): a device's SQLite warm caches
  // hydrate ASYNCHRONOUSLY after a sync pull — for a brand-new device on a
  // 60-day-old account, `hasRealEntry` is `false` at mount (cold cache) and
  // flips `true` once the pull lands, exactly like a genuine first entry.
  // The account's real total entry count tells them apart.
  it("does NOT open when the false→true flip is a returning device's history syncing in, not a first entry", () => {
    const { result, rerender } = renderHook(
      ({ has, count }) => useFirstEntryCelebration(has, count),
      { initialProps: { has: false, count: 0 } },
    );
    expect(result.current.open).toBe(false);

    // Pull hydration lands: 60 days of existing history arrive at once.
    rerender({ has: true, count: 87 });
    expect(result.current.open).toBe(false);
    expect(getTtvMock).not.toHaveBeenCalled();

    // Further renders (more data trickling in) must not retroactively open it.
    rerender({ has: true, count: 90 });
    expect(result.current.open).toBe(false);
  });
});
