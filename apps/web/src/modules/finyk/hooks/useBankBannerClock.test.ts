// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBankBannerClock } from "./useBankBannerClock";

const DAY = 24 * 60 * 60 * 1000;

describe("useBankBannerClock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("не оновлює час без подій, поки snooze не закінчився", () => {
    const { result } = renderHook(() => useBankBannerClock("overview", null));
    const t0 = result.current;
    vi.setSystemTime(t0 + 3 * DAY);
    expect(result.current).toBe(t0);
  });

  it("оновлює час при поверненні на Огляд", () => {
    const { result, rerender } = renderHook(
      ({ page }) => useBankBannerClock(page, null),
      { initialProps: { page: "overview" } },
    );
    const t0 = result.current;
    rerender({ page: "transactions" });
    vi.setSystemTime(t0 + 8 * DAY);
    expect(result.current).toBe(t0);
    rerender({ page: "overview" });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(t0 + 8 * DAY);
  });

  it("оновлює час на visibilitychange у visible", () => {
    const { result } = renderHook(() => useBankBannerClock("overview", null));
    const t0 = result.current;
    vi.setSystemTime(t0 + 8 * DAY);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(t0 + 8 * DAY);
  });

  it("таймер спрацьовує рівно на залишок snooze, без інтервалу", () => {
    const { result } = renderHook(() =>
      useBankBannerClock("overview", Date.now()),
    );
    const t0 = result.current;
    act(() => {
      vi.advanceTimersByTime(7 * DAY - 1);
    });
    expect(result.current).toBe(t0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(t0 + 7 * DAY);
  });
});
