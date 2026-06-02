// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smoke-тест навколо `trackEvent`:
 *   1. Подія потрапляє у localStorage ring-buffer і на `window.__hubAnalytics`.
 *   2. Подія форвардиться у `capturePostHogEvent` (PostHog transport).
 *   3. Некоректні входи (не-рядкове імʼя) ігноруються без шуму.
 *   4. S8 guard — console.log гейтований за DEBUG_ANALYTICS + containsPII.
 */

// Module-level mock factories — defined before any vi.mock() calls so they
// are captured in the closure correctly.
const capturePostHogEventFn = vi.fn();
const safeReadLSFn = vi.fn<(key: string) => unknown>(() => null);
const safeWriteLSFn = vi.fn<(key: string, value: unknown) => void>();
const syncEventToMemoryFn = vi.fn();

vi.mock("./posthog", () => ({
  capturePostHogEvent: capturePostHogEventFn,
  initPostHog: vi.fn(),
  identifyPostHogUser: vi.fn(),
  resetPostHog: vi.fn(),
}));

// Mock storage layer to prevent the deep import chain:
// @shared/lib/storage/storage → kvStoreBoot → @sergeant/db-schema/migrate/runner
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: safeReadLSFn,
  safeWriteLS: safeWriteLSFn,
  safeListLSKeys: vi.fn(() => []),
}));

// productMemorySync uses fetch internally; mock it so tests stay offline.
vi.mock("./productMemorySync", () => ({
  syncEventToMemory: syncEventToMemoryFn,
}));

beforeEach(() => {
  // Reset analytics module so module-level state (memoryLog, flushTimer,
  // flushListenersAttached) is fresh for every test. Must come before the
  // mock resets so the freshly imported module picks up the mock functions.
  vi.resetModules();

  capturePostHogEventFn.mockReset();
  safeReadLSFn.mockReset();
  safeReadLSFn.mockReturnValue(null);
  safeWriteLSFn.mockReset();
  syncEventToMemoryFn.mockReset();

  localStorage.clear();
  const w = window as Window & {
    __hubAnalytics?: unknown[];
    DEBUG_ANALYTICS?: boolean;
  };
  delete w.__hubAnalytics;
  delete w.DEBUG_ANALYTICS;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  const w = window as Window & { DEBUG_ANALYTICS?: boolean };
  delete w.DEBUG_ANALYTICS;
});

