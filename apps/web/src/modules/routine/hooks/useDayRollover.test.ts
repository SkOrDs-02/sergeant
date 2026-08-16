// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDayRollover } from "./useDayRollover";

/**
 * Детектор переходу київської доби. Часові мітки задані як UTC-інстанти,
 * щоб тест не залежав від таймзони хоста: у серпні Київ = UTC+3.
 */
const KYIV_2359 = "2026-08-17T20:59:00Z"; // 17 серпня 23:59
const KYIV_0007 = "2026-08-17T21:07:00Z"; // 18 серпня 00:07
const KYIV_2300 = "2026-08-17T20:00:00Z"; // 17 серпня 23:00

describe("useDayRollover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("повідомляє про нову добу з попереднім ключем", () => {
    vi.setSystemTime(new Date(KYIV_2359));
    const onRollover = vi.fn();
    renderHook(() => useDayRollover(onRollover));

    expect(onRollover).not.toHaveBeenCalled();

    act(() => {
      vi.setSystemTime(new Date(KYIV_0007));
      vi.advanceTimersByTime(8 * 60 * 1000);
    });

    expect(onRollover).toHaveBeenCalledTimes(1);
    expect(onRollover).toHaveBeenCalledWith("2026-08-17");
  });

  it("мовчить, поки доба не змінилась", () => {
    vi.setSystemTime(new Date(KYIV_2300));
    const onRollover = vi.fn();
    renderHook(() => useDayRollover(onRollover));

    act(() => {
      vi.setSystemTime(new Date(KYIV_2359));
      vi.advanceTimersByTime(59 * 60 * 1000);
    });

    expect(onRollover).not.toHaveBeenCalled();
  });

  it("ловить перехід при поверненні у вкладку, навіть якщо таймер спав", () => {
    // iOS Safari присипляє таймери у фоні — прокидаємось без жодного тика.
    vi.setSystemTime(new Date(KYIV_2300));
    const onRollover = vi.fn();
    renderHook(() => useDayRollover(onRollover));

    act(() => {
      vi.setSystemTime(new Date(KYIV_0007));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onRollover).toHaveBeenCalledWith("2026-08-17");
  });

  it("повідомляє рівно один раз на одну добу", () => {
    vi.setSystemTime(new Date(KYIV_2359));
    const onRollover = vi.fn();
    renderHook(() => useDayRollover(onRollover));

    act(() => {
      vi.setSystemTime(new Date(KYIV_0007));
      vi.advanceTimersByTime(8 * 60 * 1000);
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });

    expect(onRollover).toHaveBeenCalledTimes(1);
  });

  it("знімає слухачі й таймер після unmount", () => {
    vi.setSystemTime(new Date(KYIV_2359));
    const onRollover = vi.fn();
    const { unmount } = renderHook(() => useDayRollover(onRollover));

    unmount();

    act(() => {
      vi.setSystemTime(new Date(KYIV_0007));
      vi.advanceTimersByTime(8 * 60 * 1000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onRollover).not.toHaveBeenCalled();
  });
});
