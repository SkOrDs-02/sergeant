// @vitest-environment jsdom
import { ApiError } from "@sergeant/api-client";
import { describe, expect, it, vi } from "vitest";
import { retryAsync } from "./retryAsync";

const networkErr = () =>
  new ApiError({
    kind: "network",
    message: "offline",
    url: "https://example.com",
  });

const httpErr = (status: number) =>
  new ApiError({
    kind: "http",
    status,
    message: `http ${status}`,
    url: "https://example.com",
  });

const sleepNoop = (_ms: number) => Promise.resolve();
const makeSleepSpy = () =>
  vi.fn<(ms: number) => Promise<void>>((_ms) => Promise.resolve());

describe("retryAsync", () => {
  it("returns the value on first success without sleeping", async () => {
    const fn = vi.fn(async () => "ok");
    const sleep = makeSleepSpy();
    const result = await retryAsync(fn, { sleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries network errors then resolves", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt += 1;
      if (attempt < 3) throw networkErr();
      return "done";
    });
    const sleep = makeSleepSpy();
    const result = await retryAsync(fn, { sleep });
    expect(result).toBe("done");
    expect(fn).toHaveBeenCalledTimes(3);
    // Two retries → two sleeps with the default 1s, 2s schedule.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("retries 5xx HTTP errors", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw httpErr(503);
      return "done";
    });
    const sleep = makeSleepSpy();
    expect(await retryAsync(fn, { sleep })).toBe("done");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx HTTP errors", async () => {
    const err = httpErr(401);
    const fn = vi.fn(async () => {
      throw err;
    });
    const sleep = makeSleepSpy();
    await expect(retryAsync(fn, { sleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry plain Error instances", async () => {
    const err = new Error("non-api");
    const fn = vi.fn(async () => {
      throw err;
    });
    await expect(retryAsync(fn, { sleep: sleepNoop })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects custom maxRetries=0 (no retries)", async () => {
    const err = networkErr();
    const fn = vi.fn(async () => {
      throw err;
    });
    await expect(
      retryAsync(fn, { maxRetries: 0, sleep: sleepNoop }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows the last error after exhausting retries", async () => {
    const err = networkErr();
    const fn = vi.fn(async () => {
      throw err;
    });
    const sleep = makeSleepSpy();
    await expect(retryAsync(fn, { sleep })).rejects.toBe(err);
    // 1 initial + 3 retries = 4 calls, 3 sleeps.
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("uses provided custom delays array", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt += 1;
      if (attempt < 4) throw networkErr();
      return "ok";
    });
    const sleep = makeSleepSpy();
    await retryAsync(fn, { delaysMs: [10, 20, 30], sleep });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20, 30]);
  });

  it("clamps delay to last entry when retries exceed delays length", async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt += 1;
      if (attempt < 5) throw networkErr();
      return "ok";
    });
    const sleep = makeSleepSpy();
    await retryAsync(fn, {
      delaysMs: [10, 20],
      maxRetries: 4,
      sleep,
    });
    // Schedule: 10, 20, 20, 20 (clamped to last entry).
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20, 20, 20]);
  });
});
