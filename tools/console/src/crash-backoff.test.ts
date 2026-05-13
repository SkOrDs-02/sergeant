import { describe, expect, it, vi } from "vitest";

import {
  ALERT_RESTART_THRESHOLD,
  ALERT_WINDOW_MS,
  BACKOFF_DELAYS_MS,
  type CrashBackoffBreadcrumb,
  SUCCESS_UPTIME_RESET_MS,
  computeBackoffDelayMs,
  runWithCrashBackoff,
} from "./crash-backoff.js";

function makeSentry() {
  const addBreadcrumb = vi.fn<(b: CrashBackoffBreadcrumb) => void>();
  return { addBreadcrumb };
}

describe("computeBackoffDelayMs", () => {
  it("returns 0 for the zeroth crash (no backoff before the first run)", () => {
    expect(computeBackoffDelayMs(0)).toBe(0);
    expect(computeBackoffDelayMs(-1)).toBe(0);
  });

  it("follows the 5s → 15s → 45s → 2min schedule", () => {
    expect(computeBackoffDelayMs(1)).toBe(5_000);
    expect(computeBackoffDelayMs(2)).toBe(15_000);
    expect(computeBackoffDelayMs(3)).toBe(45_000);
    expect(computeBackoffDelayMs(4)).toBe(120_000);
  });

  it("caps at 2min for any additional consecutive crashes", () => {
    expect(computeBackoffDelayMs(5)).toBe(120_000);
    expect(computeBackoffDelayMs(10)).toBe(120_000);
    expect(computeBackoffDelayMs(1_000)).toBe(120_000);
  });

  it("schedule matches the documented constant array", () => {
    // Locks the constants down so any future tweak forces an explicit
    // test update + breadcrumb-schema review.
    expect(BACKOFF_DELAYS_MS).toEqual([5_000, 15_000, 45_000, 120_000]);
  });
});

