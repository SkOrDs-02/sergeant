import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../db.js", () => {
  const pool = { query: vi.fn() };
  return { default: pool, pool };
});

const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));
vi.mock("../../sentry.js", () => ({
  Sentry: { captureMessage: captureMessageMock },
}));

import { resetDbErrorWindow } from "./aiQuotaHealth.js";
import {
  AiQuotaCircuitBreaker,
  CircuitState,
} from "./aiQuotaCircuitBreaker.js";
import { aiQuotaCircuitOpenTotal } from "../../obs/metrics.js";

async function readCounter(labels: Record<string, string>): Promise<number> {
  // prom-client `Counter#get()` повертає Promise з агрегованим snapshot-ом
  // (`{ values: [{ value, labels }] }`). Для тестів зручніше дочекатись,
  // ніж лізти у внутрішній `hashMap`.
  const out = (await aiQuotaCircuitOpenTotal.get()) as {
    values: Array<{ value: number; labels: Record<string, string> }>;
  };
  if (!out || !Array.isArray(out.values)) return 0;
  const row = out.values.find((v) =>
    Object.entries(labels).every(([k, val]) => v.labels[k] === val),
  );
  return row?.value ?? 0;
}

beforeEach(() => {
  resetDbErrorWindow();
  aiQuotaCircuitOpenTotal.reset();
  captureMessageMock.mockClear();
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

  // ────────────────── PR-05: metric + Sentry alert ──────────────────

  it("PR-05: increments ai_quota_circuit_open_total{from=closed} on close→open", async () => {
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      openDurationMs: 60_000,
    });
    expect(await readCounter({ from: "closed" })).toBe(0);
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    expect(await readCounter({ from: "closed" })).toBe(1);
    expect(await readCounter({ from: "half-open" })).toBe(0);
  });

  it("PR-05: increments ai_quota_circuit_open_total{from=half-open} on half_open→open flap", async () => {
    let nowMs = 0;
    const now = () => nowMs;
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      openDurationMs: 1_000,
      now,
    });
    breaker.recordFailure();
    nowMs += 1_500;
    breaker.isAllowing(); // → HALF_OPEN
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    expect(await readCounter({ from: "closed" })).toBe(1);
    expect(await readCounter({ from: "half-open" })).toBe(1);
  });

  it("PR-05: does NOT increment counter on transitions that are not into OPEN", async () => {
    let nowMs = 0;
    const now = () => nowMs;
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      openDurationMs: 1_000,
      now,
    });
    breaker.recordFailure(); // closed→open (1)
    nowMs += 1_500;
    breaker.isAllowing(); // open→half-open (no inc)
    breaker.recordSuccess(); // half-open→closed (no inc)
    expect(await readCounter({ from: "closed" })).toBe(1);
    expect(await readCounter({ from: "half-open" })).toBe(0);
  });

  it("PR-05: captures Sentry message on close→open with correct tags + extra", () => {
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 2,
      windowMs: 30_000,
      openDurationMs: 120_000,
    });
    breaker.recordFailure(new Error("ECONNREFUSED"));
    expect(captureMessageMock).not.toHaveBeenCalled();
    breaker.recordFailure(new Error("ECONNREFUSED"));
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [msg, opts] = captureMessageMock.mock.calls[0]!;
    expect(msg).toMatch(/AI-quota DB circuit-breaker opened/);
    expect(msg).toMatch(/closed→open/);
    expect(opts).toMatchObject({
      level: "error",
      tags: {
        module: "chat",
        op: "ai_quota_circuit_open",
        breaker: "ai_quota",
        from: "closed",
      },
      extra: {
        threshold: 2,
        windowMs: 30_000,
        openDurationMs: 120_000,
      },
    });
  });

  it("PR-05: captures Sentry message on half_open→open with from=half-open", () => {
    let nowMs = 0;
    const now = () => nowMs;
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      openDurationMs: 1_000,
      now,
    });
    breaker.recordFailure();
    captureMessageMock.mockClear();
    nowMs += 1_500;
    breaker.isAllowing();
    breaker.recordFailure();
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [msg, opts] = captureMessageMock.mock.calls[0]!;
    expect(msg).toMatch(/half-open→open/);
    expect(opts.tags.from).toBe("half-open");
  });

  it("PR-05: breaker still opens even if Sentry.captureMessage throws", async () => {
    captureMessageMock.mockImplementationOnce(() => {
      throw new Error("sentry boom");
    });
    const breaker = new AiQuotaCircuitBreaker({
      threshold: 1,
      openDurationMs: 60_000,
    });
    expect(() => breaker.recordFailure()).not.toThrow();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    expect(await readCounter({ from: "closed" })).toBe(1);
  });
});
