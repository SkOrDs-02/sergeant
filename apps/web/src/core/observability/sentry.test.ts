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

  it("реєструє beforeSend, який рекурсивно скрабить PII (audit 2026-05-13)", async () => {
    const { initSentry } = await import("./sentry");
    await initSentry();
    const cfg = sentryInit.mock.calls[0]?.[0];
    expect(typeof cfg.beforeSend).toBe("function");

    // Прикручений хук має повертати event і одночасно почистити чутливі поля.
    const event = {
      request: {
        cookies: { sid: "y" },
        headers: { Authorization: "Bearer xxx" } as Record<string, unknown>,
      },
      extra: { token: "leaked" } as Record<string, unknown>,
    };
    const out = cfg.beforeSend(event, {});
    expect(out).toBe(event);
    expect("cookies" in event.request).toBe(false);
    expect(event.request.headers["Authorization"]).toBe("[redacted]");
    expect(event.extra["token"]).toBe("[redacted]");
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

describe("applyWebBeforeSend (PII scrub)", () => {
  it("drops request.cookies and request.data wholesale", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const event = {
      request: {
        cookies: { sid: "yyy" },
        data: { password: "p1", email: "e@x.com" },
        url: "https://app.sergeant.app/api/me",
      },
    };
    applyWebBeforeSend(event);
    expect("cookies" in event.request).toBe(false);
    expect("data" in event.request).toBe(false);
    expect(event.request.url).toBe("https://app.sergeant.app/api/me");
  });

  it("recursively scrubs request.headers (Authorization, Cookie, X-CSRF-Token)", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const event = {
      request: {
        headers: {
          Authorization: "Bearer xxx",
          Cookie: "auth=yyy",
          "X-CSRF-Token": "csrf-zzz",
          "Content-Type": "application/json",
        } as Record<string, unknown>,
      },
    };
    applyWebBeforeSend(event);
    expect(event.request.headers["Authorization"]).toBe("[redacted]");
    expect(event.request.headers["Cookie"]).toBe("[redacted]");
    expect(event.request.headers["X-CSRF-Token"]).toBe("[redacted]");
    expect(event.request.headers["Content-Type"]).toBe("application/json");
  });

  it("recursively scrubs event.extra / event.contexts (deep nesting)", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const payload: Record<string, unknown> = {
      email: "leak@example.com",
      deep: { token: "leaked", keep: "ok" } as Record<string, unknown>,
    };
    const secrets: Record<string, unknown> = {
      connectionString: "postgres://…",
    };
    const event = {
      extra: { payload },
      contexts: {
        runtime: { name: "browser" },
        secrets,
      },
    };
    applyWebBeforeSend(event);
    expect(payload["email"]).toBe("[redacted]");
    const deep = payload["deep"] as Record<string, unknown>;
    expect(deep["token"]).toBe("[redacted]");
    expect(deep["keep"]).toBe("ok");
    expect(secrets["connectionString"]).toBe("[redacted]");
  });

  it("scrubs breadcrumbs[].data (xhr / fetch auto-capture)", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const data: Record<string, unknown> = {
      url: "/api/me",
      request_body: { password: "p" } as Record<string, unknown>,
      headers: { Authorization: "Bearer xxx" } as Record<string, unknown>,
    };
    const event = {
      breadcrumbs: [{ category: "xhr", data }],
    };
    applyWebBeforeSend(event);
    const rb = data["request_body"] as Record<string, unknown>;
    expect(rb["password"]).toBe("[redacted]");
    const headers = data["headers"] as Record<string, unknown>;
    expect(headers["Authorization"]).toBe("[redacted]");
  });

  it("normalises event.user to { id } only (strips email/phone)", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const event = {
      user: {
        id: "user-abc",
        email: "leak@example.com",
        phone: "+380",
        username: "leak",
      },
    };
    applyWebBeforeSend(event);
    expect(event.user).toEqual({ id: "user-abc" });
  });

  it("survives events without request/extra/contexts/breadcrumbs/user", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const event = {} as Record<string, never>;
    expect(() => applyWebBeforeSend(event)).not.toThrow();
  });

  // PII roast 2026-05-13 §P0-S2/S3: pattern-based scrubbing of strings in
  // event.message / exception.values[].value, query-string params in
  // request.url, and breadcrumb message text. Closes the gap where
  // structural scrubPII never inspects string contents.
  it("PII-roast: scrubs email in event.message", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const event = { message: "fetch failed for leak@example.com" };
    applyWebBeforeSend(event);
    expect(event.message).toBe("fetch failed for [email redacted]@example.com");
  });

  it("PII-roast: scrubs token + api_key from request.url query string", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const event = {
      request: { url: "/auth/callback?token=abc&api_key=xxx&ok=1" },
    };
    applyWebBeforeSend(event);
    expect(event.request.url).toBe(
      "/auth/callback?token=[redacted]&api_key=[redacted]&ok=1",
    );
  });

  it("PII-roast: scrubs JWT in exception.values[].value", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const jwt = `${"A".repeat(20)}.${"B".repeat(40)}.${"C".repeat(20)}`;
    const event = {
      exception: { values: [{ type: "Error", value: `auth failed: ${jwt}` }] },
    };
    applyWebBeforeSend(event);
    expect(event.exception.values[0]!.value).toBe(
      "auth failed: [jwt redacted]",
    );
  });

  it("PII-roast: scrubs Bearer token + email in breadcrumb message", async () => {
    const { applyWebBeforeSend } = await import("./sentry");
    const event = {
      breadcrumbs: [
        {
          category: "xhr",
          message:
            "HTTP 401 from /api/me Bearer eyJhbGciOiJIUzI1NiJ9_abc for u@x.com",
        },
      ],
    };
    applyWebBeforeSend(event);
    expect(event.breadcrumbs[0]!.message).toBe(
      "HTTP 401 from /api/me Bearer [redacted] for [email redacted]@x.com",
    );
  });
});

