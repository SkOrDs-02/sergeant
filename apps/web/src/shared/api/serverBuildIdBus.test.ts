import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  subscribeServerBuildId,
  publishServerBuildId,
  __resetServerBuildIdObserversForTests,
} from "./serverBuildIdBus";

beforeEach(() => {
  __resetServerBuildIdObserversForTests();
});
afterEach(() => {
  __resetServerBuildIdObserversForTests();
  vi.restoreAllMocks();
});

describe("subscribeServerBuildId / publishServerBuildId", () => {
  it("delivers a trimmed build id to all subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeServerBuildId(a);
    subscribeServerBuildId(b);
    publishServerBuildId("  abc123  ");
    expect(a).toHaveBeenCalledWith("abc123");
    expect(b).toHaveBeenCalledWith("abc123");
  });

  it("unsubscribe stops further deliveries (and is idempotent)", () => {
    const observer = vi.fn();
    const unsub = subscribeServerBuildId(observer);
    publishServerBuildId("v1");
    unsub();
    unsub(); // second call must not throw
    publishServerBuildId("v2");
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith("v1");
  });

  it("ignores non-string values", () => {
    const observer = vi.fn();
    subscribeServerBuildId(observer);
    publishServerBuildId(null);
    publishServerBuildId(undefined);
    expect(observer).not.toHaveBeenCalled();
  });

  it("ignores empty / whitespace-only values", () => {
    const observer = vi.fn();
    subscribeServerBuildId(observer);
    publishServerBuildId("");
    publishServerBuildId("   ");
    expect(observer).not.toHaveBeenCalled();
  });

  it("isolates a throwing observer from the rest", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeServerBuildId(bad);
    subscribeServerBuildId(good);
    expect(() => publishServerBuildId("v3")).not.toThrow();
    expect(good).toHaveBeenCalledWith("v3");
  });

  it("does not double-register the same observer (Set semantics)", () => {
    const observer = vi.fn();
    subscribeServerBuildId(observer);
    subscribeServerBuildId(observer);
    publishServerBuildId("once");
    expect(observer).toHaveBeenCalledTimes(1);
  });

  it("__resetServerBuildIdObserversForTests clears all subscribers", () => {
    const observer = vi.fn();
    subscribeServerBuildId(observer);
    __resetServerBuildIdObserversForTests();
    publishServerBuildId("after-reset");
    expect(observer).not.toHaveBeenCalled();
  });
});
