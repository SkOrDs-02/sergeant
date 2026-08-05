import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `processGdprCleanupQueueBatch` — ADR-0016 § ADR-6.3 minimal worker.
 *
 * Covers the dispatch/outcome matrix, plus the four CodeRabbit #627 fixes:
 *   - posthog `skipped` → marks `completed_at` (its own pre-existing
 *     contract — not configured at all in this deployment, nothing to
 *     wait for).
 *   - stripe/sentry/resend `skipped` → rescheduled `+1h`, `attempts`
 *     untouched (fix #1 — starvation).
 *   - `ok` / `not_found` → completed AND redacted (fix #4 — PII retention).
 *   - `error` / `timeout` / `rate_limited` → attempts++ with capped backoff
 *     (fix #2 — `MAX_ATTEMPTS` ceiling + exhaustion marker).
 *   - the initial claim uses `FOR UPDATE SKIP LOCKED` (fix #3 — concurrent
 *     batches).
 *   - completed rows past the retention window get hard-deleted.
 */

const { deletePostHogPersonMock } = vi.hoisted(() => ({
  deletePostHogPersonMock: vi.fn(),
}));

vi.mock("../../lib/posthog.js", () => ({
  deletePostHogPerson: deletePostHogPersonMock,
}));

import { processGdprCleanupQueueBatch } from "./cleanupWorker.js";

interface QueryCall {
  sql: string;
  params: unknown[];
}

/**
 * `query` mock: first call is always the claim (`FOR UPDATE SKIP LOCKED`)
 * statement and resolves with `claimedRows`; every call after that
 * (per-row reschedule/complete/backoff UPDATEs, the trailing purge DELETE)
 * defaults to an empty/no-op result unless a test overrides via
 * `mockResolvedValueOnce` before invoking the function under test.
 */
function makePoolMock(claimedRows: unknown[]) {
  const query = vi.fn();
  query.mockResolvedValueOnce({ rows: claimedRows });
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  const calls = (): QueryCall[] =>
    query.mock.calls.map(([sql, params]) => ({
      sql: sql as string,
      params: (params ?? []) as unknown[],
    }));
  return { query, calls };
}

beforeEach(() => {
  deletePostHogPersonMock.mockReset();
  delete process.env["STRIPE_SECRET_KEY"];
  delete process.env["SENTRY_AUTH_TOKEN"];
  delete process.env["SENTRY_ORG_SLUG"];
  delete process.env["SENTRY_PROJECT_SLUG"];
  delete process.env["RESEND_API_KEY"];
});

describe("processGdprCleanupQueueBatch — claim query (fix #3, concurrent batches)", () => {
  it("claims via FOR UPDATE SKIP LOCKED folded into a single UPDATE ... RETURNING", async () => {
    const pool = makePoolMock([]);
    await processGdprCleanupQueueBatch(pool as never, { limit: 7 });
    const claimCall = pool.calls()[0]!;
    expect(claimCall.sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(claimCall.sql).toMatch(/UPDATE gdpr_cleanup_queue/);
    expect(claimCall.sql).toMatch(/RETURNING/);
    expect(claimCall.params[0]).toBe(7);
  });
});

describe("processGdprCleanupQueueBatch — posthog", () => {
  it("marks completed AND redacts PII when deletePostHogPerson resolves ok", async () => {
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
      exhausted: 0,
      purged: 0,
      deadlineExceeded: false,
    });
    const updateCall = pool.calls()[1]!;
    expect(updateCall.sql).toMatch(/UPDATE gdpr_cleanup_queue/);
    expect(updateCall.sql).toMatch(/completed_at = NOW\(\)/);
    // Fix #4 — PII redacted the moment the row completes.
    expect(updateCall.sql).toMatch(/email = NULL/);
    expect(updateCall.sql).toMatch(/stripe_customer_id = NULL/);
    expect(updateCall.sql).toMatch(/last_error = NULL/);
    expect(updateCall.params).toEqual([1]);
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

  it("increments attempts with capped exponential backoff on error", async () => {
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
    expect(result.exhausted).toBe(0);
    const updateCall = pool.calls()[1]!;
    expect(updateCall.sql).toMatch(/SET\s+attempts = \$2/);
    // attempts 2 -> 3, backoff 2^3 = 8 minutes.
    expect(updateCall.params).toEqual([3, 3, "posthog returned 500", "8"]);
  });
});

describe("processGdprCleanupQueueBatch — fix #2 (MAX_ATTEMPTS ceiling)", () => {
  it("marks the row exhausted at MAX_ATTEMPTS instead of retrying into a larger interval", async () => {
    deletePostHogPersonMock.mockResolvedValue({
      outcome: "error",
      error: "posthog returned 500",
    });
    const pool = makePoolMock([
      {
        id: 9,
        user_id: "u1",
        email: "u1@example.com",
        stripe_customer_id: null,
        service: "posthog",
        attempts: 9, // next attempt = 10 = MAX_ATTEMPTS
      },
    ]);

    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result.failed).toBe(1);
    expect(result.exhausted).toBe(1);
    const updateCall = pool.calls()[1]!;
    expect(updateCall.sql).toMatch(/next_attempt_at = 'infinity'::timestamptz/);
    expect(updateCall.params[0]).toBe(9);
    expect(updateCall.params[1]).toBe(10);
    expect(updateCall.params[2]).toBe(
      "max_attempts_exhausted: posthog returned 500",
    );
    // No 4th (`interval`) param on the exhausted branch.
    expect(updateCall.params).toHaveLength(3);
  });

  it("never lets a poison retry-UPDATE crash the whole batch (try/catch)", async () => {
    deletePostHogPersonMock.mockResolvedValue({
      outcome: "error",
      error: "boom",
    });
    const query = vi.fn();
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 42,
          user_id: "u1",
          email: "u1@example.com",
          stripe_customer_id: null,
          service: "posthog",
          attempts: 1,
        },
      ],
    }); // claim
    query.mockRejectedValueOnce(new Error("interval out of range")); // retry UPDATE throws
    query.mockResolvedValue({ rows: [], rowCount: 0 }); // purge

    const result = await processGdprCleanupQueueBatch({ query } as never);
    // The row still counts as `failed` even though its own persistence
    // UPDATE blew up — and the batch as a whole resolves rather than
    // rejecting.
    expect(result.failed).toBe(1);
    expect(result.processed).toBe(1);
  });
});

