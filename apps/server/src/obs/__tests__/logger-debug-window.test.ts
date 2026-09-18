import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enableDebugWindow,
  disableDebugWindow,
  debugWindowRemainingMs,
  currentLogLevel,
} from "../logger.js";

describe("debug-window", () => {
  beforeEach(() => {
    disableDebugWindow();
  });

  afterEach(() => {
    disableDebugWindow();
    vi.useRealTimers();
  });

  it("currentLogLevel returns a valid pino level when no window active", () => {
    const level = currentLogLevel();
    expect(["fatal", "error", "warn", "info", "debug", "trace"]).toContain(
      level,
    );
  });

  it("currentLogLevel returns debug after enableDebugWindow", () => {
    vi.useFakeTimers();
    enableDebugWindow(60_000, "test-user");
    expect(currentLogLevel()).toBe("debug");
  });

  it("currentLogLevel reverts to base level after window expires", () => {
    vi.useFakeTimers();
    const base = currentLogLevel(); // capture before enabling window
    enableDebugWindow(1_000, "test-user");
    expect(currentLogLevel()).toBe("debug");
    vi.advanceTimersByTime(1_001);
    expect(currentLogLevel()).toBe(base);
  });

  it("debugWindowRemainingMs returns 0 when no window", () => {
    expect(debugWindowRemainingMs()).toBe(0);
  });

  it("debugWindowRemainingMs returns positive when window active", () => {
    vi.useFakeTimers();
    enableDebugWindow(60_000, "test-user");
    expect(debugWindowRemainingMs()).toBeGreaterThan(59_000);
  });

  it("caps duration at 30 minutes", () => {
    vi.useFakeTimers();
    enableDebugWindow(90 * 60 * 1000, "test-user");
    expect(debugWindowRemainingMs()).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it("disableDebugWindow clears active window", () => {
    vi.useFakeTimers();
    const base = currentLogLevel();
    enableDebugWindow(60_000, "test-user");
    expect(currentLogLevel()).toBe("debug");
    disableDebugWindow();
    expect(debugWindowRemainingMs()).toBe(0);
    expect(currentLogLevel()).toBe(base);
  });
});
