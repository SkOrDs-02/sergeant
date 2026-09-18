// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * Wave-1 PR-07 — iOS arm of the PWA-install funnel.
 *
 * Перевіряємо, що `useIosInstallBanner` емітить
 * `pwa_install_prompted` (surface=ios) при першій появі банера,
 * `pwa_install_dismissed` (surface=ios, via=banner) при
 * `dismissForever()` — і не стріляє повторно після перемонтування, якщо
 * локальний `dismissed`-флаг вже виставлений.
 *
 * Founder-ux-review round 2 (O2) додає другу гілку — `snooze()` — яка НЕ
 * пише постійний прапорець: банер повертається через 30 днів, до
 * `INSTALL_BANNER_MAX_SNOOZES` разів.
 */

const trackEventMock = vi.fn();
vi.mock("../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import { useIosInstallBanner } from "./useIosInstallBanner";
import { INSTALL_BANNER_SNOOZE_MS } from "./installBannerSnooze";

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

  it("dismissForever() емітить pwa_install_dismissed (ios, banner) і пише постійний ls-флаг", () => {
    const { result } = renderHook(() => useIosInstallBanner());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      result.current.dismissForever();
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

describe("useIosInstallBanner — snooze (founder-ux-review round 2, O2)", () => {
  it("snooze() ховає банер, але НЕ пише постійний dismissed-флаг", () => {
    const { result } = renderHook(() => useIosInstallBanner());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      result.current.snooze();
    });
    expect(result.current.visible).toBe(false);
    expect(trackEventMock).toHaveBeenCalledWith("pwa_install_dismissed", {
      surface: "ios",
      via: "banner_snooze",
    });
    // Regression guard: before the O2 fix, both dismiss affordances wrote
    // the SAME permanent flag — this must stay untouched by snooze().
    expect(
      window.localStorage.getItem("ios_install_banner_dismissed"),
    ).toBeNull();
  });

  it("одразу після snooze() банер не зʼявляється знову на новому монтажі", () => {
    const first = renderHook(() => useIosInstallBanner());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      first.result.current.snooze();
    });
    first.unmount();
    // The first mount legitimately fired its own `pwa_install_prompted`
    // before snoozing — reset so the assertion below is only about the
    // SECOND mount's behaviour.
    trackEventMock.mockClear();

    renderHook(() => useIosInstallBanner());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // No second `pwa_install_prompted` — the banner never became visible
    // again within the snooze window.
    expect(
      trackEventMock.mock.calls.filter(
        ([name]) => name === "pwa_install_prompted",
      ),
    ).toHaveLength(0);
  });

  it("банер повертається після 30 днів снузу", () => {
    const first = renderHook(() => useIosInstallBanner());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      first.result.current.snooze();
    });
    first.unmount();
    trackEventMock.mockClear();

    // Fake timers mock `Date` too, so advancing the clock past the snooze
    // window is enough — the gate reads `Date.now()` directly.
    act(() => {
      vi.advanceTimersByTime(INSTALL_BANNER_SNOOZE_MS + 1000);
    });

    renderHook(() => useIosInstallBanner());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(
      trackEventMock.mock.calls.filter(
        ([name]) => name === "pwa_install_prompted",
      ),
    ).toHaveLength(1);
  });
});
