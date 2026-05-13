import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerOpenClawWebhook,
  shouldUseWebhook,
  unregisterOpenClawWebhook,
  validateWebhookConfig,
} from "./bootstrap.js";

const { mockAddBreadcrumb, mockCaptureMessage } = vi.hoisted(() => ({
  mockAddBreadcrumb: vi.fn(),
  mockCaptureMessage: vi.fn(),
}));
vi.mock("../obs/sentry.js", () => ({
  Sentry: {
    addBreadcrumb: mockAddBreadcrumb,
    captureMessage: mockCaptureMessage,
  },
}));

const SECRET_OK = "a".repeat(32);

function makeBotMock(initialUrl = "") {
  const setWebhook = vi.fn().mockResolvedValue(true);
  const deleteWebhook = vi.fn().mockResolvedValue(true);
  // `getWebhookInfo` returns whatever the most recent successful
  // setWebhook stored. Tests that exercise the W4.1 race override this
  // mock to return an empty / mismatched URL.
  const state = { url: initialUrl };
  setWebhook.mockImplementation(async (url: string) => {
    state.url = url;
    return true;
  });
  const getWebhookInfo = vi.fn().mockImplementation(async () => ({
    url: state.url,
    has_custom_certificate: false,
    pending_update_count: 0,
  }));
  return {
    bot: { api: { setWebhook, deleteWebhook, getWebhookInfo } },
    setWebhook,
    deleteWebhook,
    getWebhookInfo,
    state,
  };
}

describe("shouldUseWebhook", () => {
  it("defaults to false on missing/empty values", () => {
    expect(shouldUseWebhook(undefined)).toBe(false);
    expect(shouldUseWebhook("")).toBe(false);
    expect(shouldUseWebhook("   ")).toBe(false);
  });

  it("recognises true / 1 / yes (case-insensitive, trimmed)", () => {
    expect(shouldUseWebhook("true")).toBe(true);
    expect(shouldUseWebhook("TRUE")).toBe(true);
    expect(shouldUseWebhook(" True ")).toBe(true);
    expect(shouldUseWebhook("1")).toBe(true);
    expect(shouldUseWebhook("yes")).toBe(true);
  });

  it("treats anything else as long-poll (fail-closed)", () => {
    expect(shouldUseWebhook("0")).toBe(false);
    expect(shouldUseWebhook("no")).toBe(false);
    expect(shouldUseWebhook("on")).toBe(false);
    expect(shouldUseWebhook("enabled")).toBe(false);
    expect(shouldUseWebhook("nope")).toBe(false);
  });
});

describe("validateWebhookConfig", () => {
  it("rejects empty / missing url", () => {
    expect(() =>
      validateWebhookConfig({ url: "", secretToken: SECRET_OK }),
    ).toThrow(/URL is empty/);
  });

  it("rejects malformed url", () => {
    expect(() =>
      validateWebhookConfig({ url: "not a url", secretToken: SECRET_OK }),
    ).toThrow(/not a valid URL/);
  });

  it("rejects http:// (Telegram requires https)", () => {
    expect(() =>
      validateWebhookConfig({
        url: "http://example.com/webhook",
        secretToken: SECRET_OK,
      }),
    ).toThrow(/must use https/);
  });

  it("rejects empty secret", () => {
    expect(() =>
      validateWebhookConfig({
        url: "https://example.com/webhook",
        secretToken: "",
      }),
    ).toThrow(/SECRET is empty/);
  });

  it("rejects too-short secret (<32 chars)", () => {
    expect(() =>
      validateWebhookConfig({
        url: "https://example.com/webhook",
        secretToken: "a".repeat(31),
      }),
    ).toThrow(/≥32 chars/);
  });

  it("rejects secrets with disallowed chars (Bot API limit)", () => {
    expect(() =>
      validateWebhookConfig({
        url: "https://example.com/webhook",
        secretToken: "a".repeat(31) + "!", // 32 chars, but ! not allowed
      }),
    ).toThrow(/A-Za-z0-9_-/);
    expect(() =>
      validateWebhookConfig({
        url: "https://example.com/webhook",
        secretToken: "a".repeat(31) + " ", // whitespace not allowed
      }),
    ).toThrow(/A-Za-z0-9_-/);
  });

  it("accepts a valid https url + 32-char alphanumeric/dash/underscore secret", () => {
    expect(() =>
      validateWebhookConfig({
        url: "https://sergeant-openclaw.up.railway.app/webhook/openclaw",
        secretToken: "Abc-DEF_123-".repeat(3) + "abc", // 39 chars, valid
      }),
    ).not.toThrow();
  });
});

