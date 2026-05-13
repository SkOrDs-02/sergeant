import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import {
  __resetExitInProgressForTests,
  computeFatalExitDelayMs,
  exitFatalWithBackoff,
  FATAL_EXIT_BASE_DELAY_MS,
  FATAL_EXIT_JITTER_MAX_MS,
  registerProcessLifecycle,
  SHUTDOWN_HARD_TIMEOUT_MS,
} from "./bot-lifecycle.js";

afterEach(() => {
  __resetExitInProgressForTests();
  vi.useRealTimers();
});

describe("computeFatalExitDelayMs", () => {
  it("clamps non-finite/negative random sources to baseline delay", () => {
    expect(computeFatalExitDelayMs(() => NaN)).toBe(FATAL_EXIT_BASE_DELAY_MS);
    expect(computeFatalExitDelayMs(() => -0.5)).toBe(FATAL_EXIT_BASE_DELAY_MS);
  });

  it("clamps random ≥ 1 to baseline + max jitter", () => {
    expect(computeFatalExitDelayMs(() => 1)).toBe(
      FATAL_EXIT_BASE_DELAY_MS + FATAL_EXIT_JITTER_MAX_MS,
    );
    expect(computeFatalExitDelayMs(() => 2)).toBe(
      FATAL_EXIT_BASE_DELAY_MS + FATAL_EXIT_JITTER_MAX_MS,
    );
  });

  it("computes proportional jitter between baseline and baseline+max", () => {
    const half = computeFatalExitDelayMs(() => 0.5);
    expect(half).toBeGreaterThanOrEqual(FATAL_EXIT_BASE_DELAY_MS);
    expect(half).toBeLessThanOrEqual(
      FATAL_EXIT_BASE_DELAY_MS + FATAL_EXIT_JITTER_MAX_MS,
    );
    expect(half).toBe(FATAL_EXIT_BASE_DELAY_MS + 1000);
  });

  it("supervisor SLA: max in-process delay stays well under 30s", () => {
    // Pain P9 invariant: in-process backoff < 30s so Railway supervisor
    // sees crashes promptly. Hard ceiling: base + jitter = 3s.
    expect(FATAL_EXIT_BASE_DELAY_MS + FATAL_EXIT_JITTER_MAX_MS).toBeLessThan(
      30_000,
    );
  });
});

