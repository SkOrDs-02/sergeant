// @vitest-environment jsdom
/**
 * Фз-1 (OD-28): екран не гасне під час активної сесії. Перевіряємо, що
 * блокування береться лише коли увімкнено, відпускається при розмонтуванні,
 * береться знову після повернення на вкладку (браузер знімає його сам) і що
 * відмова браузера не кидає далі.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  isScreenWakeLockSupported,
  useScreenWakeLock,
} from "./useScreenWakeLock";

type FakeSentinel = { released: boolean; release: () => Promise<void> };

function makeSentinel(): FakeSentinel {
  const s: FakeSentinel = {
    released: false,
    release: vi.fn(async () => {
      s.released = true;
    }),
  };
  return s;
}

let request: ReturnType<typeof vi.fn>;
let sentinels: FakeSentinel[];

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  sentinels = [];
  request = vi.fn(async () => {
    const s = makeSentinel();
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
});

afterEach(() => {
  // `delete` повертає navigator до стану без API для решти файлів.
  delete (navigator as unknown as Record<string, unknown>)["wakeLock"];
});

describe("useScreenWakeLock", () => {
  it("reports support only when navigator.wakeLock.request exists", () => {
    expect(isScreenWakeLockSupported()).toBe(true);
    delete (navigator as unknown as Record<string, unknown>)["wakeLock"];
    expect(isScreenWakeLockSupported()).toBe(false);
  });

  it("requests a screen lock when enabled and releases it on unmount", async () => {
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    expect(sentinels).toHaveLength(1);
    unmount();
    await flush();
    expect(sentinels[0]!.release).toHaveBeenCalled();
  });

  it("does nothing when disabled", async () => {
    renderHook(() => useScreenWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it("releases when the toggle turns off mid-session", async () => {
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useScreenWakeLock(on),
      { initialProps: { on: true } },
    );
    await flush();
    rerender({ on: false });
    await flush();
    expect(sentinels[0]!.release).toHaveBeenCalled();
  });

  it("re-acquires after the tab becomes visible again (the browser drops it on hide)", async () => {
    renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    // Браузер сам знімає блокування при схованій вкладці.
    sentinels[0]!.released = true;
    act(() => setVisibility("hidden"));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    act(() => setVisibility("visible"));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("swallows a rejected request (low battery, policy) without throwing", async () => {
    request.mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError"),
    );
    // Відхилений запит не має вилетіти назовні (unhandled rejection уронив
    // би тест-ран) і не має ламати рендер.
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow();
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does nothing where the API is missing", async () => {
    delete (navigator as unknown as Record<string, unknown>)["wakeLock"];
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await flush();
    unmount();
    expect(request).not.toHaveBeenCalled();
  });
});
