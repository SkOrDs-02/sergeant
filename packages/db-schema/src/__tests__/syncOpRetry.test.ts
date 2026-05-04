import { describe, expect, it } from "vitest";
import {
  SYNC_OP_BASE_BACKOFF_MS,
  SYNC_OP_MAX_ATTEMPTS,
  SYNC_OP_MAX_BACKOFF_MS,
  computeBackoffMs,
  computeNextRetryAt,
  nextStatusForRetry,
  planRetry,
} from "../sqlite/syncOpRetry.js";

/**
 * Pure-function unit tests for the Stage 5 / PR #040 op-log retry
 * policy. The policy lives in `packages/db-schema/src/sqlite/syncOpRetry.ts`
 * and is consumed by every client repo that pushes op-log entries to
 * `/api/v2/sync/push`. Locking down the math here means the SQL
 * helpers in each app stay trivial and the persisted columns stay
 * byte-aligned across web (sqlite-wasm) and mobile (expo-sqlite).
 */

describe("computeBackoffMs", () => {
  it("returns 0 for the 0-th and negative attempts", () => {
    expect(computeBackoffMs(0)).toBe(0);
    expect(computeBackoffMs(-1)).toBe(0);
    expect(computeBackoffMs(-100)).toBe(0);
  });

  it("returns 0 for non-finite attempts (defensive)", () => {
    expect(computeBackoffMs(Number.NaN)).toBe(0);
    expect(computeBackoffMs(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("doubles starting at the base backoff for attempts 1..N", () => {
    expect(computeBackoffMs(1)).toBe(SYNC_OP_BASE_BACKOFF_MS);
    expect(computeBackoffMs(2)).toBe(SYNC_OP_BASE_BACKOFF_MS * 2);
    expect(computeBackoffMs(3)).toBe(SYNC_OP_BASE_BACKOFF_MS * 4);
    expect(computeBackoffMs(4)).toBe(SYNC_OP_BASE_BACKOFF_MS * 8);
    expect(computeBackoffMs(5)).toBe(SYNC_OP_BASE_BACKOFF_MS * 16);
  });

  it("clamps at SYNC_OP_MAX_BACKOFF_MS", () => {
    // 5 minutes is hit somewhere between attempt 8 and attempt 9 with
    // a 1s base; explicit at attempt 10 (and beyond).
    expect(computeBackoffMs(10)).toBe(SYNC_OP_MAX_BACKOFF_MS);
    expect(computeBackoffMs(20)).toBe(SYNC_OP_MAX_BACKOFF_MS);
    expect(computeBackoffMs(1_000)).toBe(SYNC_OP_MAX_BACKOFF_MS);
  });

  it("adds caller-supplied jitter on top of the capped delay", () => {
    expect(computeBackoffMs(1, 250)).toBe(SYNC_OP_BASE_BACKOFF_MS + 250);
    expect(computeBackoffMs(20, 100)).toBe(SYNC_OP_MAX_BACKOFF_MS + 100);
  });

  it("ignores negative jitter (treats as 0)", () => {
    expect(computeBackoffMs(1, -500)).toBe(SYNC_OP_BASE_BACKOFF_MS);
  });

  it("floors fractional attempts before exponentiating", () => {
    expect(computeBackoffMs(1.9)).toBe(SYNC_OP_BASE_BACKOFF_MS);
    expect(computeBackoffMs(2.4)).toBe(SYNC_OP_BASE_BACKOFF_MS * 2);
  });
});

describe("computeNextRetryAt", () => {
  it("returns an ISO-8601-with-Z timestamp `now + computeBackoffMs(attempts)`", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    expect(computeNextRetryAt(1, now)).toBe("2026-05-04T12:00:01.000Z");
    expect(computeNextRetryAt(3, now)).toBe("2026-05-04T12:00:04.000Z");
    expect(computeNextRetryAt(5, now)).toBe("2026-05-04T12:00:16.000Z");
  });

  it("respects the SYNC_OP_MAX_BACKOFF_MS cap", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    // attempt 20 should clamp to +5min.
    expect(computeNextRetryAt(20, now)).toBe("2026-05-04T12:05:00.000Z");
  });

  it("returns the same instant when attempts is 0 (no delay)", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    expect(computeNextRetryAt(0, now)).toBe("2026-05-04T12:00:00.000Z");
  });

  it("adds caller-supplied jitter to the timestamp", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    expect(computeNextRetryAt(1, now, 250)).toBe("2026-05-04T12:00:01.250Z");
  });
});

describe("nextStatusForRetry", () => {
  it("stays 'pending' for attempts below the max", () => {
    for (let i = 1; i < SYNC_OP_MAX_ATTEMPTS; i++) {
      expect(nextStatusForRetry(i)).toBe("pending");
    }
  });

  it("flips to 'dead_letter' at and beyond SYNC_OP_MAX_ATTEMPTS", () => {
    expect(nextStatusForRetry(SYNC_OP_MAX_ATTEMPTS)).toBe("dead_letter");
    expect(nextStatusForRetry(SYNC_OP_MAX_ATTEMPTS + 1)).toBe("dead_letter");
    expect(nextStatusForRetry(SYNC_OP_MAX_ATTEMPTS + 50)).toBe("dead_letter");
  });
});

describe("planRetry", () => {
  const now = new Date("2026-05-04T12:00:00.000Z");

  it("increments attempts by 1 on each call", () => {
    expect(planRetry(0, now, "network").attempts).toBe(1);
    expect(planRetry(1, now, "network").attempts).toBe(2);
    expect(planRetry(7, now, "network").attempts).toBe(8);
  });

  it("clamps a previously-negative or fractional attempts column to 0 before incrementing", () => {
    expect(planRetry(-3, now, "x").attempts).toBe(1);
    expect(planRetry(2.9, now, "x").attempts).toBe(3);
  });

  it("schedules next_retry_at via the exponential schedule for surviving rows", () => {
    expect(planRetry(0, now, "network").nextRetryAt).toBe(
      "2026-05-04T12:00:01.000Z",
    );
    expect(planRetry(2, now, "network").nextRetryAt).toBe(
      "2026-05-04T12:00:04.000Z",
    );
  });

  it("flips status to 'dead_letter' after SYNC_OP_MAX_ATTEMPTS-th failure and clears next_retry_at", () => {
    const plan = planRetry(SYNC_OP_MAX_ATTEMPTS - 1, now, "http_503");
    expect(plan.status).toBe("dead_letter");
    expect(plan.nextRetryAt).toBeNull();
    expect(plan.attempts).toBe(SYNC_OP_MAX_ATTEMPTS);
  });

  it("propagates the supplied last_error into the plan", () => {
    expect(planRetry(0, now, "network").lastError).toBe("network");
    expect(planRetry(0, now, "http_503").lastError).toBe("http_503");
  });

  it("includes jitter in next_retry_at when supplied", () => {
    const plan = planRetry(0, now, "network", 250);
    expect(plan.nextRetryAt).toBe("2026-05-04T12:00:01.250Z");
  });
});
