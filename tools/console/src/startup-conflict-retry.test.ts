import { describe, expect, it, vi } from "vitest";
import { GrammyError } from "grammy";

import {
  STARTUP_409_BASE_DELAY_MS,
  STARTUP_409_MAX_ATTEMPTS,
  STARTUP_409_MAX_DELAY_MS,
  computeStartupConflictBackoffDelayMs,
  startBotWithConflictRetry,
  totalStartupConflictBackoffMs,
} from "./startup-conflict-retry.js";

// Pain P9 in `docs/launch/tech/telegram-improvements-roadmap.md`: bot
// crash → 6+ minutes of in-process backoff before Railway sees the
// failure. The fix flips the strategy — keep the in-process window
// strictly under 30s and let the supervisor handle the rest.
const SUPERVISOR_SLA_MS = 30_000;

function makeGrammyConflict(): GrammyError {
  // grammy's `GrammyError` requires the raw response payload + a method
  // name; we only care about `error_code === 409` for the retry branch.
  return new GrammyError(
    "Conflict: terminated by other getUpdates request",
    { ok: false, error_code: 409, description: "Conflict" },
    "getUpdates",
    {},
  );
}

describe("startup-conflict-retry constants", () => {
  it("backoff schedule is monotonically non-decreasing and capped", () => {
    let prev = -1;
    for (let attempt = 1; attempt < STARTUP_409_MAX_ATTEMPTS; attempt += 1) {
      const delay = computeStartupConflictBackoffDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(prev);
      expect(delay).toBeLessThanOrEqual(STARTUP_409_MAX_DELAY_MS);
      expect(delay).toBeGreaterThanOrEqual(STARTUP_409_BASE_DELAY_MS);
      prev = delay;
    }
  });

  it("first attempt uses exactly the base delay", () => {
    expect(computeStartupConflictBackoffDelayMs(1)).toBe(
      STARTUP_409_BASE_DELAY_MS,
    );
  });

  // Pain P9 invariant: total in-process wait MUST stay under 30s so
  // crashes surface to the Railway supervisor instead of being absorbed
  // silently. Locking this down makes any future bump to attempts /
  // base-delay / max-delay break loudly in CI.
  it("total in-process backoff stays below the 30s supervisor SLA", () => {
    expect(totalStartupConflictBackoffMs()).toBeLessThan(SUPERVISOR_SLA_MS);
  });
});

describe("startBotWithConflictRetry", () => {
  it("returns immediately when the first start succeeds", async () => {
    const start = vi.fn().mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await startBotWithConflictRetry(
      { start } as Parameters<typeof startBotWithConflictRetry>[0],
      "test",
      { sleep, warn: () => {} },
    );

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({ drop_pending_updates: false });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries 409 with exponential backoff up to the cap, then succeeds", async () => {
    const start = vi
      .fn()
      .mockRejectedValueOnce(makeGrammyConflict())
      .mockRejectedValueOnce(makeGrammyConflict())
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await startBotWithConflictRetry(
      { start } as Parameters<typeof startBotWithConflictRetry>[0],
      "test",
      { sleep, warn: () => {} },
    );

    expect(start).toHaveBeenCalledTimes(3);
    // Sleep schedule for first two retries: base, base*2.
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([
      computeStartupConflictBackoffDelayMs(1),
      computeStartupConflictBackoffDelayMs(2),
    ]);
  });

  it("throws after MAX_ATTEMPTS persistent 409s without exceeding the SLA", async () => {
    const start = vi.fn().mockRejectedValue(makeGrammyConflict());
    let totalSleep = 0;
    const sleep = vi.fn(async (ms: number) => {
      totalSleep += ms;
    });

    await expect(
      startBotWithConflictRetry(
        { start } as Parameters<typeof startBotWithConflictRetry>[0],
        "test",
        { sleep, warn: () => {} },
      ),
    ).rejects.toBeInstanceOf(GrammyError);

    expect(start).toHaveBeenCalledTimes(STARTUP_409_MAX_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(STARTUP_409_MAX_ATTEMPTS - 1);
    expect(totalSleep).toBeLessThan(SUPERVISOR_SLA_MS);
  });

  it("does not retry on non-409 errors", async () => {
    const fatal = new Error("auth: invalid token");
    const start = vi.fn().mockRejectedValueOnce(fatal);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      startBotWithConflictRetry(
        { start } as Parameters<typeof startBotWithConflictRetry>[0],
        "test",
        { sleep, warn: () => {} },
      ),
    ).rejects.toBe(fatal);

    expect(start).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry on a non-409 GrammyError", async () => {
    const rateLimited = new GrammyError(
      "Too Many Requests",
      { ok: false, error_code: 429, description: "Too Many Requests" },
      "getUpdates",
      {},
    );
    const start = vi.fn().mockRejectedValueOnce(rateLimited);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      startBotWithConflictRetry(
        { start } as Parameters<typeof startBotWithConflictRetry>[0],
        "test",
        { sleep, warn: () => {} },
      ),
    ).rejects.toBe(rateLimited);

    expect(start).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("emits a warning per retry with the attempt counter and label", async () => {
    const start = vi
      .fn()
      .mockRejectedValueOnce(makeGrammyConflict())
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    await startBotWithConflictRetry(
      { start } as Parameters<typeof startBotWithConflictRetry>[0],
      "openclaw",
      { sleep, warn },
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("[openclaw]");
    expect(message).toContain(`1/${STARTUP_409_MAX_ATTEMPTS}`);
  });
});
