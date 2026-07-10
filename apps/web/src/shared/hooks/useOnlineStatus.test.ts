// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOnlineStatus } from "./useOnlineStatus";

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("useOnlineStatus", () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns navigator.onLine on first render", () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("updates to false when the window fires offline", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("updates to true when the window fires online", () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("removes event listeners on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useOnlineStatus());

    const onlineHandler = addSpy.mock.calls.find(
      ([type]) => type === "online",
    )?.[1];
    const offlineHandler = addSpy.mock.calls.find(
      ([type]) => type === "offline",
    )?.[1];

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("online", onlineHandler);
    expect(removeSpy).toHaveBeenCalledWith("offline", offlineHandler);
  });
});
