// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDayRollover } from "./useDayRollover";

/**
 * Детектор переходу доби ПРИСТРОЮ (ADR-0078, cutover 2026-09-01 — раніше
 * стежив за київською північчю, LOG-3). Часові мітки задані як UTC-інстанти;
 * vitest пінить `TZ=UTC` (`apps/web/vitest.config.js`), тож для цих тестів
 * «пристрій» — це і є UTC, і межа доби рівно опівночі UTC.
 */
const DEVICE_2359 = "2026-08-17T23:59:00Z"; // 17 серпня 23:59 (пристрій)
const DEVICE_0007 = "2026-08-18T00:07:00Z"; // 18 серпня 00:07 (пристрій)
const DEVICE_2300 = "2026-08-17T23:00:00Z"; // 17 серпня 23:00 (пристрій)

describe("useDayRollover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("повідомляє про нову добу з попереднім ключем", () => {
    vi.setSystemTime(new Date(DEVICE_2359));
    const onRollover = vi.fn();
    renderHook(() => useDayRollover(onRollover));

    expect(onRollover).not.toHaveBeenCalled();

    act(() => {
      vi.setSystemTime(new Date(DEVICE_0007));
      vi.advanceTimersByTime(8 * 60 * 1000);
    });

    expect(onRollover).toHaveBeenCalledTimes(1);
    expect(onRollover).toHaveBeenCalledWith("2026-08-17");
  });

  it("мовчить, поки доба не змінилась", () => {
    vi.setSystemTime(new Date(DEVICE_2300));
    const onRollover = vi.fn();
    renderHook(() => useDayRollover(onRollover));

    act(() => {
      vi.setSystemTime(new Date(DEVICE_2359));
      vi.advanceTimersByTime(59 * 60 * 1000);
    });

    expect(onRollover).not.toHaveBeenCalled();
  });

  it("ловить перехід при поверненні у вкладку, навіть якщо таймер спав", () => {
    // iOS Safari присипляє таймери у фоні — прокидаємось без жодного тика.
    vi.setSystemTime(new Date(DEVICE_2300));
    const onRollover = vi.fn();
    renderHook(() => useDayRollover(onRollover));

    act(() => {
      vi.setSystemTime(new Date(DEVICE_0007));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onRollover).toHaveBeenCalledWith("2026-08-17");
  });

  it("повідомляє рівно один раз на одну добу", () => {
    vi.setSystemTime(new Date(DEVICE_2359));
    const onRollover = vi.fn();
    renderHook(() => useDayRollover(onRollover));

    act(() => {
      vi.setSystemTime(new Date(DEVICE_0007));
      vi.advanceTimersByTime(8 * 60 * 1000);
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });

    expect(onRollover).toHaveBeenCalledTimes(1);
  });

  it("знімає слухачі й таймер після unmount", () => {
    vi.setSystemTime(new Date(DEVICE_2359));
    const onRollover = vi.fn();
    const { unmount } = renderHook(() => useDayRollover(onRollover));

    unmount();

    act(() => {
      vi.setSystemTime(new Date(DEVICE_0007));
      vi.advanceTimersByTime(8 * 60 * 1000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onRollover).not.toHaveBeenCalled();
  });
});
