// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smoke + shape тест навколо `initSentry()`:
 *   1. Після успішного init Sentry отримує два теги — `platform` і
 *      `is_capacitor` — з `@sergeant/shared`. Це потрібно для тріажу
 *      native-specific багів у RUM.
 *   2. Без `VITE_SENTRY_DSN` — повний no-op, жодного тегу.
 *
 * `@sentry/react` повністю замокано, щоб не тягнути справжній SDK і не
 * робити мережевих запитів у jsdom. `@sergeant/shared` замокано частково
 * (importActual + override) — так само, як у `bearerToken.test.ts`.
 */

const sentryInit = vi.fn();
const setTag = vi.fn();
const browserTracingIntegration = vi.fn(() => ({ name: "tracing" }));
const replayIntegration = vi.fn(() => ({ name: "replay" }));
const captureException = vi.fn();
const addBreadcrumb = vi.fn();

vi.mock("@sentry/react", () => ({
  init: sentryInit,
  setTag,
  browserTracingIntegration,
  replayIntegration,
  captureException,
  addBreadcrumb,
}));

const isCapacitorMock = vi.fn<() => boolean>();
const getPlatformMock = vi.fn<() => "ios" | "android" | "web">();

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    isCapacitor: () => isCapacitorMock(),
    getPlatform: () => getPlatformMock(),
  };
});

beforeEach(() => {
  vi.resetModules();
  sentryInit.mockReset();
  setTag.mockReset();
  browserTracingIntegration.mockClear();
  replayIntegration.mockClear();
  captureException.mockReset();
  addBreadcrumb.mockReset();
  isCapacitorMock.mockReset().mockReturnValue(false);
  getPlatformMock.mockReset().mockReturnValue("web");
  vi.stubEnv("VITE_SENTRY_DSN", "https://public@sentry.example/1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("initSentry", () => {
  it("тегує platform='web' і is_capacitor='false' у браузері", async () => {
    const { initSentry } = await import("./sentry");
    await initSentry();

    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(setTag).toHaveBeenCalledWith("platform", "web");
    expect(setTag).toHaveBeenCalledWith("is_capacitor", "false");
  });

  it("тегує реальну натив-платформу в Capacitor WebView", async () => {
    isCapacitorMock.mockReturnValue(true);
    getPlatformMock.mockReturnValue("ios");

    const { initSentry } = await import("./sentry");
    await initSentry();

    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(setTag).toHaveBeenCalledWith("platform", "ios");
    expect(setTag).toHaveBeenCalledWith("is_capacitor", "true");
  });

  it("без VITE_SENTRY_DSN — no-op, жодних тегів", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");

    const { initSentry } = await import("./sentry");
    await initSentry();

    expect(sentryInit).not.toHaveBeenCalled();
    expect(setTag).not.toHaveBeenCalled();
  });

  it("реєструє динамічний tracesSampler (а не статичний rate)", async () => {
    const { initSentry } = await import("./sentry");
    await initSentry();
    const cfg = sentryInit.mock.calls[0]?.[0];
    expect(typeof cfg.tracesSampler).toBe("function");
    // Старе поле має бути відсутнє — інакше Sentry приоритезує статичний
    // rate і ігнорує sampler.
    expect(cfg.tracesSampleRate).toBeUndefined();
  });
});

describe("setSentryTag", () => {
  it("forwards to Sentry.setTag once the SDK is initialised", async () => {
    const sentry = await import("./sentry");
    await sentry.initSentry();

    setTag.mockClear();
    sentry.setSentryTag("outbox.boot.outcome", "repaired");

    expect(setTag).toHaveBeenCalledWith("outbox.boot.outcome", "repaired");
  });

  it("is a silent no-op before init (no DSN, SDK never loaded)", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");

    const sentry = await import("./sentry");
    await sentry.initSentry();

    sentry.setSentryTag("outbox.boot.outcome", "failed");

    expect(setTag).not.toHaveBeenCalled();
  });

  it("swallows underlying SDK exceptions so callers stay unconditional", async () => {
    const sentry = await import("./sentry");
    // `initSentry` itself calls `setTag` for `platform` / `is_capacitor`,
    // so install the throwing mock *after* init succeeds — otherwise we
    // assert the wrong code path. The interesting contract is that
    // `setSentryTag` (the public, lazy-forward wrapper) never re-throws
    // its caller, even when the SDK is faulty.
    await sentry.initSentry();

    setTag.mockImplementation(() => {
      throw new Error("sentry exploded");
    });

    expect(() =>
      sentry.setSentryTag("outbox.boot.outcome", "fresh"),
    ).not.toThrow();
  });
});

describe("pickWebTracesSampleRate", () => {
  it("samples pageload at 100% (first paint)", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        { attributes: { "sentry.op": "pageload" } },
        0.05,
      ),
    ).toBe(1.0);
    expect(pickWebTracesSampleRate({ op: "pageload" }, 0.05)).toBe(1.0);
  });

  it("samples navigation at 10% (SPA route changes)", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        { attributes: { "sentry.op": "navigation" } },
        0.05,
      ),
    ).toBe(0.1);
  });

  it("samples http.client at 1% (chatty XHR/fetch)", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        { attributes: { "sentry.op": "http.client" } },
        0.05,
      ),
    ).toBe(0.01);
  });

  it("falls back for unknown op or non-string op", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        { attributes: { "sentry.op": "ui.click" } },
        0.05,
      ),
    ).toBe(0.05);
    expect(pickWebTracesSampleRate({}, 0.05)).toBe(0.05);
    expect(pickWebTracesSampleRate(null, 0.05)).toBe(0.05);
    expect(pickWebTracesSampleRate(undefined, 0.05)).toBe(0.05);
    expect(
      pickWebTracesSampleRate({ attributes: { "sentry.op": 42 } }, 0.05),
    ).toBe(0.05);
  });
});
