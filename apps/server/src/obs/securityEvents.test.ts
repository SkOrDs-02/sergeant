import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  emitSecurityEvent,
  onSecurityEvent,
  offSecurityEvent,
  _resetRateLimitState,
  _listenerCount,
  MAX_EVENTS_PER_MINUTE,
  type ResolvedSecurityEvent,
  type SecurityEvent,
} from "./securityEvents.js";

// ─── mock pino logger so we can verify log calls without real pino init ───
vi.mock("./logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from "./logger.js";

// ─────────────────────────────────────────────────────────────────────────────

describe("securityEvents emitter", () => {
  beforeEach(() => {
    _resetRateLimitState();
    vi.clearAllMocks();
    // Remove any listeners registered by other tests.
    // offSecurityEvent needs the reference, so we use a fresh test per listener.
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── basic emission ─────────────────────────────────────────────────────

  it("calls listeners with a resolved event", () => {
    const received: ResolvedSecurityEvent[] = [];
    const unsub = onSecurityEvent((e) => received.push(e));

    emitSecurityEvent({
      event: "mono_webhook_bad_payload",
      severity: "high",
      details: "test",
    });

    expect(received).toHaveLength(1);
    const r = received[0]!;
    expect(r.event).toBe("mono_webhook_bad_payload");
    expect(r.severity).toBe("high");
    expect(r.details).toBe("test");
    // timestamp auto-set as ISO string
    expect(r.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    unsub();
  });

  it("preserves caller-provided timestamp", () => {
    const received: ResolvedSecurityEvent[] = [];
    const unsub = onSecurityEvent((e) => received.push(e));

    const ts = "2026-01-01T00:00:00.000Z";
    emitSecurityEvent({
      event: "auth_session_ua_drift",
      severity: "medium",
      details: "drift",
      timestamp: ts,
    });

    expect(received[0]!.timestamp).toBe(ts);
    unsub();
  });

  it("passes userIdHash through", () => {
    const received: ResolvedSecurityEvent[] = [];
    const unsub = onSecurityEvent((e) => received.push(e));

    emitSecurityEvent({
      event: "chat_tool_cap_hit",
      severity: "high",
      userIdHash: "abcd1234abcd1234",
      details: "cap",
    });

    expect(received[0]!.userIdHash).toBe("abcd1234abcd1234");
    unsub();
  });

  // ─── Pino level mapping ─────────────────────────────────────────────────

  it("logs critical/high events at error level", () => {
    emitSecurityEvent({
      event: "mono_webhook_bad_payload",
      severity: "critical",
      details: "x",
    });
    expect(logger.error).toHaveBeenCalledOnce();

    _resetRateLimitState();
    emitSecurityEvent({
      event: "mono_webhook_bad_payload",
      severity: "high",
      details: "x",
    });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("logs medium events at warn level", () => {
    emitSecurityEvent({
      event: "transcribe_usd_cap_hit",
      severity: "medium",
      details: "x",
    });
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ msg: "security_event_rate_limited" }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "security_event" }),
    );
  });

  it("logs info events at debug level", () => {
    emitSecurityEvent({
      event: "auth_session_ua_drift",
      severity: "info",
      details: "x",
    });
    expect(logger.debug).toHaveBeenCalledOnce();
  });

  // ─── rate limiting ──────────────────────────────────────────────────────

  it(`allows up to ${MAX_EVENTS_PER_MINUTE} events per type per minute`, () => {
    vi.useFakeTimers();
    const received: ResolvedSecurityEvent[] = [];
    const unsub = onSecurityEvent((e) => received.push(e));

    const event: SecurityEvent = {
      event: "prompt_injection_attempt",
      severity: "high",
      details: "injection",
    };

    for (let i = 0; i < MAX_EVENTS_PER_MINUTE + 5; i++) {
      emitSecurityEvent(event);
    }

    // Only MAX_EVENTS_PER_MINUTE reach listeners
    expect(received).toHaveLength(MAX_EVENTS_PER_MINUTE);

    unsub();
  });

  it("resets rate limit after 60 s window", () => {
    vi.useFakeTimers();
    const received: ResolvedSecurityEvent[] = [];
    const unsub = onSecurityEvent((e) => received.push(e));

    const event: SecurityEvent = {
      event: "chat_tool_cap_hit",
      severity: "high",
      details: "cap",
    };

    // Fill up the bucket
    for (let i = 0; i < MAX_EVENTS_PER_MINUTE; i++) {
      emitSecurityEvent(event);
    }
    // One more — rate limited
    emitSecurityEvent(event);
    expect(received).toHaveLength(MAX_EVENTS_PER_MINUTE);

    // Advance past the 60-second window
    vi.advanceTimersByTime(61_000);

    // Should pass again
    emitSecurityEvent(event);
    expect(received).toHaveLength(MAX_EVENTS_PER_MINUTE + 1);

    unsub();
  });

  it("rate-limits independently per event type", () => {
    vi.useFakeTimers();
    const received: ResolvedSecurityEvent[] = [];
    const unsub = onSecurityEvent((e) => received.push(e));

    // Fill bucket for type A
    for (let i = 0; i < MAX_EVENTS_PER_MINUTE; i++) {
      emitSecurityEvent({
        event: "mono_webhook_bad_payload",
        severity: "high",
        details: "a",
      });
    }

    // Type B should still pass
    emitSecurityEvent({
      event: "auth_session_ua_drift",
      severity: "medium",
      details: "b",
    });

    const aCount = received.filter(
      (e) => e.event === "mono_webhook_bad_payload",
    ).length;
    const bCount = received.filter(
      (e) => e.event === "auth_session_ua_drift",
    ).length;
    expect(aCount).toBe(MAX_EVENTS_PER_MINUTE);
    expect(bCount).toBe(1);

    unsub();
  });

  it("logs a warn when an event is rate-limited", () => {
    vi.useFakeTimers();
    const event: SecurityEvent = {
      event: "prompt_injection_attempt",
      severity: "high",
      details: "inj",
    };
    // Exhaust the bucket
    for (let i = 0; i < MAX_EVENTS_PER_MINUTE; i++) {
      emitSecurityEvent(event);
    }
    vi.clearAllMocks();
    // Trigger rate-limit log
    emitSecurityEvent(event);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "security_event_rate_limited" }),
    );
  });

  // ─── listener management ────────────────────────────────────────────────

  it("onSecurityEvent returns an unsubscribe function", () => {
    const before = _listenerCount();
    const unsub = onSecurityEvent(() => {});
    expect(_listenerCount()).toBe(before + 1);
    unsub();
    expect(_listenerCount()).toBe(before);
  });

  it("offSecurityEvent is a no-op for unknown listener", () => {
    const before = _listenerCount();
    offSecurityEvent(() => {});
    expect(_listenerCount()).toBe(before);
  });

  it("isolates listener errors — does not propagate to caller", () => {
    const received: ResolvedSecurityEvent[] = [];
    const good = onSecurityEvent((e) => received.push(e));
    const bad = onSecurityEvent(() => {
      throw new Error("listener failure");
    });

    expect(() =>
      emitSecurityEvent({
        event: "transcribe_usd_cap_hit",
        severity: "medium",
        details: "cap",
      }),
    ).not.toThrow();

    // Good listener still fires
    expect(received).toHaveLength(1);

    good();
    bad();
  });

  // ─── event shape validation (sanity) ───────────────────────────────────

  it("emits all defined event names without throwing", () => {
    const events: Array<SecurityEvent["event"]> = [
      "mono_webhook_bad_payload",
      "auth_session_ua_drift",
      "prompt_injection_attempt",
      "transcribe_usd_cap_hit",
      "chat_tool_cap_hit",
    ];
    for (const name of events) {
      expect(() =>
        emitSecurityEvent({ event: name, severity: "info", details: "test" }),
      ).not.toThrow();
    }
  });
});
