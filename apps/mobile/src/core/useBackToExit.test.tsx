/**
 * Tests for `useBackToExit` — Android hardware-back parity hook.
 *
 * The hook mirrors the Capacitor shell's 2-tap-to-exit interaction
 * (`apps/mobile-shell/src/index.ts:435`). We mock the
 * `react-native` `BackHandler`, `Platform`, and `ToastAndroid` plus
 * `expo-router`'s `useRouter` to assert the four code paths:
 *
 * 1. iOS — listener is never registered.
 * 2. Android, can-go-back — first tap pops the route and consumes
 *    the event (returns `true`).
 * 3. Android, root, first tap — toast shown, event consumed.
 * 4. Android, root, second tap within window — event returned
 *    `false` so React Native's default `exitApp()` runs.
 */

import { renderHook } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockToastShow = jest.fn();
const mockAddListener = jest.fn();
const mockRemove = jest.fn();

jest.mock("react-native", () => {
  const Platform = { OS: "android" };
  return {
    __esModule: true,
    Platform,
    BackHandler: {
      addEventListener: (event: string, handler: () => boolean) => {
        mockAddListener(event, handler);
        return { remove: mockRemove };
      },
    },
    ToastAndroid: {
      SHORT: 0,
      LONG: 1,
      show: (...args: unknown[]) => mockToastShow(...args),
    },
  };
});

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack(),
  }),
}));

import { Platform } from "react-native";

import { BACK_TO_EXIT_WINDOW_MS, useBackToExit } from "./useBackToExit";

beforeEach(() => {
  mockBack.mockReset();
  mockCanGoBack.mockReset().mockReturnValue(false);
  mockToastShow.mockReset();
  mockAddListener.mockReset();
  mockRemove.mockReset();
  (Platform as { OS: string }).OS = "android";
});

describe("useBackToExit", () => {
  it("does NOT register a listener on iOS", () => {
    (Platform as { OS: string }).OS = "ios";
    renderHook(() => useBackToExit());
    expect(mockAddListener).not.toHaveBeenCalled();
  });

  it("registers a hardwareBackPress listener on Android", () => {
    renderHook(() => useBackToExit());
    expect(mockAddListener).toHaveBeenCalledTimes(1);
    const [event] = mockAddListener.mock.calls[0]!;
    expect(event).toBe("hardwareBackPress");
  });

  it("pops the navigation stack when router.canGoBack() returns true", () => {
    mockCanGoBack.mockReturnValue(true);
    renderHook(() => useBackToExit());
    const handler = mockAddListener.mock.calls[0]![1] as () => boolean;

    const consumed = handler();

    expect(consumed).toBe(true);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it("first tap at root: shows toast and consumes the event", () => {
    mockCanGoBack.mockReturnValue(false);
    renderHook(() => useBackToExit());
    const handler = mockAddListener.mock.calls[0]![1] as () => boolean;

    const consumed = handler();

    expect(consumed).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledTimes(1);
    expect(mockToastShow.mock.calls[0]?.[0]).toMatch(/Натисніть «Назад»/);
  });

  it("second tap at root inside the window: returns false so RN exits the app", () => {
    mockCanGoBack.mockReturnValue(false);
    const realDateNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;

    try {
      renderHook(() => useBackToExit());
      const handler = mockAddListener.mock.calls[0]![1] as () => boolean;

      const first = handler();
      now += BACK_TO_EXIT_WINDOW_MS - 50;
      const second = handler();

      expect(first).toBe(true);
      expect(second).toBe(false);
      // Only one toast — the second tap exits without re-toasting.
      expect(mockToastShow).toHaveBeenCalledTimes(1);
    } finally {
      Date.now = realDateNow;
    }
  });

  it("second tap AFTER the window expires: re-arms (toast + consume) instead of exiting", () => {
    mockCanGoBack.mockReturnValue(false);
    const realDateNow = Date.now;
    let now = 2_000_000;
    Date.now = () => now;

    try {
      renderHook(() => useBackToExit());
      const handler = mockAddListener.mock.calls[0]![1] as () => boolean;

      const first = handler();
      now += BACK_TO_EXIT_WINDOW_MS + 50;
      const second = handler();

      expect(first).toBe(true);
      expect(second).toBe(true);
      // Toast fired twice — the timer reset re-armed the hint.
      expect(mockToastShow).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realDateNow;
    }
  });

  it("unmount removes the listener", () => {
    const { unmount } = renderHook(() => useBackToExit());
    unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
