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
    const { result } = renderHook(() => useFirstEntryCelebration(true));
    expect(result.current.open).toBe(false);
    expect(getTtvMock).not.toHaveBeenCalled();
  });

  it("stays closed while there is no real entry", () => {
    const { result } = renderHook(() => useFirstEntryCelebration(false));
    expect(result.current.open).toBe(false);
  });

  it("opens once when the flag flips from false to true", () => {
    const { result, rerender } = renderHook(
      ({ has }) => useFirstEntryCelebration(has),
      { initialProps: { has: false } },
    );
    expect(result.current.open).toBe(false);

    rerender({ has: true });
    expect(result.current.open).toBe(true);
    expect(result.current.ttvMs).toBe(12345);
    expect(result.current.moduleId).toBe("routine");
  });

  it("fires exactly once — closing then re-flipping does not reopen", () => {
    const { result, rerender } = renderHook(
      ({ has }) => useFirstEntryCelebration(has),
      { initialProps: { has: false } },
    );
    rerender({ has: true });
    expect(result.current.open).toBe(true);

    act(() => {
      result.current.close();
    });
    expect(result.current.open).toBe(false);

    rerender({ has: false });
    rerender({ has: true });
    expect(result.current.open).toBe(false);
  });
});
