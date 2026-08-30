// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * Wave-1 PR-07 — PWA install funnel telemetry guard.
 *
 * Перевіряємо, що `usePwaInstall` емітить
 * `PWA_INSTALL_PROMPTED → PWA_INSTALL_{ACCEPTED|DISMISSED} → PWA_INSTALLED`
 * у правильних точках, а також що банер зʼявляється тільки після
 * 30-секундного gate-у + ≥ 2 сесій (як було до PR-07). Перевіряємо
 * `appinstalled` як термінальну подію funnel-у — стріляє НЕЗАЛЕЖНО від того,
 * чи юзер прийшов з банера, чи натиснув native browser-prompt.
 */

const trackEventMock = vi.fn();
vi.mock("../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import { usePwaInstall } from "./usePwaInstall";

interface MockBeforeInstallPromptEvent extends Event {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function makePromptEvent(
  outcome: "accepted" | "dismissed",
): MockBeforeInstallPromptEvent {
  const evt = new Event("beforeinstallprompt") as MockBeforeInstallPromptEvent;
  evt.prompt = vi.fn().mockResolvedValue(undefined);
  evt.userChoice = Promise.resolve({ outcome });
  return evt;
}

beforeEach(() => {
  vi.useFakeTimers();
  trackEventMock.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePwaInstall — banner gate", () => {
  it("не виставляє canInstall за 1 сесію навіть із prompt-ом", () => {
    const { result } = renderHook(() => usePwaInstall());
    act(() => {
      window.dispatchEvent(makePromptEvent("accepted"));
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.canInstall).toBe(false);
    expect(trackEventMock).not.toHaveBeenCalledWith(
      "pwa_install_prompted",
      expect.anything(),
    );
  });

  it("після 2 сесій + 30 c таймера → canInstall=true і pwa_install_prompted емітиться один раз", () => {
    // Емулюємо warm-start (counter уже на 1 з попереднього запуску), щоб
    // другий монтаж одразу пройшов MIN_SESSIONS-гейт без додаткового
    // паралельно-живого хука у тесті.
    window.localStorage.setItem("pwa_session_count", "1");
    const { result, rerender } = renderHook(() => usePwaInstall());
    act(() => {
      window.dispatchEvent(makePromptEvent("accepted"));
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    rerender();
    expect(result.current.canInstall).toBe(true);
    expect(trackEventMock).toHaveBeenCalledWith("pwa_install_prompted", {
      surface: "android",
    });
    // Idempotent — подальші ре-render-и не додають нових imp-подій
    // (`promptedRef` блокує дублі всередині однієї інстанції).
    const before = trackEventMock.mock.calls.filter(
      ([name]) => name === "pwa_install_prompted",
    ).length;
    rerender();
    rerender();
    expect(
      trackEventMock.mock.calls.filter(
        ([name]) => name === "pwa_install_prompted",
      ),
    ).toHaveLength(before);
  });
});

describe("usePwaInstall — install / dismiss telemetry", () => {
  async function readyHook() {
    window.localStorage.setItem("pwa_session_count", "1");
    return renderHook(() => usePwaInstall());
  }

  it("install() з outcome accepted → pwa_install_accepted, без dismiss-події", async () => {
    const hook = await readyHook();
    act(() => {
      window.dispatchEvent(makePromptEvent("accepted"));
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    await act(async () => {
      await hook.result.current.install();
    });
    const names = trackEventMock.mock.calls.map(([n]) => n);
    expect(names).toContain("pwa_install_accepted");
    expect(names).not.toContain("pwa_install_dismissed");
  });

  it("install() з outcome dismissed → pwa_install_dismissed з via=chooser", async () => {
    const hook = await readyHook();
    act(() => {
      window.dispatchEvent(makePromptEvent("dismissed"));
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    await act(async () => {
      await hook.result.current.install();
    });
    expect(trackEventMock).toHaveBeenCalledWith("pwa_install_dismissed", {
      surface: "android",
      via: "chooser",
    });
  });

  it("dismiss() (натиск на X у банері) → pwa_install_dismissed з via=banner + persist", async () => {
    const hook = await readyHook();
    act(() => {
      window.dispatchEvent(makePromptEvent("accepted"));
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    act(() => {
      hook.result.current.dismiss();
    });
    expect(trackEventMock).toHaveBeenCalledWith("pwa_install_dismissed", {
      surface: "android",
      via: "banner",
    });
    expect(window.localStorage.getItem("pwa_install_dismissed")).toBe("1");
  });
});

describe("usePwaInstall — appinstalled event", () => {
  it("стріляє pwa_installed незалежно від банера", () => {
    renderHook(() => usePwaInstall());
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(trackEventMock).toHaveBeenCalledWith("pwa_installed", {
      surface: "android",
      via: "appinstalled",
    });
  });
});

/**
 * Success-плече для платформ без `appinstalled` (аудит телеметрії 2026-08-16).
 * До цього `pwa_installed` не спрацював жодного разу за весь час життя
 * проєкту: подія висіла на Chromium-only event-і, а вся база — iOS Safari.
 */
describe("usePwaInstall — standalone detection (iOS success arm)", () => {
  const originalUserAgent = navigator.userAgent;

  // jsdom не реалізує `matchMedia`, тож `vi.spyOn` тут не працює (нема що
  // підміняти) — визначаємо властивість напряму й прибираємо після тесту.
  function stubStandalone(matches: boolean) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches: matches && query === "(display-mode: standalone)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    });
  }

  // iOS Safari не підтримує `display-mode: standalone` і має власний
  // прапорець. Це і є цільова платформа фіксу, тож шлях мусить бути покритий
  // окремо від media-query-гілки.
  function stubIosStandalone() {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
  }

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    delete (navigator as { standalone?: unknown }).standalone;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
  });

  it("не стріляє pwa_installed у звичайній вкладці браузера", () => {
    stubStandalone(false);
    renderHook(() => usePwaInstall());
    expect(trackEventMock.mock.calls.map(([n]) => n)).not.toContain(
      "pwa_installed",
    );
  });

  it("зараховує інсталяцію на першому запуску в standalone", () => {
    stubStandalone(true);
    renderHook(() => usePwaInstall());
    expect(trackEventMock).toHaveBeenCalledWith("pwa_installed", {
      surface: "android",
      via: "standalone_detected",
    });
    expect(window.localStorage.getItem("pwa_install_reported")).toBe("1");
  });

  it("не дублює подію на наступних запусках з іконки", () => {
    stubStandalone(true);
    renderHook(() => usePwaInstall());
    trackEventMock.mockReset();
    // Другий «запуск» застосунку — той самий storage, новий монтаж хука.
    renderHook(() => usePwaInstall());
    expect(trackEventMock.mock.calls.map(([n]) => n)).not.toContain(
      "pwa_installed",
    );
  });

  it("зараховує інсталяцію на iOS через navigator.standalone", () => {
    // Без media-query взагалі — рівно те, що бачить Safari.
    stubIosStandalone();
    renderHook(() => usePwaInstall());
    expect(trackEventMock).toHaveBeenCalledWith("pwa_installed", {
      surface: "ios",
      via: "standalone_detected",
    });
  });

  it("не зараховує інсталяцію на iOS у звичайній вкладці Safari", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: false,
    });
    renderHook(() => usePwaInstall());
    expect(trackEventMock.mock.calls.map(([n]) => n)).not.toContain(
      "pwa_installed",
    );
  });

  it("не дублює, коли слідом за standalone-стартом приходить appinstalled", () => {
    stubStandalone(true);
    renderHook(() => usePwaInstall());
    const before = trackEventMock.mock.calls.filter(
      ([n]) => n === "pwa_installed",
    ).length;
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(
      trackEventMock.mock.calls.filter(([n]) => n === "pwa_installed"),
    ).toHaveLength(before);
  });
});
