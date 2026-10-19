// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { useKyivDayNow } from "./useKyivDayNow";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("useKyivDayNow", () => {
  it("updates the financial day at Kyiv midnight without remounting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T20:59:59Z"));
    const { result } = renderHook(useKyivDayNow);
    expect(getKyivDayKey(result.current)).toBe("2026-10-10");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(getKyivDayKey(result.current)).toBe("2026-10-11");
  });
  it("refreshes after the browser wakes from an overnight suspension", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const { result } = renderHook(useKyivDayNow);
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(getKyivDayKey(result.current)).toBe("2026-10-11");
  });
});
