/**
 * Tests for the native-push dynamic-import gate.
 *
 * `subscribeNativePush` / `unsubscribeNativePush` / `getStoredNativePushToken`
 * resolve to `null` outside Capacitor (the common browser case) and delegate
 * to the lazily-imported `@sergeant/mobile-shell/pushNative` module inside it.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const nativeMock = {
  subscribeNativePush: vi.fn(),
  unsubscribeNativePush: vi.fn(),
  getStoredNativePushToken: vi.fn(),
};

vi.mock("@sergeant/mobile-shell/pushNative", () => nativeMock);

import {
  subscribeNativePush,
  unsubscribeNativePush,
  getStoredNativePushToken,
} from "./pushNative";

function setCapacitor(enabled: boolean): void {
  (globalThis as { Capacitor?: unknown }).Capacitor = enabled
    ? { isNativePlatform: () => true, getPlatform: () => "ios" }
    : undefined;
}

afterEach(() => {
  setCapacitor(false);
  vi.clearAllMocks();
});

describe("pushNative gate (web / non-Capacitor)", () => {
  it("subscribeNativePush returns null in the browser", async () => {
    setCapacitor(false);
    await expect(subscribeNativePush()).resolves.toBeNull();
    expect(nativeMock.subscribeNativePush).not.toHaveBeenCalled();
  });

  it("unsubscribeNativePush returns null in the browser", async () => {
    setCapacitor(false);
    await expect(unsubscribeNativePush()).resolves.toBeNull();
  });

  it("getStoredNativePushToken returns null in the browser", async () => {
    setCapacitor(false);
    await expect(getStoredNativePushToken()).resolves.toBeNull();
  });
});

describe("pushNative gate (Capacitor)", () => {
  it("delegates subscribeNativePush to the native module", async () => {
    setCapacitor(true);
    nativeMock.subscribeNativePush.mockResolvedValue({
      platform: "ios",
      token: "tok-1",
    });
    await expect(subscribeNativePush()).resolves.toEqual({
      platform: "ios",
      token: "tok-1",
    });
    expect(nativeMock.subscribeNativePush).toHaveBeenCalledTimes(1);
  });

  it("delegates unsubscribeNativePush and returns the cached token", async () => {
    setCapacitor(true);
    nativeMock.unsubscribeNativePush.mockResolvedValue("tok-cached");
    await expect(unsubscribeNativePush()).resolves.toBe("tok-cached");
  });

  it("swallows native unsubscribe errors and returns null", async () => {
    setCapacitor(true);
    nativeMock.unsubscribeNativePush.mockRejectedValue(new Error("boom"));
    await expect(unsubscribeNativePush()).resolves.toBeNull();
  });

  it("delegates getStoredNativePushToken", async () => {
    setCapacitor(true);
    nativeMock.getStoredNativePushToken.mockResolvedValue("stored-tok");
    await expect(getStoredNativePushToken()).resolves.toBe("stored-tok");
  });

  it("swallows native getStoredNativePushToken errors and returns null", async () => {
    setCapacitor(true);
    nativeMock.getStoredNativePushToken.mockRejectedValue(new Error("x"));
    await expect(getStoredNativePushToken()).resolves.toBeNull();
  });
});
