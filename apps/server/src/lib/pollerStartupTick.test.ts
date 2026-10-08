import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_STARTUP_DELAY_MAX_MS,
  DEFAULT_STARTUP_DELAY_MIN_MS,
  resolveStartupDelayMs,
  scheduleStartupTick,
} from "./pollerStartupTick.js";

describe("resolveStartupDelayMs", () => {
  it("явне додатне значення має пріоритет", () => {
    expect(resolveStartupDelayMs(1234)).toBe(1234);
  });

  it("0, від'ємне і не-скінченне значення вимикають тік", () => {
    expect(resolveStartupDelayMs(0)).toBe(0);
    expect(resolveStartupDelayMs(-5)).toBe(0);
    expect(resolveStartupDelayMs(Number.NaN)).toBe(0);
    expect(resolveStartupDelayMs(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("без значення - jitter у межах діапазону за замовчуванням", () => {
    expect(resolveStartupDelayMs(undefined, undefined, () => 0)).toBe(
      DEFAULT_STARTUP_DELAY_MIN_MS,
    );
    expect(resolveStartupDelayMs(undefined, undefined, () => 0.999999)).toBe(
      DEFAULT_STARTUP_DELAY_MAX_MS,
    );
    const mid = resolveStartupDelayMs(undefined, undefined, () => 0.5);
    expect(mid).toBe(60_000);
  });

  it("власний діапазон", () => {
    expect(
      resolveStartupDelayMs(
        undefined,
        { minMs: 5_000, maxMs: 15_000 },
        () => 0,
      ),
    ).toBe(5_000);
  });
});

describe("scheduleStartupTick", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("delay <= 0 нічого не планує", () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    expect(scheduleStartupTick(0, tick, vi.fn())).toBeNull();
    expect(scheduleStartupTick(-1, tick, vi.fn())).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("викликає tick рівно один раз після затримки", async () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    scheduleStartupTick(1_000, tick, vi.fn());
    await vi.advanceTimersByTimeAsync(999);
    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("clearTimeout гасить тік", async () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const timer = scheduleStartupTick(1_000, tick, vi.fn());
    clearTimeout(timer ?? undefined);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(tick).not.toHaveBeenCalled();
  });

  it("відхилення і синхронний throw tick-а йдуть в onError, а не в unhandledRejection", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    scheduleStartupTick(10, () => Promise.reject(new Error("async")), onError);
    scheduleStartupTick(
      10,
      () => {
        throw new Error("sync");
      },
      onError,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
