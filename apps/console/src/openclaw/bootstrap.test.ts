import { describe, expect, it, vi } from "vitest";
import {
  registerOpenClawWebhook,
  shouldUseWebhook,
  unregisterOpenClawWebhook,
  validateWebhookConfig,
} from "./bootstrap.js";

const SECRET_OK = "a".repeat(32);

function makeBotMock() {
  const setWebhook = vi.fn().mockResolvedValue(true);
  const deleteWebhook = vi.fn().mockResolvedValue(true);
  return {
    bot: { api: { setWebhook, deleteWebhook } },
    setWebhook,
    deleteWebhook,
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
  it("calls setWebhook with secret_token + drop_pending_updates + allowed_updates", async () => {
    const { bot, setWebhook } = makeBotMock();
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
