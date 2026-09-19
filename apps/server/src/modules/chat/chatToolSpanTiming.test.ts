import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  markToolTurnIssued,
  takeToolTurnLatencyMs,
  __resetChatToolSpanTimingForTests,
  __chatToolSpanTimingStoreSize,
} from "./chatToolSpanTiming.js";

beforeEach(() => {
  __resetChatToolSpanTimingForTests();
  vi.useRealTimers();
});

describe("chatToolSpanTiming — best-effort $ai_span latency (0025 Фаза 2)", () => {
  it("повертає elapsed ms між issue і take, і споживає запис одноразово", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    markToolTurnIssued("trace-1");
    vi.setSystemTime(now + 250);
    expect(takeToolTurnLatencyMs("trace-1")).toBe(250);
    // Одноразовий read — повторний take того самого traceId вже undefined.
    expect(takeToolTurnLatencyMs("trace-1")).toBeUndefined();
    vi.useRealTimers();
  });

  it("невідомий traceId → undefined, не кидає", () => {
    expect(takeToolTurnLatencyMs("never-issued")).toBeUndefined();
  });

  it("протух за TTL (120s) → undefined, як і без запису", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    markToolTurnIssued("trace-2");
    vi.setSystemTime(now + 121_000);
    expect(takeToolTurnLatencyMs("trace-2")).toBeUndefined();
    vi.useRealTimers();
  });

  it("незалежні traceId не заважають один одному", () => {
    markToolTurnIssued("a");
    markToolTurnIssued("b");
    expect(__chatToolSpanTimingStoreSize()).toBe(2);
    expect(takeToolTurnLatencyMs("a")).toBeGreaterThanOrEqual(0);
    expect(__chatToolSpanTimingStoreSize()).toBe(1);
    expect(takeToolTurnLatencyMs("b")).toBeGreaterThanOrEqual(0);
    expect(__chatToolSpanTimingStoreSize()).toBe(0);
  });
});
