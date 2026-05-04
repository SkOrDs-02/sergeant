import { afterEach, describe, expect, it } from "vitest";
import {
  getCounter,
  getMetricsSnapshot,
  incrementCounter,
  OPENCLAW_PER_CALL_CAP_HIT_TOTAL,
  resetMetricsForTesting,
} from "./metrics.js";

afterEach(() => {
  resetMetricsForTesting();
});

describe("metrics", () => {
  it("starts at zero for any never-touched counter", () => {
    expect(getCounter("nonexistent.counter")).toBe(0);
  });

  it("increments by 1 by default", () => {
    incrementCounter("test.counter");
    incrementCounter("test.counter");
    expect(getCounter("test.counter")).toBe(2);
  });

  it("increments by an explicit delta", () => {
    incrementCounter("test.counter", 5);
    incrementCounter("test.counter", 3);
    expect(getCounter("test.counter")).toBe(8);
  });

  it("isolates counters by name", () => {
    incrementCounter("a");
    incrementCounter("b");
    incrementCounter("b");
    expect(getCounter("a")).toBe(1);
    expect(getCounter("b")).toBe(2);
  });

  it("snapshot returns all touched counters", () => {
    incrementCounter("a");
    incrementCounter("b", 5);
    expect(getMetricsSnapshot()).toEqual({ a: 1, b: 5 });
  });

  it("OPENCLAW_PER_CALL_CAP_HIT_TOTAL is the M18 counter name", () => {
    // Locks the public counter name — log-pipelines / dashboards key
    // off this string so renaming is a breaking change.
    expect(OPENCLAW_PER_CALL_CAP_HIT_TOTAL).toBe(
      "openclaw.per_call_cap_hit_total",
    );
  });
});
