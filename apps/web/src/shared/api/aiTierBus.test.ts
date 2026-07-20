import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  subscribeAiTier,
  publishAiTier,
  getLastAiTier,
  __resetAiTierForTests,
} from "./aiTierBus";

beforeEach(() => {
  __resetAiTierForTests();
});
afterEach(() => {
  __resetAiTierForTests();
  vi.restoreAllMocks();
});

describe("subscribeAiTier / publishAiTier", () => {
  it("delivers a trimmed tier to all subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeAiTier(a);
    subscribeAiTier(b);
    publishAiTier("  standard  ");
    expect(a).toHaveBeenCalledWith("standard");
    expect(b).toHaveBeenCalledWith("standard");
  });

  it("unsubscribe stops further deliveries (and is idempotent)", () => {
    const observer = vi.fn();
    const unsub = subscribeAiTier(observer);
    publishAiTier("premium");
    unsub();
    unsub(); // second call must not throw
    publishAiTier("floor");
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith("premium");
  });

  it("ignores non-string and unrecognized values", () => {
    const observer = vi.fn();
    subscribeAiTier(observer);
    publishAiTier(null);
    publishAiTier(undefined);
    publishAiTier("legendary");
    expect(observer).not.toHaveBeenCalled();
  });

  it("isolates a throwing observer from the rest", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeAiTier(bad);
    subscribeAiTier(good);
    expect(() => publishAiTier("floor")).not.toThrow();
    expect(good).toHaveBeenCalledWith("floor");
  });

  it("getLastAiTier returns null before any publish, then the last valid tier", () => {
    expect(getLastAiTier()).toBeNull();
    publishAiTier("premium");
    expect(getLastAiTier()).toBe("premium");
    publishAiTier("garbage");
    expect(getLastAiTier()).toBe("premium"); // unrecognized value ignored
    publishAiTier("standard");
    expect(getLastAiTier()).toBe("standard");
  });

  it("__resetAiTierForTests clears observers and last-seen tier", () => {
    const observer = vi.fn();
    subscribeAiTier(observer);
    publishAiTier("floor");
    __resetAiTierForTests();
    expect(getLastAiTier()).toBeNull();
    publishAiTier("premium");
    expect(observer).not.toHaveBeenCalledWith("premium");
  });
});