describe("trackEvent", () => {
  it("пише подію у memoryLog і форвардить у PostHog", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("demo_event", { foo: "bar" });

    // In DEV (vitest), window.__hubAnalytics mirrors the in-memory ring-buffer.
    const w = window as Window & { __hubAnalytics?: unknown[] };
    expect(w.__hubAnalytics).toHaveLength(1);
    expect(w.__hubAnalytics?.[0]).toMatchObject({
      eventName: "demo_event",
      payload: { foo: "bar" },
    });
  });

  it("записує у storage після debounce-flush", async () => {
    vi.useFakeTimers();
    const { trackEvent } = await import("./analytics");
    trackEvent("demo_event", { foo: "bar" });

    // Before the 500ms debounce fires, safeWriteLS is not called.
    expect(safeWriteLSFn).not.toHaveBeenCalled();

    // Advance past debounce (FLUSH_DEBOUNCE_MS = 500).
    vi.advanceTimersByTime(600);

    expect(safeWriteLSFn).toHaveBeenCalledWith(
      "hub_analytics_log_v1",
      expect.arrayContaining([
        expect.objectContaining({ eventName: "demo_event" }),
      ]),
    );
  });

  it("форвардить подію у PostHog transport", async () => {
    const { trackEvent } = await import("./analytics");
    trackEvent("hub_opened", { source: "fab" });

    expect(capturePostHogEventFn).toHaveBeenCalledWith("hub_opened", {
      source: "fab",
    });
  });

  it("ігнорує виклики без name", async () => {
    const { trackEvent } = await import("./analytics");
    // Runtime-guard: порожній рядок / не-рядок — no-op. Сигнатура
    // `trackEvent` не типізована (JS-compatible), тому передаємо як є.
    trackEvent("");
    trackEvent(null as unknown as string);

    expect(capturePostHogEventFn).not.toHaveBeenCalled();
    const w = window as Window & { __hubAnalytics?: unknown[] };
    expect(w.__hubAnalytics).toBeUndefined();
  });

  it("нормалізує не-object payload у порожній обʼєкт", async () => {
    const { trackEvent } = await import("./analytics");
    // Runtime-coerce: не-object payload повинен стати {}.
    trackEvent(
      "weird_payload",
      "not-an-object" as unknown as Record<string, unknown>,
    );

    expect(capturePostHogEventFn).toHaveBeenCalledWith("weird_payload", {});
  });

  it("логує `[analytics]` payload з вирізаним PII коли DEBUG_ANALYTICS=true (audit S2)", async () => {
    // S8: console.log is now gated behind window.DEBUG_ANALYTICS AND DEV mode.
    (window as Window & { DEBUG_ANALYTICS?: boolean }).DEBUG_ANALYTICS = true;
    vi.stubEnv("DEV", true);

    const { trackEvent } = await import("./analytics");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      trackEvent("pii_leak_guard", {
        userId: "abc",
        email: "leak@example.com",
        password: "hunter2",
      });

      // scrubPII replaces known keys (email, password) → "[redacted]".
      // containsPII then sees "[redacted]" — not a raw email pattern — so
      // the log IS emitted (scrubbing already sanitised the value).
      expect(logSpy).toHaveBeenCalledTimes(1);
      const [tag, loggedEvent] = logSpy.mock.calls[0] as [
        string,
        { eventName: string; payload: Record<string, unknown> },
      ];
      expect(tag).toBe("[analytics]");
      expect(loggedEvent.eventName).toBe("pii_leak_guard");
      // PII значення вирізані shared scrubPII (`[redacted]` sentinel).
      expect(loggedEvent.payload["email"]).toBe("[redacted]");
      expect(loggedEvent.payload["password"]).toBe("[redacted]");
      expect(loggedEvent.payload["userId"]).toBe("abc");
      expect(capturePostHogEventFn).toHaveBeenCalledWith("pii_leak_guard", {
        userId: "abc",
        email: "[redacted]",
        password: "[redacted]",
      });
    } finally {
      logSpy.mockRestore();
    }
  });

  // ── S8 acceptance tests ──────────────────────────────────────────────────
  // Card: "payload із email: 'a@b.com' не логиться"
  // Scenario: raw PII appears under an unrecognised key (scrubPII misses it
  // because it only redacts known key names). containsPII catches the raw
  // value and suppresses the console.log call entirely.
  it("S8: не логує console.log коли payload містить raw email під нерозпізнаним ключем", async () => {
    (window as Window & { DEBUG_ANALYTICS?: boolean }).DEBUG_ANALYTICS = true;
    vi.stubEnv("DEV", true);

    const { trackEvent } = await import("./analytics");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      // "userContact" is not in REDACT_KEY_NAMES, so scrubPII leaves the
      // raw email value intact. containsPII detects it and blocks the log.
      trackEvent("sign_up", {
        plan: "pro",
        userContact: "a@b.com",
      });

      expect(logSpy).not.toHaveBeenCalled();

      // The PostHog transport still receives the event; only the
      // console-breadcrumb channel is blocked by the S8 guard.
      expect(capturePostHogEventFn).toHaveBeenCalledWith("sign_up", {
        plan: "pro",
        userContact: "a@b.com",
      });
    } finally {
      logSpy.mockRestore();
    }
  });

  it("S8: не логує console.log коли payload містить raw phone під нерозпізнаним ключем", async () => {
    (window as Window & { DEBUG_ANALYTICS?: boolean }).DEBUG_ANALYTICS = true;
    vi.stubEnv("DEV", true);

    const { trackEvent } = await import("./analytics");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      trackEvent("onboarding_step", {
        step: "phone_verify",
        contact: "+380671234567",
      });

      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("S8: не логує console.log без DEBUG_ANALYTICS (prod-safe)", async () => {
    // Without DEBUG_ANALYTICS the log is always suppressed regardless of PII.
    vi.stubEnv("DEV", true);
    // DEBUG_ANALYTICS is NOT set on window.

    const { trackEvent } = await import("./analytics");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      trackEvent("page_view", { path: "/dashboard" });
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("викид із PostHog transport не пропагується у викликача", async () => {
    // `trackEvent` контракт у шапці файлу: "ніколи не кидає". Якщо
    // `capturePostHogEvent` чомусь throw-не — onboarding/finyk hooks не
    // мають впасти. Регресія на Devin Review finding на #972.
    capturePostHogEventFn.mockImplementationOnce(() => {
      throw new Error("posthog explosion");
    });
    const { trackEvent } = await import("./analytics");
    expect(() => trackEvent("safe_event", { foo: 1 })).not.toThrow();
    // In-memory ring-buffer still receives the event.
    const w = window as Window & { __hubAnalytics?: unknown[] };
    expect(w.__hubAnalytics).toHaveLength(1);
  });
});
