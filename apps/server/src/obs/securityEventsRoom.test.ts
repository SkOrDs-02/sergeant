import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
