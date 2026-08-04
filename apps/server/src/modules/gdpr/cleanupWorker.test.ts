import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `processGdprCleanupQueueBatch` — ADR-0016 § ADR-6.3 minimal worker.
 *
 * Covers the dispatch/outcome matrix:
 *   - posthog `skipped` → marks `completed_at` (its own pre-existing
 *     contract — not configured at all in this deployment, nothing to
 *     wait for).
 *   - stripe/sentry/resend `skipped` → row stays PENDING (no admin token
 *     configured yet — "рядки просто чекають у черзі").
 *   - `ok` / `not_found` → completed.
 *   - `error` / `timeout` / `rate_limited` → attempts++ with backoff.
 */

const { deletePostHogPersonMock } = vi.hoisted(() => ({
  deletePostHogPersonMock: vi.fn(),
}));

vi.mock("../../lib/posthog.js", () => ({
  deletePostHogPerson: deletePostHogPersonMock,
}));

import { processGdprCleanupQueueBatch } from "./cleanupWorker.js";

function makePoolMock(rows: unknown[]) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows })
      .mockResolvedValue({ rows: [] }),
  };
}

beforeEach(() => {
  deletePostHogPersonMock.mockReset();
  delete process.env["STRIPE_SECRET_KEY"];
  delete process.env["SENTRY_AUTH_TOKEN"];
  delete process.env["SENTRY_ORG_SLUG"];
  delete process.env["SENTRY_PROJECT_SLUG"];
  delete process.env["RESEND_API_KEY"];
  delete process.env["RESEND_AUDIENCE_ID"];
});

describe("processGdprCleanupQueueBatch — posthog", () => {
  it("marks completed when deletePostHogPerson resolves ok", async () => {
    deletePostHogPersonMock.mockResolvedValue({ outcome: "ok", status: 200 });
    const pool = makePoolMock([
      {
        id: 1,
        user_id: "u1",
        email: "u1@example.com",
        stripe_customer_id: null,
        service: "posthog",
        attempts: 0,
      },
    ]);

    const result = await processGdprCleanupQueueBatch(pool as never);

    expect(result).toEqual({
      processed: 1,
      completed: 1,
      waitingOnConfig: 0,
      failed: 0,
    });
    const updateCall = pool.query.mock.calls[1]!;
    expect(updateCall[0]).toMatch(/UPDATE gdpr_cleanup_queue SET completed_at/);
    expect(updateCall[1]).toEqual([1]);
  });

  it("marks completed when posthog is unconfigured (skipped → nothing to wait for)", async () => {
    deletePostHogPersonMock.mockResolvedValue({ outcome: "skipped" });
    const pool = makePoolMock([
      {
        id: 2,
        user_id: "u1",
        email: "u1@example.com",
        stripe_customer_id: null,
        service: "posthog",
        attempts: 0,
      },
    ]);

    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result.completed).toBe(1);
    expect(result.waitingOnConfig).toBe(0);
  });

  it("increments attempts with exponential backoff on error", async () => {
    deletePostHogPersonMock.mockResolvedValue({
      outcome: "error",
      error: "posthog returned 500",
    });
    const pool = makePoolMock([
      {
        id: 3,
        user_id: "u1",
        email: "u1@example.com",
        stripe_customer_id: null,
        service: "posthog",
        attempts: 2,
      },
    ]);

    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result.failed).toBe(1);
    const updateCall = pool.query.mock.calls[1]!;
    expect(updateCall[0]).toMatch(/SET\s+attempts = \$2/);
    // attempts 2 -> 3, backoff 2^3 = 8 minutes.
    expect(updateCall[1]).toEqual([3, 3, "posthog returned 500", "8"]);
  });
});

describe("processGdprCleanupQueueBatch — stripe/sentry/resend (unwired vendors)", () => {
  it("leaves stripe row PENDING when STRIPE_SECRET_KEY is unset (waitingOnConfig, not completed)", async () => {
    const pool = makePoolMock([
      {
        id: 4,
        user_id: "u2",
        email: "u2@example.com",
        stripe_customer_id: "cus_1",
        service: "stripe",
        attempts: 0,
      },
    ]);

    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result).toEqual({
      processed: 1,
      completed: 0,
      waitingOnConfig: 1,
      failed: 0,
    });
    // Only the SELECT ran — no UPDATE at all for a row left pending.
    expect(pool.query).toHaveBeenCalledOnce();
  });

  it("leaves sentry row PENDING when SENTRY_AUTH_TOKEN/org/project are unset", async () => {
    const pool = makePoolMock([
      {
        id: 5,
        user_id: "u2",
        email: "u2@example.com",
        stripe_customer_id: null,
        service: "sentry",
        attempts: 0,
      },
    ]);
    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result.waitingOnConfig).toBe(1);
    expect(result.completed).toBe(0);
  });

  it("leaves resend row PENDING when RESEND_API_KEY/audience are unset", async () => {
    const pool = makePoolMock([
      {
        id: 6,
        user_id: "u2",
        email: "u2@example.com",
        stripe_customer_id: null,
        service: "resend",
        attempts: 0,
      },
    ]);
    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result.waitingOnConfig).toBe(1);
    expect(result.completed).toBe(0);
  });
});

describe("processGdprCleanupQueueBatch — no candidates", () => {
  it("returns all-zero result when the queue is empty", async () => {
    const pool = makePoolMock([]);
    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result).toEqual({
      processed: 0,
      completed: 0,
      waitingOnConfig: 0,
      failed: 0,
    });
  });
});
