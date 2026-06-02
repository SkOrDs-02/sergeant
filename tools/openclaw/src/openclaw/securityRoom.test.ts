/**
 * I7 — Unit tests for OpenClaw securityRoom.ts
 *
 * Covers:
 *   - formatSecurityEventMessage — all severity levels, with/without userIdHash
 *   - pushSecurityEventToTelegram — mute flag, missing config, success, failure variants
 */

import { describe, it, expect, vi } from "vitest";
import {
  formatSecurityEventMessage,
  pushSecurityEventToTelegram,
  type SecurityEventPayload,
  type SecurityRoomEnv,
} from "./securityRoom.js";

// ─────────────────────────────────────────────────────────────────────────────
// formatSecurityEventMessage
// ─────────────────────────────────────────────────────────────────────────────

describe("formatSecurityEventMessage", () => {
  it("includes severity emoji for critical", () => {
    const msg = formatSecurityEventMessage({
      event: "mono_webhook_bad_payload",
      severity: "critical",
      details: "Zod failed",
      timestamp: "2026-06-01T00:00:00.000Z",
    });
    expect(msg).toContain("🔴");
    expect(msg).toContain("[CRITICAL]");
  });

  it("includes severity emoji for high", () => {
    const msg = formatSecurityEventMessage({
      event: "prompt_injection_attempt",
      severity: "high",
      details: "injection",
      timestamp: "2026-06-01T00:00:00.000Z",
    });
    expect(msg).toContain("🟠");
    expect(msg).toContain("[HIGH]");
  });

  it("includes severity emoji for medium", () => {
    const msg = formatSecurityEventMessage({
      event: "transcribe_usd_cap_hit",
      severity: "medium",
      details: "cap hit",
      timestamp: "2026-06-01T00:00:00.000Z",
    });
    expect(msg).toContain("🟡");
    expect(msg).toContain("[MEDIUM]");
  });

  it("includes severity emoji for low", () => {
    const msg = formatSecurityEventMessage({
      event: "auth_session_ua_drift",
      severity: "low",
      details: "drift",
      timestamp: "2026-06-01T00:00:00.000Z",
    });
    expect(msg).toContain("🟢");
    expect(msg).toContain("[LOW]");
  });

  it("includes severity emoji for info", () => {
    const msg = formatSecurityEventMessage({
      event: "chat_tool_cap_hit",
      severity: "info",
      details: "cap",
      timestamp: "2026-06-01T00:00:00.000Z",
    });
    expect(msg).toContain("⚪");
    expect(msg).toContain("[INFO]");
  });

  it("includes event name, details, and timestamp", () => {
    const payload: SecurityEventPayload = {
      event: "mono_webhook_bad_payload",
      severity: "high",
      details: "test details",
      timestamp: "2026-06-01T12:00:00.000Z",
    };
    const msg = formatSecurityEventMessage(payload);
    expect(msg).toContain("Event: mono_webhook_bad_payload");
    expect(msg).toContain("Details: test details");
    expect(msg).toContain("Time: 2026-06-01T12:00:00.000Z");
  });

  it("includes UserHash line when userIdHash is present", () => {
    const payload: SecurityEventPayload = {
      event: "auth_session_ua_drift",
      severity: "medium",
      details: "drift",
      userIdHash: "abcd1234abcd1234",
      timestamp: "2026-06-01T00:00:00.000Z",
    };
    const msg = formatSecurityEventMessage(payload);
    expect(msg).toContain("UserHash: abcd1234abcd1234");
  });

  it("omits UserHash line when userIdHash is absent", () => {
    const payload: SecurityEventPayload = {
      event: "transcribe_usd_cap_hit",
      severity: "medium",
      details: "cap",
      timestamp: "2026-06-01T00:00:00.000Z",
    };
    const msg = formatSecurityEventMessage(payload);
    expect(msg).not.toContain("UserHash:");
  });

  it("does not leak raw user id — only passes through the already-hashed value", () => {
    // Raw userId would be a full UUID; userIdHash is 16 hex chars.
    const rawUserId = "550e8400-e29b-41d4-a716-446655440000";
    const payload: SecurityEventPayload = {
      event: "chat_tool_cap_hit",
      severity: "high",
      details: "cap",
      userIdHash: "abcd1234abcd1234",
      timestamp: "2026-06-01T00:00:00.000Z",
    };
    const msg = formatSecurityEventMessage(payload);
    expect(msg).not.toContain(rawUserId);
    expect(msg).toContain("UserHash: abcd1234abcd1234");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pushSecurityEventToTelegram
// ─────────────────────────────────────────────────────────────────────────────

const basePayload: SecurityEventPayload = {
  event: "mono_webhook_bad_payload",
  severity: "high",
  details: "test",
  timestamp: "2026-06-01T00:00:00.000Z",
};

describe("pushSecurityEventToTelegram — mute flag", () => {
  it("returns ok=true with reason 'muted' when SECURITY_EVENTS_MUTED=1", async () => {
    const env: SecurityRoomEnv = {
      SECURITY_EVENTS_MUTED: "1",
      SERGEANT_ALERT_BOT_TOKEN: "tok",
      SERGEANT_OPS_CHAT_ID: "chat123",
    };
    const fetchMock = vi.fn();
    const result = await pushSecurityEventToTelegram(
      basePayload,
      env,
      fetchMock,
    );
    expect(result).toEqual({ ok: true, reason: "muted" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT mute when SECURITY_EVENTS_MUTED is '0'", async () => {
    const env: SecurityRoomEnv = {
      SECURITY_EVENTS_MUTED: "0",
      SERGEANT_ALERT_BOT_TOKEN: "tok",
      SERGEANT_OPS_CHAT_ID: "chat123",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const result = await pushSecurityEventToTelegram(
      basePayload,
      env,
      fetchMock,
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("pushSecurityEventToTelegram — missing config", () => {
  it("returns ok=false when bot token is missing", async () => {
    const env: SecurityRoomEnv = { SERGEANT_OPS_CHAT_ID: "chat123" };
    const fetchMock = vi.fn();
    const result = await pushSecurityEventToTelegram(
      basePayload,
      env,
      fetchMock,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("SERGEANT_ALERT_BOT_TOKEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok=false when chat id is missing", async () => {
    const env: SecurityRoomEnv = { SERGEANT_ALERT_BOT_TOKEN: "tok" };
    const fetchMock = vi.fn();
    const result = await pushSecurityEventToTelegram(
      basePayload,
      env,
      fetchMock,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("SERGEANT_OPS_CHAT_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pushSecurityEventToTelegram — Telegram send", () => {
  const env: SecurityRoomEnv = {
    SERGEANT_ALERT_BOT_TOKEN: "test-token",
    SERGEANT_OPS_CHAT_ID: "chat123",
  };

  it("sends to correct Telegram URL and returns ok=true on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await pushSecurityEventToTelegram(
      basePayload,
      env,
      fetchMock,
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("includes formatted message text in the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await pushSecurityEventToTelegram(basePayload, env, fetchMock);

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string) as Record<
      string,
      unknown
    >;
    expect(typeof body["text"]).toBe("string");
    expect(body["text"] as string).toContain("mono_webhook_bad_payload");
    expect(body["chat_id"]).toBe("chat123");
  });

  it("sets disable_notification=false for high severity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await pushSecurityEventToTelegram(
      { ...basePayload, severity: "high" },
      env,
      fetchMock,
    );
    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string) as Record<
      string,
      unknown
    >;
    expect(body["disable_notification"]).toBe(false);
  });

  it("sets disable_notification=true for low severity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await pushSecurityEventToTelegram(
      { ...basePayload, severity: "low" },
      env,
      fetchMock,
    );
    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string) as Record<
      string,
      unknown
    >;
    expect(body["disable_notification"]).toBe(true);
  });

  it("includes message_thread_id when TELEGRAM_TOPIC_ENGINEERING is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const envWithTopic: SecurityRoomEnv = {
      ...env,
      TELEGRAM_TOPIC_ENGINEERING: "42",
    };
    await pushSecurityEventToTelegram(basePayload, envWithTopic, fetchMock);
    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string) as Record<
      string,
      unknown
    >;
    expect(body["message_thread_id"]).toBe(42);
  });

  it("omits message_thread_id when TELEGRAM_TOPIC_ENGINEERING is not set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await pushSecurityEventToTelegram(basePayload, env, fetchMock);
    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string) as Record<
      string,
      unknown
    >;
    expect(body["message_thread_id"]).toBeUndefined();
  });

  it("returns ok=false with reason string on HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Too Many Requests"),
    });
    const result = await pushSecurityEventToTelegram(
      basePayload,
      env,
      fetchMock,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Too Many Requests");
  });

  it("returns ok=false with network error message on fetch exception", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("ENOTFOUND api.telegram.org"));
    const result = await pushSecurityEventToTelegram(
      basePayload,
      env,
      fetchMock,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ENOTFOUND");
  });
});
