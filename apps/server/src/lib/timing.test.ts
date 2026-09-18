import { afterEach, describe, expect, it, vi } from "vitest";

import { elapsedMs, isAbortError, sleep } from "./timing.js";

describe("timing helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("computes elapsed milliseconds from hrtime bigint values", () => {
    vi.spyOn(process.hrtime, "bigint").mockReturnValue(10_000_000n);

    expect(elapsedMs(7_500_000n)).toBe(2.5);
  });

  it("detects AbortError and TimeoutError objects", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError({ name: "TimeoutError" })).toBe(true);
    expect(isAbortError({ name: "OtherError" })).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });

  it("resolves sleep after the requested delay", async () => {
    vi.useFakeTimers();
    const promise = sleep(25);

    await vi.advanceTimersByTimeAsync(24);
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toBe(true);
  });
});
