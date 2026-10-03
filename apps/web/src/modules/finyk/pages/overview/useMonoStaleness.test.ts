/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useMonoStaleness } from "./useMonoStaleness";

const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 60 * 60 * 1000;

describe("useMonoStaleness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("перетинає поріг на змонтованій сторінці, без жодної зміни даних синку", () => {
    // РЕГРЕСІЯ. Перша версія рахувала staleness у `useMemo` з
    // залежностями лише від sync-метаданих. Поки банк мовчить, вони не
    // змінюються — сама їх незмінність і є умовою детекції, — тож
    // значення з 6-го дня лишалось у кеші назавжди і банер не зʼявлявся
    // саме тоді, заради чого написаний.
    //
    // Асерт робить це неможливим: пропси НЕ чіпаємо взагалі, рухаємо
    // тільки годинник. Якщо хук знову перестане залежати від часу,
    // `stale` лишиться false і тест впаде.
    const lastEventAt = new Date(Date.now() - 6 * DAY_MS).toISOString();

    const { result } = renderHook(() =>
      useMonoStaleness({ lastEventAt, webhookActive: true, tickMs: TICK_MS }),
    );

    expect(result.current).toEqual({ stale: false, days: 6 });

    // Доба вперед — рівно на поріг. Жодного rerender із новими пропсами.
    act(() => {
      vi.advanceTimersByTime(DAY_MS);
    });

    expect(result.current).toEqual({ stale: true, days: 7 });
  });

  it("не перемикається завчасно на проміжних тіках", () => {
    // Захист від протилежної помилки — «тікає, отже показуємо».
    const lastEventAt = new Date(Date.now() - 6 * DAY_MS).toISOString();
    const { result } = renderHook(() =>
      useMonoStaleness({ lastEventAt, webhookActive: true, tickMs: TICK_MS }),
    );

    act(() => {
      vi.advanceTimersByTime(TICK_MS * 5);
    });

    expect(result.current.stale).toBe(false);
  });

  it("прибирає інтервал при розмонтуванні", () => {
    const clearSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = renderHook(() =>
      useMonoStaleness({
        lastEventAt: new Date().toISOString(),
        webhookActive: true,
        tickMs: TICK_MS,
      }),
    );
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