describe("processGdprCleanupQueueBatch — stripe/sentry/resend (unwired vendors, fix #1)", () => {
  it("reschedules a stripe row +1h when STRIPE_SECRET_KEY is unset, without touching attempts", async () => {
    const pool = makePoolMock([
      {
        id: 4,
        user_id: "u2",
        email: "u2@example.com",
        stripe_customer_id: "cus_1",
        service: "stripe",
        attempts: 3,
      },
    ]);

    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result).toEqual({
      processed: 1,
      completed: 0,
      waitingOnConfig: 1,
      failed: 0,
      exhausted: 0,
      purged: 0,
      deadlineExceeded: false,
    });
    const rescheduleCall = pool.calls()[1]!;
    expect(rescheduleCall.sql).toMatch(/next_attempt_at = NOW\(\) \+ /);
    expect(rescheduleCall.sql).toMatch(/' hours'/);
    expect(rescheduleCall.sql).not.toMatch(/attempts/);
    expect(rescheduleCall.params).toEqual([4, "1"]);
  });

  it("reschedules a sentry row +1h when SENTRY_AUTH_TOKEN/org/project are unset", async () => {
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

  it("reschedules a resend row +1h when RESEND_API_KEY is unset", async () => {
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

describe("processGdprCleanupQueueBatch — fix #4 (PII purge)", () => {
  it("hard-deletes completed rows past the retention window and reports the count", async () => {
    const query = vi.fn();
    query.mockResolvedValueOnce({ rows: [] }); // claim — nothing due
    query.mockResolvedValueOnce({ rows: [], rowCount: 3 }); // purge DELETE

    const result = await processGdprCleanupQueueBatch({ query } as never);
    expect(result.purged).toBe(3);
    const purgeCall = query.mock.calls[1]!;
    expect(purgeCall[0]).toMatch(/DELETE FROM gdpr_cleanup_queue/);
    expect(purgeCall[0]).toMatch(/completed_at < NOW\(\) - /);
    expect(purgeCall[1]).toEqual(["30"]);
  });

  it("swallows a purge failure rather than throwing out of the batch", async () => {
    const query = vi.fn();
    query.mockResolvedValueOnce({ rows: [] }); // claim
    query.mockRejectedValueOnce(new Error("db down")); // purge throws

    const result = await processGdprCleanupQueueBatch({ query } as never);
    expect(result.purged).toBe(0);
  });
});

describe("processGdprCleanupQueueBatch — no candidates", () => {
  it("returns an all-zero result when the queue is empty", async () => {
    const pool = makePoolMock([]);
    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result).toEqual({
      processed: 0,
      completed: 0,
      waitingOnConfig: 0,
      failed: 0,
      exhausted: 0,
      purged: 0,
      deadlineExceeded: false,
    });
  });
});

describe("processGdprCleanupQueueBatch — deadline (routes/internal/gdpr.ts fix)", () => {
  it("stops dispatching once deadlineMs elapses and reports a partial result", async () => {
    deletePostHogPersonMock.mockResolvedValue({ outcome: "ok", status: 200 });
    const pool = makePoolMock([
      {
        id: 10,
        user_id: "u1",
        email: "u1@example.com",
        stripe_customer_id: null,
        service: "posthog",
        attempts: 0,
      },
      {
        id: 11,
        user_id: "u2",
        email: "u2@example.com",
        stripe_customer_id: null,
        service: "posthog",
        attempts: 0,
      },
    ]);

    // Deadline already elapsed before the loop even starts (`-1`) — no row
    // should be dispatched, and the two claimed rows are simply left for
    // the next invocation (their claim-lease already protects them from a
    // concurrent double-claim in the meantime).
    const result = await processGdprCleanupQueueBatch(pool as never, {
      deadlineMs: -1,
    });

    expect(result.processed).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.deadlineExceeded).toBe(true);
    expect(deletePostHogPersonMock).not.toHaveBeenCalled();
  });

  it("processes normally within the default 60s budget", async () => {
    deletePostHogPersonMock.mockResolvedValue({ outcome: "ok", status: 200 });
    const pool = makePoolMock([
      {
        id: 12,
        user_id: "u1",
        email: "u1@example.com",
        stripe_customer_id: null,
        service: "posthog",
        attempts: 0,
      },
    ]);

    const result = await processGdprCleanupQueueBatch(pool as never);
    expect(result.processed).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.deadlineExceeded).toBe(false);
  });
});
