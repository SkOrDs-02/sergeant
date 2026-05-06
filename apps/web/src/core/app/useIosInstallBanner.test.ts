// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * Wave-1 PR-07 — iOS arm of the PWA-install funnel.
 *
 * Перевіряємо, що `useIosInstallBanner` емітить
 * `pwa_install_prompted` (surface=ios) при першій появі банера,
 * `pwa_install_dismissed` (surface=ios, via=banner) при close — і не
 * стріляє повторно після перемонтування, якщо локальний `dismissed`-флаг
 * вже виставлений.
 */

const trackEventMock = vi.fn();
vi.mock("../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import { useIosInstallBanner } from "./useIosInstallBanner";

const ORIGINAL_USER_AGENT = navigator.userAgent;
const ORIGINAL_PLATFORM = navigator.platform;

function spoofIos() {
  Object.defineProperty(navigator, "userAgent", {
    value:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    configurable: true,
  });
  Object.defineProperty(navigator, "platform", {
    value: "iPhone",
    configurable: true,
  });
}

function restoreUa() {
  Object.defineProperty(navigator, "userAgent", {
    value: ORIGINAL_USER_AGENT,
    configurable: true,
  });
  Object.defineProperty(navigator, "platform", {
    value: ORIGINAL_PLATFORM,
    configurable: true,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  trackEventMock.mockReset();
  window.localStorage.clear();
  spoofIos();
  // jsdom не реалізує `display-mode: standalone` за замовчуванням; явно
  // повертаємо `matches: false`, щоб гілка `isStandalone` була false.
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
});

afterEach(() => {
  vi.useRealTimers();
  restoreUa();
});

describe("useIosInstallBanner — telemetry", () => {
  it("на iOS показує банер за 3с і стріляє pwa_install_prompted один раз", () => {
    const { rerender } = renderHook(() => useIosInstallBanner());
    expect(trackEventMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(trackEventMock).toHaveBeenCalledWith("pwa_install_prompted", {
      surface: "ios",
    });
    // Re-render не дублює imp-event.
    rerender();
    expect(
      trackEventMock.mock.calls.filter(
        ([name]) => name === "pwa_install_prompted",
      ),
    ).toHaveLength(1);
  });

  it("dismiss() емітить pwa_install_dismissed (ios, banner) і пише ls-флаг", () => {
    const { result } = renderHook(() => useIosInstallBanner());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(trackEventMock).toHaveBeenCalledWith("pwa_install_dismissed", {
      surface: "ios",
      via: "banner",
    });
    expect(window.localStorage.getItem("ios_install_banner_dismissed")).toBe(
      "1",
    );
  });

  it("якщо ls-флаг вже виставлений → банер не показується і impression-event не стріляє", () => {
    window.localStorage.setItem("ios_install_banner_dismissed", "1");
    renderHook(() => useIosInstallBanner());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(trackEventMock).not.toHaveBeenCalled();
  });
});