describe("exitFatalWithBackoff", () => {
  it("logs structured JSON then calls exit(1) after the jittered delay", async () => {
    const lines: string[] = [];
    const exit = vi.fn();
    const sleep = vi.fn(async () => {});
    await exitFatalWithBackoff("uncaughtException", new Error("boom"), {
      sleep,
      random: () => 0.5,
      exit,
      log: (line: string) => lines.push(line),
    });
    expect(sleep).toHaveBeenCalledOnce();
    const firstCall = sleep.mock.calls[0] as [number] | undefined;
    expect(firstCall?.[0]).toBe(FATAL_EXIT_BASE_DELAY_MS + 1000);
    expect(exit).toHaveBeenCalledWith(1);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({
      level: "fatal",
      service: "sergeant-console",
      msg: "console_fatal_exit",
      reason: "uncaughtException",
      delay_ms: FATAL_EXIT_BASE_DELAY_MS + 1000,
      err: { name: "Error", message: "boom" },
    });
    expect(parsed.err.stack).toContain("Error");
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("serializes non-Error rejections via String() coercion", async () => {
    const lines: string[] = [];
    const exit = vi.fn();
    await exitFatalWithBackoff("unhandledRejection", "string-reason", {
      sleep: async () => {},
      random: () => 0,
      exit,
      log: (line: string) => lines.push(line),
    });
    expect(JSON.parse(lines[0]!).err).toEqual({
      name: "non-error",
      message: "string-reason",
    });
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("is idempotent: re-entrance during sleep does not double-exit", async () => {
    const lines: string[] = [];
    const exit = vi.fn();
    let resolveFirstSleep: () => void;
    const firstSleep = new Promise<void>((resolve) => {
      resolveFirstSleep = resolve;
    });
    const sleep = vi.fn().mockImplementationOnce(() => firstSleep);

    const inflight = exitFatalWithBackoff("uncaughtException", new Error("A"), {
      sleep,
      random: () => 0,
      exit,
      log: (line: string) => lines.push(line),
    });
    // While the first call is mid-sleep, fire a second one.
    await exitFatalWithBackoff("unhandledRejection", new Error("B"), {
      sleep,
      random: () => 0,
      exit,
      log: (line: string) => lines.push(line),
    });
    resolveFirstSleep!();
    await inflight;
    // Only the first call should have logged + exited.
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).reason).toBe("uncaughtException");
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

describe("registerProcessLifecycle", () => {
  it("routes uncaughtException through the fatal-exit path", async () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    const lines: string[] = [];
    const dispose = registerProcessLifecycle({
      target,
      log: (line: string) => lines.push(line),
      exit,
      fatalOptions: { sleep: async () => {}, random: () => 0 },
    });
    target.emit("uncaughtException", new Error("boom"));
    await Promise.resolve();
    await Promise.resolve();
    expect(exit).toHaveBeenCalledWith(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      msg: "console_fatal_exit",
      reason: "uncaughtException",
    });
    dispose();
  });

  it("routes unhandledRejection through the fatal-exit path", async () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    const lines: string[] = [];
    const dispose = registerProcessLifecycle({
      target,
      log: (line: string) => lines.push(line),
      exit,
      fatalOptions: { sleep: async () => {}, random: () => 0 },
    });
    target.emit("unhandledRejection", "rejected-string");
    await Promise.resolve();
    await Promise.resolve();
    expect(exit).toHaveBeenCalledWith(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      msg: "console_fatal_exit",
      reason: "unhandledRejection",
    });
    dispose();
  });

  it("on SIGTERM calls bot.stop() on each registered bot then exits 0", async () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    const lines: string[] = [];
    const consoleBotStop = vi.fn().mockResolvedValue(undefined);
    const openclawBotStop = vi.fn().mockResolvedValue(undefined);
    const dispose = registerProcessLifecycle({
      target,
      log: (line: string) => lines.push(line),
      exit,
      bots: [
        { label: "console", bot: { stop: consoleBotStop } },
        { label: "openclaw", bot: { stop: openclawBotStop } },
      ],
    });
    target.emit("SIGTERM");
    // Flush microtasks for Promise.allSettled to resolve.
    await new Promise((resolve) => setImmediate(resolve));
    expect(consoleBotStop).toHaveBeenCalledOnce();
    expect(openclawBotStop).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
    const messages = lines.map((l) => JSON.parse(l).msg);
    expect(messages).toContain("signal_received");
    expect(messages).toContain("shutdown_complete");
    dispose();
  });

  it("on SIGINT it stops bots then exits 0", async () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    const stop = vi.fn().mockResolvedValue(undefined);
    const dispose = registerProcessLifecycle({
      target,
      log: () => {},
      exit,
      bots: [{ label: "openclaw", bot: { stop } }],
    });
    target.emit("SIGINT");
    await new Promise((resolve) => setImmediate(resolve));
    expect(stop).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
    dispose();
  });

  it("a deadlocking bot.stop() does not block the supervisor — hard-timeout fires", async () => {
    vi.useFakeTimers();
    const target = new EventEmitter();
    const exit = vi.fn();
    const lines: string[] = [];
    // Never resolves — simulates a wedged long-poll close.
    const stop = vi.fn(() => new Promise<void>(() => {}));
    const dispose = registerProcessLifecycle({
      target,
      log: (line: string) => lines.push(line),
      exit,
      hardTimeoutMs: 50,
      bots: [{ label: "console", bot: { stop } }],
    });
    target.emit("SIGTERM");
    // Advance fake clock past the hard-timeout.
    await vi.advanceTimersByTimeAsync(60);
    expect(exit).toHaveBeenCalledWith(0);
    expect(
      lines.some((l) => JSON.parse(l).msg === "shutdown_hard_timeout"),
    ).toBe(true);
    dispose();
  });

  it("logs bot_stop_failed but still exits 0 when bot.stop() rejects", async () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    const lines: string[] = [];
    const failingStop = vi.fn().mockRejectedValue(new Error("wedged-socket"));
    const okStop = vi.fn().mockResolvedValue(undefined);
    const dispose = registerProcessLifecycle({
      target,
      log: (line: string) => lines.push(line),
      exit,
      bots: [
        { label: "console", bot: { stop: failingStop } },
        { label: "openclaw", bot: { stop: okStop } },
      ],
    });
    target.emit("SIGTERM");
    await new Promise((resolve) => setImmediate(resolve));
    expect(exit).toHaveBeenCalledWith(0);
    expect(failingStop).toHaveBeenCalledOnce();
    expect(okStop).toHaveBeenCalledOnce();
    const failureLog = lines
      .map((l) => JSON.parse(l))
      .find((j) => j.msg === "bot_stop_failed");
    expect(failureLog).toMatchObject({
      label: "console",
      reason: "wedged-socket",
    });
    dispose();
  });

  it("a second SIGTERM during shutdown is ignored (no double bot.stop)", async () => {
    const target = new EventEmitter();
    const exit = vi.fn();
    const stop = vi.fn().mockResolvedValue(undefined);
    const dispose = registerProcessLifecycle({
      target,
      log: () => {},
      exit,
      bots: [{ label: "console", bot: { stop } }],
    });
    target.emit("SIGTERM");
    target.emit("SIGTERM");
    target.emit("SIGINT");
    await new Promise((resolve) => setImmediate(resolve));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("dispose() detaches all four listeners cleanly", () => {
    const target = new EventEmitter();
    const dispose = registerProcessLifecycle({
      target,
      log: () => {},
      exit: () => {},
    });
    expect(target.listenerCount("uncaughtException")).toBe(1);
    expect(target.listenerCount("unhandledRejection")).toBe(1);
    expect(target.listenerCount("SIGTERM")).toBe(1);
    expect(target.listenerCount("SIGINT")).toBe(1);
    dispose();
    expect(target.listenerCount("uncaughtException")).toBe(0);
    expect(target.listenerCount("unhandledRejection")).toBe(0);
    expect(target.listenerCount("SIGTERM")).toBe(0);
    expect(target.listenerCount("SIGINT")).toBe(0);
  });

  it("SHUTDOWN_HARD_TIMEOUT_MS stays inside Railway's 30s grace period", () => {
    // Railway's signal-to-kill grace is ~30s. Our hard timeout must
    // leave headroom for Sentry flush + final stderr write.
    expect(SHUTDOWN_HARD_TIMEOUT_MS).toBeLessThan(30_000);
  });
});
