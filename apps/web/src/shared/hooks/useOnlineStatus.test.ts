// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
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

  // Regression: founder report 2026-07-31 — «Асистент пише недоступний».
  // iOS Safari / PWA / Capacitor WebViews latch `navigator.onLine === false`
  // after a radio handover and never fire the matching `online` event, so the
  // HubChat composer stayed disabled on a working LTE connection.
  describe("stuck navigator.onLine (reachability probe)", () => {
    it("flips back to online when the server answers despite navigator.onLine=false", async () => {
      setNavigatorOnLine(false);
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      const { result } = renderHook(() => useOnlineStatus());
      // First paint still trusts the platform — no flash of wrong capability.
      expect(result.current).toBe(false);

      await waitFor(() => expect(result.current).toBe(true));
      expect(fetchMock).toHaveBeenCalled();
    });

    it("probes in no-cors mode so the cross-origin API deploy can answer", async () => {
      // Prod topology is web-on-Vercel + API-on-Coolify, and the server mounts
      // CORS on `/api` only while `/livez` sits at the app root. A CORS-mode
      // request would be rejected by the browser and this hook would report
      // offline on a healthy connection.
      setNavigatorOnLine(false);
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));

      const { result } = renderHook(() => useOnlineStatus());
      await waitFor(() => expect(result.current).toBe(true));

      const init = fetchMock.mock.calls[0]?.[1];
      expect(init).toMatchObject({ mode: "no-cors", cache: "no-store" });
    });

    it("treats any HTTP answer as proof of connectivity, including 503", async () => {
      setNavigatorOnLine(false);
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 503 }),
      );

      const { result } = renderHook(() => useOnlineStatus());
      await waitFor(() => expect(result.current).toBe(true));
    });

    it("stays offline when the probe cannot reach the server", async () => {
      setNavigatorOnLine(false);
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new TypeError("Failed to fetch"),
      );

      const { result } = renderHook(() => useOnlineStatus());
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      expect(result.current).toBe(false);
    });

    it("does not probe at all while navigator.onLine is true", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      renderHook(() => useOnlineStatus());
      await Promise.resolve();
      expect(fetchMock).not.toHaveBeenCalled();
    });
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
