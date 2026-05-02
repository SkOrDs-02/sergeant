// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smoke-тест навколо `trackEvent`:
 *   1. Подія потрапляє у localStorage ring-buffer і на `window.__hubAnalytics`.
 *   2. Подія форвардиться у `capturePostHogEvent` (PostHog transport).
 *   3. Некоректні входи (не-рядкове імʼя) ігноруються без шуму.
 */

const capturePostHogEvent = vi.fn();

vi.mock("./posthog", () => ({
  capturePostHogEvent,
  initPostHog: vi.fn(),
  identifyPostHogUser: vi.fn(),
  resetPostHog: vi.fn(),
}));

beforeEach(() => {
  capturePostHogEvent.mockReset();
  localStorage.clear();
  const w = window as Window & { __hubAnalytics?: unknown[] };
  delete w.__hubAnalytics;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("trackEvent", () => {
  it("пише подію у localStorage і window.__hubAnalytics", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("demo_event", { foo: "bar" });

    const raw = localStorage.getItem("hub_analytics_log_v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      eventName: "demo_event",
      payload: { foo: "bar" },
    });
    expect(parsed[0].timestamp).toEqual(expect.any(String));

    const w = window as Window & { __hubAnalytics?: unknown[] };
    expect(w.__hubAnalytics).toHaveLength(1);
  });

  it("форвардить подію у PostHog transport", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("hub_opened", { source: "fab" });

    expect(capturePostHogEvent).toHaveBeenCalledWith("hub_opened", {
      source: "fab",
    });
  });

  it("ігнорує виклики без name", async () => {
    const { trackEvent } = await import("./analytics");
    // Runtime-guard: порожній рядок / не-рядок — no-op. Сигнатура
    // `trackEvent` не типізована (JS-compatible), тому передаємо як є.
    trackEvent("");
    trackEvent(null as unknown as string);

    expect(capturePostHogEvent).not.toHaveBeenCalled();
    expect(localStorage.getItem("hub_analytics_log_v1")).toBeNull();
  });

  it("нормалізує не-object payload у порожній обʼєкт", async () => {
    const { trackEvent } = await import("./analytics");
    // Runtime-coerce: не-object payload повинен стати {}.
    trackEvent(
      "weird_payload",
      "not-an-object" as unknown as Record<string, unknown>,
    );

    expect(capturePostHogEvent).toHaveBeenCalledWith("weird_payload", {});
  });

  it("викид із PostHog transport не пропагується у викликача", () => {
    // `trackEvent` контракт у шапці файлу: "ніколи не кидає". Якщо
    // `capturePostHogEvent` чомусь throw-не — onboarding/finyk hooks не
    // мають впасти. Регресія на Devin Review finding на #972.
    capturePostHogEvent.mockImplementationOnce(() => {
      throw new Error("posthog explosion");
    });
    return import("./analytics").then(({ trackEvent }) => {
      expect(() => trackEvent("safe_event", { foo: 1 })).not.toThrow();
      // localStorage-шлях лишається працездатним і пише подію навіть
      // коли PostHog transport вибухнув.
      const raw = localStorage.getItem("hub_analytics_log_v1");
      expect(raw).toBeTruthy();
    });
  });
});
