// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * Wave-1 PR-07 — PWA install funnel telemetry guard.
 *
 * Перевіряємо, що `usePwaInstall` емітить
 * `PWA_INSTALL_PROMPTED → PWA_INSTALL_{ACCEPTED|DISMISSED} → PWA_INSTALLED`
 * у правильних точках, а також що банер з'являється тільки після
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
    expect(trackEventMock).toHaveBeenCalledWith("pwa_installed", {});
  });
});
