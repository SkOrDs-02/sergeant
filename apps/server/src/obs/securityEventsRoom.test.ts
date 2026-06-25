import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/**
 * Module-load testing strategy (env-single-source companion sweep 2026-06-01):
 *
 * `securityEventsRoom.ts` reads SECURITY_EVENTS_MUTED, SERGEANT_ALERT_BOT_TOKEN,
 * SERGEANT_OPS_CHAT_ID once at call-time via the zod-validated `env` singleton.
 * Since `env` is a module-level singleton parsed at first import, to test different
 * env-var combinations we must re-import both `securityEventsRoom.ts` and
 * `env/env.ts` on fresh env-values.
 *
 * Canonical pattern (mirrors push.test.ts / auth.test.ts):
 *   1. `vi.resetModules()` — flush ESM cache.
 *   2. `vi.stubEnv(name, value)` — set env vars (Vitest managed; rolled back by
 *      `vi.unstubAllEnvs()`).
 *   3. `await import("./securityEventsRoom.js")` — dynamic import post-stub.
 *   4. In afterEach: `vi.unstubAllEnvs()` + `vi.resetModules()`.
 */

// Mock pino logger so test runs don't try to init real pino.
vi.mock("./logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the metrics module so counter calls don't touch real Prometheus registry
// (which would conflict with parallel test suites that also import metrics).
const incMock = vi.fn();
vi.mock("./metrics.js", () => ({
  securityRoomUnreachableTotal: {
    inc: (...args: unknown[]) => incMock(...args),
  },
}));

describe("pingSecurityRoom — I7 boot reachability heartbeat", () => {
  beforeEach(() => {
    incMock.mockClear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns ok=true with reason 'muted' when SECURITY_EVENTS_MUTED=1", async () => {
    vi.stubEnv("SECURITY_EVENTS_MUTED", "1");
    const { pingSecurityRoom } = await import("./securityEventsRoom.js");
    const result = await pingSecurityRoom();
    expect(result).toEqual({ ok: true, reason: "muted" });
    expect(incMock).not.toHaveBeenCalled();
  });

  it("returns ok=false 'bot_token_missing' and bumps counter when token unset", async () => {
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "12345");
    // SERGEANT_ALERT_BOT_TOKEN not set → empty string default from schema
    const { pingSecurityRoom } = await import("./securityEventsRoom.js");
    const result = await pingSecurityRoom();
    expect(result).toEqual({ ok: false, reason: "bot_token_missing" });
    expect(incMock).toHaveBeenCalledWith({ reason: "bot_token_missing" });
  });

  it("returns ok=false 'chat_id_missing' and bumps counter when chat unset", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "test-token");
    // SERGEANT_OPS_CHAT_ID not set → empty string default from schema
    const { pingSecurityRoom } = await import("./securityEventsRoom.js");
    const result = await pingSecurityRoom();
    expect(result).toEqual({ ok: false, reason: "chat_id_missing" });
    expect(incMock).toHaveBeenCalledWith({ reason: "chat_id_missing" });
  });

  it("returns ok=true when Telegram getMe returns 200", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "test-token");
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "12345");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { pingSecurityRoom } = await import("./securityEventsRoom.js");
    const result = await pingSecurityRoom();

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/getMe",
    );
    expect(incMock).not.toHaveBeenCalled();
  });

  it("returns ok=false 'http_4xx' and bumps counter on 401 (rotated token)", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "expired-token");
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "12345");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const { pingSecurityRoom } = await import("./securityEventsRoom.js");
    const result = await pingSecurityRoom();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("http_4xx:401");
    expect(incMock).toHaveBeenCalledWith({ reason: "http_4xx" });
  });

  it("returns ok=false 'http_5xx' and bumps counter on 503 (Telegram outage)", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "test-token");
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "12345");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    const { pingSecurityRoom } = await import("./securityEventsRoom.js");
    const result = await pingSecurityRoom();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("http_5xx:503");
    expect(incMock).toHaveBeenCalledWith({ reason: "http_5xx" });
  });

  it("returns ok=false and bumps 'fetch_error' counter on network exception", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "test-token");
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "12345");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ENOTFOUND api.telegram.org")),
    );

    const { pingSecurityRoom } = await import("./securityEventsRoom.js");
    const result = await pingSecurityRoom();

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ENOTFOUND");
    expect(incMock).toHaveBeenCalledWith({ reason: "fetch_error" });
  });
});