describe("WEB_SENTRY_DENY_URLS", () => {
  it("блокує `/api/health` + browser-extension URLs (extension-crash noise)", async () => {
    const { WEB_SENTRY_DENY_URLS } = await import("./sentry");
    expect(WEB_SENTRY_DENY_URLS).toContain("/api/health");
    expect(WEB_SENTRY_DENY_URLS).toContain("/health");
    // chrome-extension regex matches the prefix.
    const chromeExtRe = WEB_SENTRY_DENY_URLS.find(
      (r) => r instanceof RegExp && r.source.includes("chrome-extension"),
    ) as RegExp | undefined;
    expect(chromeExtRe).toBeDefined();
    expect(chromeExtRe!.test("chrome-extension://abcdef/content.js")).toBe(
      true,
    );
  });

  it("is wired into initSentry via denyUrls", async () => {
    const { initSentry } = await import("./sentry");
    await initSentry();
    const cfg = sentryInit.mock.calls[0]?.[0];
    expect(Array.isArray(cfg.denyUrls)).toBe(true);
    expect(cfg.denyUrls).toContain("/api/health");
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

  it("samples navigation at 10% by default (no route name)", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        { attributes: { "sentry.op": "navigation" } },
        0.05,
      ),
    ).toBe(0.1);
  });

  it("samples navigation to /onboarding at 100% (first-run UX)", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        {
          attributes: { "sentry.op": "navigation" },
          name: "/onboarding",
        },
        0.05,
      ),
    ).toBe(1.0);
    expect(
      pickWebTracesSampleRate(
        {
          attributes: { "sentry.op": "navigation" },
          name: "/onboarding/welcome",
        },
        0.05,
      ),
    ).toBe(1.0);
  });

  it("samples navigation to /fizruk and /finyk at 50% (active tuning)", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        { attributes: { "sentry.op": "navigation" }, name: "/fizruk" },
        0.05,
      ),
    ).toBe(0.5);
    expect(
      pickWebTracesSampleRate(
        {
          attributes: { "sentry.op": "navigation" },
          name: "/finyk/transactions",
        },
        0.05,
      ),
    ).toBe(0.5);
  });

  it("samples navigation to the Hub root (/) at 5% (most visited)", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        { attributes: { "sentry.op": "navigation" }, name: "/" },
        0.5,
      ),
    ).toBe(0.05);
  });

  it("reads route name from transactionContext.name when top-level name is missing", async () => {
    const { pickWebTracesSampleRate } = await import("./sentry");
    expect(
      pickWebTracesSampleRate(
        {
          attributes: { "sentry.op": "navigation" },
          transactionContext: { name: "/fizruk/workout/123" },
        },
        0.05,
      ),
    ).toBe(0.5);
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

describe("defaultWebSampleRate", () => {
  it("returns 0.05 (prod baseline) when no env vars are set", async () => {
    const { defaultWebSampleRate } = await import("./sentry");
    expect(defaultWebSampleRate({})).toBe(0.05);
  });

  it("reads VITE_SENTRY_SAMPLE_PROFILE=minimal as 0.01", async () => {
    const { defaultWebSampleRate } = await import("./sentry");
    expect(
      defaultWebSampleRate({ VITE_SENTRY_SAMPLE_PROFILE: "minimal" }),
    ).toBe(0.01);
  });

  it("reads VITE_SENTRY_SAMPLE_PROFILE=aggressive as 0.2", async () => {
    const { defaultWebSampleRate } = await import("./sentry");
    expect(
      defaultWebSampleRate({ VITE_SENTRY_SAMPLE_PROFILE: "aggressive" }),
    ).toBe(0.2);
  });

  it("explicit VITE_SENTRY_TRACES_SAMPLE_RATE wins over profile (kill-switch)", async () => {
    const { defaultWebSampleRate } = await import("./sentry");
    expect(
      defaultWebSampleRate({
        VITE_SENTRY_SAMPLE_PROFILE: "aggressive",
        VITE_SENTRY_TRACES_SAMPLE_RATE: "0",
      }),
    ).toBe(0);
  });

  it("unknown profile collapses to prod (0.05)", async () => {
    const { defaultWebSampleRate } = await import("./sentry");
    expect(defaultWebSampleRate({ VITE_SENTRY_SAMPLE_PROFILE: "banana" })).toBe(
      0.05,
    );
  });
});

describe("resolveWebSampleProfile", () => {
  it("accepts the three documented profile names", async () => {
    const { resolveWebSampleProfile } = await import("./sentry");
    expect(resolveWebSampleProfile("minimal")).toBe("minimal");
    expect(resolveWebSampleProfile("prod")).toBe("prod");
    expect(resolveWebSampleProfile("aggressive")).toBe("aggressive");
  });

  it("defaults to prod when unset / unknown / wrong type", async () => {
    const { resolveWebSampleProfile } = await import("./sentry");
    expect(resolveWebSampleProfile(undefined)).toBe("prod");
    expect(resolveWebSampleProfile(null)).toBe("prod");
    expect(resolveWebSampleProfile("")).toBe("prod");
    expect(resolveWebSampleProfile("banana")).toBe("prod");
    expect(resolveWebSampleProfile(42)).toBe("prod");
  });
});