describe("runWithCrashBackoff", () => {
  it("returns immediately when fn resolves on the first run", async () => {
    const fn = vi.fn().mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const sentry = makeSentry();

    const result = await runWithCrashBackoff(fn, {
      label: "console",
      sleep,
      now: () => 0,
      warn: () => {},
      sentry,
    });

    expect(result).toEqual({ runs: 1, crashes: 0 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("applies the exponential schedule across consecutive crashes", async () => {
    // First three runs reject instantly (uptime well under 5min), the
    // fourth succeeds. Expect backoff waits of 5s, 15s, 45s.
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom-1"))
      .mockRejectedValueOnce(new Error("boom-2"))
      .mockRejectedValueOnce(new Error("boom-3"))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    // `now` advances by 1ms per call so uptimeMs stays well below
    // SUCCESS_UPTIME_RESET_MS — no counter reset.
    let tick = 0;
    const now = () => {
      tick += 1;
      return tick;
    };

    const result = await runWithCrashBackoff(fn, {
      label: "console",
      sleep,
      now,
      warn: () => {},
      sentry: makeSentry(),
    });

    expect(result).toEqual({ runs: 4, crashes: 3 });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000, 15_000, 45_000]);
  });

  it("resets the consecutive counter after uptime ≥ 5min", async () => {
    // Two crashes spaced by a long uptime, then success. The second
    // crash should still wait the BASE delay (5s), not 15s.
    const longUptimeStart = 0;
    const longUptimeEnd = SUCCESS_UPTIME_RESET_MS + 1_000;
    const timestamps = [
      longUptimeStart, // run 1 start
      longUptimeStart + 100, // run 1 crash (uptime = 100ms, short)
      longUptimeStart + 200, // run 2 start
      longUptimeEnd, // run 2 crash (uptime > 5min → reset)
      longUptimeEnd + 100, // run 3 start (success path uses no `now`)
    ];
    let idx = 0;
    const now = () => timestamps[Math.min(idx++, timestamps.length - 1)]!;

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await runWithCrashBackoff(fn, {
      label: "console",
      sleep,
      now,
      warn: () => {},
      sentry: makeSentry(),
    });

    // Crash 1 → 5s wait. Crash 2 → counter reset because uptime was
    // long, so still 5s wait, NOT 15s.
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000, 5_000]);
  });

  it("emits a Sentry breadcrumb per crash with count + last_error data", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("auth: invalid token"))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const sentry = makeSentry();
    const now = () => 0;

    await runWithCrashBackoff(fn, {
      label: "console",
      sleep,
      now,
      warn: () => {},
      sentry,
    });

    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    const call = sentry.addBreadcrumb.mock.calls[0]![0];
    expect(call.category).toBe("console.crash-backoff");
    expect(call.level).toBe("warning");
    expect(call.data).toMatchObject({
      label: "console",
      consecutiveCrashes: 1,
      restartsInWindow: 1,
      backoffDelayMs: 5_000,
      lastError: "Error: auth: invalid token",
    });
  });

  it("escalates the breadcrumb to level=error once ≥ 5 restarts hit the 10min window", async () => {
    // Fire 5 quick crashes, then a success. The 5th breadcrumb must be
    // level='error'; earlier ones stay at 'warning'.
    const fn = vi.fn();
    for (let i = 0; i < 5; i += 1) {
      fn.mockRejectedValueOnce(new Error(`boom-${i}`));
    }
    fn.mockResolvedValueOnce(undefined);

    const sleep = vi.fn().mockResolvedValue(undefined);
    const sentry = makeSentry();

    // Each run takes 100ms and is followed by a backoff sleep — well
    // under the 10min alert window.
    let tick = 0;
    const now = () => {
      tick += 100;
      return tick;
    };

    await runWithCrashBackoff(fn, {
      label: "console",
      sleep,
      now,
      warn: () => {},
      sentry,
    });

    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(5);
    const levels = sentry.addBreadcrumb.mock.calls.map(
      ([b]) => b.level as string,
    );
    expect(levels).toEqual([
      "warning",
      "warning",
      "warning",
      "warning",
      "error",
    ]);
    // Sanity-check the data payload on the alerting breadcrumb.
    const alerting = sentry.addBreadcrumb.mock.calls[4]![0];
    expect(alerting.data).toMatchObject({
      restartsInWindow: ALERT_RESTART_THRESHOLD,
      alertThreshold: ALERT_RESTART_THRESHOLD,
    });
  });

  it("drops crashes older than the alert window from the sliding count", async () => {
    // 4 crashes inside the window, then a long gap (> 10min) so the
    // first crash falls out of the window, then a 5th crash. The 5th
    // crash should report restartsInWindow=4, NOT 5 → still warning.
    const fn = vi.fn();
    for (let i = 0; i < 5; i += 1) {
      fn.mockRejectedValueOnce(new Error(`boom-${i}`));
    }
    fn.mockResolvedValueOnce(undefined);

    const sleep = vi.fn().mockResolvedValue(undefined);
    const sentry = makeSentry();

    // Timeline: crashes at 0, 1, 2, 3 (ms), then the 5th at
    // ALERT_WINDOW_MS + 1 so the entry at t=0 falls outside the window
    // (windowStart = 1) but 1, 2, 3 are still inside.
    const crashTimes = [
      0, // r1 start
      0, // r1 crash
      1, // r2 start
      1, // r2 crash
      2, // r3 start
      2, // r3 crash
      3, // r4 start
      3, // r4 crash
      ALERT_WINDOW_MS + 1, // r5 start
      ALERT_WINDOW_MS + 1, // r5 crash (t=0 falls out, 1/2/3 stay)
      ALERT_WINDOW_MS + 2, // r6 start (success)
    ];
    let idx = 0;
    const now = () => crashTimes[Math.min(idx++, crashTimes.length - 1)]!;

    await runWithCrashBackoff(fn, {
      label: "console",
      sleep,
      now,
      warn: () => {},
      sentry,
    });

    const fifth = sentry.addBreadcrumb.mock.calls[4]![0];
    expect(fifth.data).toMatchObject({ restartsInWindow: 4 });
    expect(fifth.level).toBe("warning");
  });

  it("respects maxRuns and rethrows the last error when exhausted", async () => {
    const fatal = new Error("permanent failure");
    const fn = vi.fn().mockRejectedValue(fatal);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWithCrashBackoff(fn, {
        label: "console",
        sleep,
        now: () => 0,
        warn: () => {},
        sentry: makeSentry(),
        maxRuns: 2,
      }),
    ).rejects.toBe(fatal);

    expect(fn).toHaveBeenCalledTimes(2);
    // Last attempt does NOT sleep before exit.
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