describe("registerSecurityEventsRoom - Telegram push listener", () => {
  beforeEach(() => {
    incMock.mockClear();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("registers a listener and sends high-severity events to Telegram", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "room-token");
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "ops-room");
    vi.stubEnv("TELEGRAM_TOPIC_ENGINEERING", "42");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { registerSecurityEventsRoom } =
      await import("./securityEventsRoom.js");
    const { emitSecurityEvent, _listenerCount } =
      await import("./securityEvents.js");

    const unsubscribe = registerSecurityEventsRoom();
    expect(_listenerCount()).toBe(1);

    emitSecurityEvent({
      event: "prompt_injection_attempt",
      severity: "high",
      userIdHash: "abc123def4567890",
      details: "tool prompt override blocked",
      timestamp: "2026-06-25T10:00:00.000Z",
    });
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botroom-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(
      (fetchMock as Mock).mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      chat_id: "ops-room",
      disable_notification: false,
      message_thread_id: 42,
    });
    expect(body["text"]).toContain("[HIGH] security_event");
    expect(body["text"]).toContain("Event: prompt_injection_attempt");
    expect(body["text"]).toContain("UserHash: abc123def4567890");
    expect(incMock).not.toHaveBeenCalled();

    unsubscribe();
    expect(_listenerCount()).toBe(0);
  });

  it("suppresses Telegram send when security events are muted", async () => {
    vi.stubEnv("SECURITY_EVENTS_MUTED", "1");
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "room-token");
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "ops-room");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { registerSecurityEventsRoom } =
      await import("./securityEventsRoom.js");
    const { emitSecurityEvent } = await import("./securityEvents.js");

    const unsubscribe = registerSecurityEventsRoom();
    emitSecurityEvent({
      event: "chat_tool_cap_hit",
      severity: "low",
      details: "soft cap reached",
      timestamp: "2026-06-25T10:00:00.000Z",
    });
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(incMock).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("skips silently when Telegram credentials are incomplete", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "room-token");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { registerSecurityEventsRoom } =
      await import("./securityEventsRoom.js");
    const { emitSecurityEvent } = await import("./securityEvents.js");

    const unsubscribe = registerSecurityEventsRoom();
    emitSecurityEvent({
      event: "mono_webhook_bad_payload",
      severity: "medium",
      details: "missing signature",
      timestamp: "2026-06-25T10:00:00.000Z",
    });
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(incMock).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("bumps http reason counter when Telegram send returns non-2xx", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "room-token");
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "ops-room");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue("rate limited"),
      }),
    );

    const { registerSecurityEventsRoom } =
      await import("./securityEventsRoom.js");
    const { emitSecurityEvent } = await import("./securityEvents.js");

    const unsubscribe = registerSecurityEventsRoom();
    emitSecurityEvent({
      event: "stripe_webhook_bad_sig",
      severity: "critical",
      details: "bad signature",
      timestamp: "2026-06-25T10:00:00.000Z",
    });
    await flushMicrotasks();

    expect(incMock).toHaveBeenCalledWith({ reason: "http_4xx" });
    unsubscribe();
  });

  it("bumps fetch_error counter when Telegram fetch rejects", async () => {
    vi.stubEnv("SERGEANT_ALERT_BOT_TOKEN", "room-token");
    vi.stubEnv("SERGEANT_OPS_CHAT_ID", "ops-room");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const { registerSecurityEventsRoom } =
      await import("./securityEventsRoom.js");
    const { emitSecurityEvent } = await import("./securityEvents.js");

    const unsubscribe = registerSecurityEventsRoom();
    emitSecurityEvent({
      event: "auth_session_ua_drift",
      severity: "high",
      details: "UA mismatch",
      timestamp: "2026-06-25T10:00:00.000Z",
    });
    await flushMicrotasks();

    expect(incMock).toHaveBeenCalledWith({ reason: "fetch_error" });
    unsubscribe();
  });
});
