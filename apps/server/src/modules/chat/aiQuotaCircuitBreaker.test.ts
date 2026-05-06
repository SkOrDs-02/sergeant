import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../db.js", () => {
  const pool = { query: vi.fn() };
  return { default: pool, pool };
});

import { resetDbErrorWindow } from "./aiQuotaHealth.js";
import {
  AiQuotaCircuitBreaker,
  CircuitState,
} from "./aiQuotaCircuitBreaker.js";

beforeEach(() => {
  resetDbErrorWindow();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AiQuotaCircuitBreaker", () => {
  it("starts CLOSED and isAllowing()=true", () => {
    const breaker = new AiQuotaCircuitBreaker();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.isAllowing()).toBe(true);
  });

  it("opens after `threshold` failures within window", () => {
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 3,
      windowMs: 60_000,
      openDurationMs: 60_000,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    expect(breaker.isAllowing()).toBe(false);
  });

  it("does NOT open if failures spread beyond window (sliding eviction)", () => {
    const now = vi.fn();
    let t = 0;
    now.mockImplementation(() => t);
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 3,
      windowMs: 1_000,
      openDurationMs: 60_000,
      now,
    });
    // Date.now усередині `recordDbError` — справжній. Перевіряємо real-time.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
    t = Date.parse("2026-05-01T00:00:00Z");
    breaker.recordFailure();

    vi.setSystemTime(new Date("2026-05-01T00:00:02Z"));
    t = Date.parse("2026-05-01T00:00:02Z");
    breaker.recordFailure();

    vi.setSystemTime(new Date("2026-05-01T00:00:04Z"));
    t = Date.parse("2026-05-01T00:00:04Z");
    breaker.recordFailure();
    // у вікні 1s одночасно — лише 1 помилка → breaker лишається CLOSED.
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it("transitions OPEN → HALF_OPEN after openDurationMs and allows probe", () => {
    let nowMs = 0;
    const now = () => nowMs;
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      windowMs: 60_000,
      openDurationMs: 5_000,
      now,
    });
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    expect(breaker.isAllowing()).toBe(false);

    nowMs += 4_999;
    expect(breaker.isAllowing()).toBe(false);

    nowMs += 2; // 5_001 ms passed
    expect(breaker.isAllowing()).toBe(true);
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it("HALF_OPEN closes on first success", () => {
    let nowMs = 0;
    const now = () => nowMs;
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      windowMs: 60_000,
      openDurationMs: 1_000,
      now,
    });
    breaker.recordFailure();
    nowMs += 1_500;
    breaker.isAllowing(); // triggers HALF_OPEN

    breaker.recordSuccess();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.isAllowing()).toBe(true);
  });

  it("HALF_OPEN reopens on failure", () => {
    let nowMs = 0;
    const now = () => nowMs;
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      windowMs: 60_000,
      openDurationMs: 1_000,
      now,
    });
    breaker.recordFailure();
    nowMs += 1_500;
    breaker.isAllowing(); // triggers HALF_OPEN
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it("threshold=0 disables breaker (kill-switch)", () => {
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 0,
      windowMs: 60_000,
      openDurationMs: 60_000,
    });
    for (let i = 0; i < 100; i++) breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.isAllowing()).toBe(true);
  });

  it("getRetryAfterMs() returns 0 when CLOSED, decreasing ms when OPEN", () => {
    let nowMs = 1_000;
    const now = () => nowMs;
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      openDurationMs: 5_000,
      now,
    });
    expect(breaker.getRetryAfterMs()).toBe(0);
    breaker.recordFailure();
    expect(breaker.getRetryAfterMs()).toBe(5_000);
    nowMs += 2_000;
    expect(breaker.getRetryAfterMs()).toBe(3_000);
    nowMs += 10_000;
    expect(breaker.getRetryAfterMs()).toBe(0);
  });

  it("reset() forces CLOSED from OPEN", () => {
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      windowMs: 60_000,
      openDurationMs: 60_000,
    });
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    breaker.reset();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it("invokes onStateChange callback for transitions", () => {
    const onStateChange = vi.fn();
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      openDurationMs: 60_000,
      onStateChange,
    });
    breaker.recordFailure();
    expect(onStateChange).toHaveBeenCalledWith(
      CircuitState.CLOSED,
      CircuitState.OPEN,
    );
  });

  it("swallows errors thrown by onStateChange", () => {
    const onStateChange = vi.fn(() => {
      throw new Error("listener boom");
    });
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      openDurationMs: 60_000,
      onStateChange,
    });
    expect(() => breaker.recordFailure()).not.toThrow();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });
});
