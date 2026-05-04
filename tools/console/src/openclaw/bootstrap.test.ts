import { describe, expect, it, vi } from "vitest";
import {
  registerOpenClawWebhook,
  shouldUseWebhook,
  unregisterOpenClawWebhook,
  validateWebhookConfig,
} from "./bootstrap.js";

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
        url: "https://sergeant-hubchat.up.railway.app/webhook/openclaw",
        secretToken: "Abc-DEF_123-".repeat(3) + "abc", // 39 chars, valid
      }),
    ).not.toThrow();
  });
});

describe("registerOpenClawWebhook", () => {
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

  it("retries setWebhook when getWebhookInfo reports an empty url (W4.1 race)", async () => {
    // Simulate the production race: a graceful-shutdown long-poll
    // container clears the webhook between our `setWebhook` and our
    // verification read. The first verify returns url="", second
    // returns the expected URL.
    vi.spyOn(console, "warn").mockImplementation(() => {});
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
    await registerOpenClawWebhook(bot as never, {
      url: "https://x.example/webhook",
      secretToken: SECRET_OK,
    });
    // Two setWebhook calls: first fails verification, second succeeds.
    expect(setWebhook).toHaveBeenCalledTimes(2);
    expect(getWebhookInfo).toHaveBeenCalledTimes(2);
    // Subsequent setWebhook attempts skip drop_pending_updates so we
    // don't lose queued updates that arrived between attempts.
    expect(setWebhook.mock.calls[0][1]).toMatchObject({
      drop_pending_updates: true,
    });
    expect(setWebhook.mock.calls[1][1]).toMatchObject({
      drop_pending_updates: false,
    });
  });

  it("throws after WEBHOOK_VERIFY_MAX_ATTEMPTS if verification keeps failing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { bot, setWebhook, getWebhookInfo } = makeBotMock();
    // Force every getWebhookInfo to keep reporting an empty URL.
    getWebhookInfo.mockResolvedValue({
      url: "",
      has_custom_certificate: false,
      pending_update_count: 0,
    });
    await expect(
      registerOpenClawWebhook(bot as never, {
        url: "https://x.example/webhook",
        secretToken: SECRET_OK,
      }),
    ).rejects.toThrow(/verification failed after 3 attempts/);
    expect(setWebhook).toHaveBeenCalledTimes(3);
    expect(getWebhookInfo).toHaveBeenCalledTimes(3);
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
