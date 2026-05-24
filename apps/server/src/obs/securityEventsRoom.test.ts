import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pingSecurityRoom } from "./securityEventsRoom.js";

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
  securityRoomUnreachableTotal: { inc: (...args: unknown[]) => incMock(...args) },
}));

describe("pingSecurityRoom — I7 boot reachability heartbeat", () => {
  const ORIG_ENV = {
    SECURITY_EVENTS_MUTED: process.env["SECURITY_EVENTS_MUTED"],
    SERGEANT_ALERT_BOT_TOKEN: process.env["SERGEANT_ALERT_BOT_TOKEN"],
    SERGEANT_OPS_CHAT_ID: process.env["SERGEANT_OPS_CHAT_ID"],
  };

  beforeEach(() => {
    incMock.mockClear();
    delete process.env["SECURITY_EVENTS_MUTED"];
    delete process.env["SERGEANT_ALERT_BOT_TOKEN"];
    delete process.env["SERGEANT_OPS_CHAT_ID"];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(ORIG_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
  });

  it("returns ok=true with reason 'muted' when SECURITY_EVENTS_MUTED=1", async () => {
    process.env["SECURITY_EVENTS_MUTED"] = "1";
    const result = await pingSecurityRoom();
    expect(result).toEqual({ ok: true, reason: "muted" });
    expect(incMock).not.toHaveBeenCalled();
  });

  it("returns ok=false 'bot_token_missing' and bumps counter when token unset", async () => {
    process.env["SERGEANT_OPS_CHAT_ID"] = "12345";
    const result = await pingSecurityRoom();
    expect(result).toEqual({ ok: false, reason: "bot_token_missing" });
    expect(incMock).toHaveBeenCalledWith({ reason: "bot_token_missing" });
  });

  it("returns ok=false 'chat_id_missing' and bumps counter when chat unset", async () => {
    process.env["SERGEANT_ALERT_BOT_TOKEN"] = "test-token";
    const result = await pingSecurityRoom();
    expect(result).toEqual({ ok: false, reason: "chat_id_missing" });
    expect(incMock).toHaveBeenCalledWith({ reason: "chat_id_missing" });
  });

  it("returns ok=true when Telegram getMe returns 200", async () => {
    process.env["SERGEANT_ALERT_BOT_TOKEN"] = "test-token";
    process.env["SERGEANT_OPS_CHAT_ID"] = "12345";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pingSecurityRoom();

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/getMe",
    );
    expect(incMock).not.toHaveBeenCalled();
  });

  it("returns ok=false 'http_4xx' and bumps counter on 401 (rotated token)", async () => {
    process.env["SERGEANT_ALERT_BOT_TOKEN"] = "expired-token";
    process.env["SERGEANT_OPS_CHAT_ID"] = "12345";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const result = await pingSecurityRoom();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("http_4xx:401");
    expect(incMock).toHaveBeenCalledWith({ reason: "http_4xx" });
  });

  it("returns ok=false 'http_5xx' and bumps counter on 503 (Telegram outage)", async () => {
    process.env["SERGEANT_ALERT_BOT_TOKEN"] = "test-token";
    process.env["SERGEANT_OPS_CHAT_ID"] = "12345";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    const result = await pingSecurityRoom();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("http_5xx:503");
    expect(incMock).toHaveBeenCalledWith({ reason: "http_5xx" });
  });

  it("returns ok=false and bumps 'fetch_error' counter on network exception", async () => {
    process.env["SERGEANT_ALERT_BOT_TOKEN"] = "test-token";
    process.env["SERGEANT_OPS_CHAT_ID"] = "12345";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ENOTFOUND api.telegram.org")),
    );

    const result = await pingSecurityRoom();

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ENOTFOUND");
    expect(incMock).toHaveBeenCalledWith({ reason: "fetch_error" });
  });
});