describe("registerOpenClawWebhook", () => {
  beforeEach(() => {
    mockAddBreadcrumb.mockClear();
    mockCaptureMessage.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper: drive a registerOpenClawWebhook() call to completion under
   * `vi.useFakeTimers()`. The retry loop awaits each backoff via
   * `setTimeout`, so we drain pending timers by interleaving
   * `runAllTimersAsync` with the in-flight promise.
   */
  async function settleWithFakeTimers<T>(p: Promise<T>): Promise<T> {
    let settled = false;
    // Use `.then(onfulfilled, onrejected)` so we don't generate a new
    // unhandled-rejection chain off `p` while we're still draining
    // pending timers. The caller still `await`s `p` directly and
    // observes the original resolution / rejection.
    p.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    while (!settled) {
      await vi.advanceTimersByTimeAsync(60_000);
      // yield to microtasks so the next attempt's setTimeout is scheduled
      await Promise.resolve();
    }
    return p;
  }

  it("calls setWebhook with secret_token + drop_pending_updates + allowed_updates and verifies via getWebhookInfo", async () => {
    const { bot, setWebhook, getWebhookInfo } = makeBotMock();
    await registerOpenClawWebhook(bot as never, {
      url: "https://x.example/webhook",
      secretToken: SECRET_OK,
    });
    expect(setWebhook).toHaveBeenCalledTimes(1);
    expect(setWebhook).toHaveBeenCalledWith("https://x.example/webhook", {
      secret_token: SECRET_OK,
      drop_pending_updates: true,
      allowed_updates: ["message", "callback_query"],
    });
    // The W4.1 hardening reads back the webhook URL once on success.
    expect(getWebhookInfo).toHaveBeenCalledTimes(1);
  });

  it("propagates validation errors before calling Telegram (no API call on bad config)", async () => {
    const { bot, setWebhook } = makeBotMock();
    await expect(
      registerOpenClawWebhook(bot as never, {
        url: "ftp://nope",
        secretToken: SECRET_OK,
      }),
    ).rejects.toThrow(/must use https/);
    expect(setWebhook).not.toHaveBeenCalled();
  });

  it("emits Sentry breadcrumb on successful recovery after W4.1 race", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const { bot, getWebhookInfo } = makeBotMock();
    let calls = 0;
    getWebhookInfo.mockImplementation(async () => {
      calls += 1;
      return {
        url: calls === 1 ? "" : "https://x.example/webhook",
        has_custom_certificate: false,
        pending_update_count: 0,
      };
    });
    await settleWithFakeTimers(
      registerOpenClawWebhook(bot as never, {
        url: "https://x.example/webhook",
        secretToken: SECRET_OK,
      }),
    );
    // Two breadcrumbs total: one warning on the inter-attempt retry,
    // one info on successful recovery.
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(2);
    expect(mockAddBreadcrumb).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        category: "openclaw.webhook",
        level: "warning",
        message: expect.stringMatching(/setWebhook retry.*reason=url_mismatch/),
        data: expect.objectContaining({
          attempt: 1,
          maxAttempts: 5,
          reason: "url_mismatch",
          delayMs: 1_000,
        }),
      }),
    );
    expect(mockAddBreadcrumb).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        category: "openclaw.webhook",
        level: "info",
        data: expect.objectContaining({ attempt: 2 }),
      }),
    );
    // Recovery path — no error-level captureMessage.
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("does not emit Sentry breadcrumb on first-attempt success", async () => {
    mockAddBreadcrumb.mockClear();
    const { bot } = makeBotMock();
    await registerOpenClawWebhook(bot as never, {
      url: "https://x.example/webhook",
      secretToken: SECRET_OK,
    });
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });

  it("retries setWebhook when getWebhookInfo reports an empty url (W4.1 race)", async () => {
    // Simulate the production race: a graceful-shutdown long-poll
    // container clears the webhook between our `setWebhook` and our
    // verification read. The first verify returns url="", second
    // returns the expected URL.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const { bot, setWebhook, getWebhookInfo } = makeBotMock();
    let calls = 0;
    getWebhookInfo.mockImplementation(async () => {
      calls += 1;
      return {
        url: calls === 1 ? "" : "https://x.example/webhook",
        has_custom_certificate: false,
        pending_update_count: 0,
      };
    });
    await settleWithFakeTimers(
      registerOpenClawWebhook(bot as never, {
        url: "https://x.example/webhook",
        secretToken: SECRET_OK,
      }),
    );
    // Two setWebhook calls: first fails verification, second succeeds.
    expect(setWebhook).toHaveBeenCalledTimes(2);
    expect(getWebhookInfo).toHaveBeenCalledTimes(2);
    // Subsequent setWebhook attempts skip drop_pending_updates so we
    // don't lose queued updates that arrived between attempts.
    expect(setWebhook.mock.calls[0]?.[1]).toMatchObject({
      drop_pending_updates: true,
    });
    expect(setWebhook.mock.calls[1]?.[1]).toMatchObject({
      drop_pending_updates: false,
    });
  });

  // B.6 / O6 — retry semantics for Telegram API outage at boot.

  it("retries setWebhook when the API call itself throws (transient outage, 2-retry success)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const { bot, setWebhook, getWebhookInfo } = makeBotMock();
    let attemptCount = 0;
    setWebhook.mockReset();
    setWebhook.mockImplementation(async (_url: string) => {
      attemptCount += 1;
      if (attemptCount === 1) {
        throw new Error("ETIMEDOUT api.telegram.org");
      }
      // 2nd attempt succeeds — getWebhookInfo will then return the URL
      // we expect.
      return true;
    });
    getWebhookInfo.mockImplementation(async () => ({
      url: attemptCount >= 2 ? "https://x.example/webhook" : "",
      has_custom_certificate: false,
      pending_update_count: 0,
    }));
    await settleWithFakeTimers(
      registerOpenClawWebhook(bot as never, {
        url: "https://x.example/webhook",
        secretToken: SECRET_OK,
      }),
    );
    expect(setWebhook).toHaveBeenCalledTimes(2);
    // Retry breadcrumb (warning, api_error) + recovery breadcrumb (info).
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(2);
    expect(mockAddBreadcrumb).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        level: "warning",
        message: expect.stringMatching(/setWebhook retry.*reason=api_error/),
        data: expect.objectContaining({
          attempt: 1,
          reason: "api_error",
          apiError: "ETIMEDOUT api.telegram.org",
          delayMs: 1_000,
        }),
      }),
    );
    expect(mockAddBreadcrumb).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        level: "info",
        data: expect.objectContaining({ attempt: 2 }),
      }),
    );
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it("emits a breadcrumb on every retry, then an error-level captureMessage when all 5 attempts fail (api_error)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const { bot, setWebhook, getWebhookInfo } = makeBotMock();
    // Every setWebhook throws — simulate permanent Telegram outage.
    setWebhook.mockReset();
    setWebhook.mockRejectedValue(new Error("ECONNREFUSED api.telegram.org"));
    await expect(
      settleWithFakeTimers(
        registerOpenClawWebhook(bot as never, {
          url: "https://x.example/webhook",
          secretToken: SECRET_OK,
        }),
      ),
    ).rejects.toThrow(
      /registration failed after 5 attempts.*ECONNREFUSED api.telegram.org/,
    );
    expect(setWebhook).toHaveBeenCalledTimes(5);
    // getWebhookInfo never runs because setWebhook always throws first.
    expect(getWebhookInfo).not.toHaveBeenCalled();
    // 4 inter-attempt warning breadcrumbs (one before each of attempts 2..5).
    const warningBreadcrumbs = mockAddBreadcrumb.mock.calls.filter(
      ([arg]) => arg.level === "warning",
    );
    expect(warningBreadcrumbs).toHaveLength(4);
    // First retry uses 1s backoff, then 2s, 5s, 10s — schedule check.
    expect(warningBreadcrumbs.map(([arg]) => arg.data.delayMs)).toEqual([
      1_000, 2_000, 5_000, 10_000,
    ]);
    expect(
      warningBreadcrumbs.every(([arg]) => arg.data.reason === "api_error"),
    ).toBe(true);
    // No info breadcrumb — nothing recovered.
    expect(
      mockAddBreadcrumb.mock.calls.some(([arg]) => arg.level === "info"),
    ).toBe(false);
    // Final captureMessage at error level with tags + extras.
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringMatching(/setWebhook failed after 5 attempts/),
      expect.objectContaining({
        level: "error",
        tags: expect.objectContaining({
          module: "openclaw",
          op: "setWebhook",
          reason: "api_error",
        }),
        extra: expect.objectContaining({
          url: "https://x.example/webhook",
          attempts: 5,
          lastApiError: "ECONNREFUSED api.telegram.org",
        }),
      }),
    );
  });

  it("throws after WEBHOOK_VERIFY_MAX_ATTEMPTS if verification keeps failing (url_mismatch)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const { bot, setWebhook, getWebhookInfo } = makeBotMock();
    // Force every getWebhookInfo to keep reporting an empty URL.
    getWebhookInfo.mockResolvedValue({
      url: "",
      has_custom_certificate: false,
      pending_update_count: 0,
    });
    await expect(
      settleWithFakeTimers(
        registerOpenClawWebhook(bot as never, {
          url: "https://x.example/webhook",
          secretToken: SECRET_OK,
        }),
      ),
    ).rejects.toThrow(/verification failed after 5 attempts/);
    expect(setWebhook).toHaveBeenCalledTimes(5);
    expect(getWebhookInfo).toHaveBeenCalledTimes(5);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        level: "error",
        tags: expect.objectContaining({ reason: "url_mismatch" }),
      }),
    );
  });
});

describe("unregisterOpenClawWebhook", () => {
  it("calls deleteWebhook with drop_pending_updates=false (preserve queued msgs for long-poll)", async () => {
    const { bot, deleteWebhook } = makeBotMock();
    await unregisterOpenClawWebhook(bot as never);
    expect(deleteWebhook).toHaveBeenCalledTimes(1);
    expect(deleteWebhook).toHaveBeenCalledWith({
      drop_pending_updates: false,
    });
  });
});
