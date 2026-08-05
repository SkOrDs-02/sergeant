import type { Pool } from "pg";
import { logger } from "../../obs/logger.js";
import { deletePostHogPerson } from "../../lib/posthog.js";
import {
  deleteResendContact,
  deleteSentryUser,
  deleteStripeCustomer,
  type VendorDeleteResult,
} from "./externalDelete.js";
import type { GdprCleanupService } from "./cleanupQueue.js";

/**
 * Minimal batch worker for `gdpr_cleanup_queue` (ADR-0016 § ADR-6.3).
 * Callable from `POST /api/internal/gdpr/cleanup-queue/process` (Railway/n8n
 * cron, same pattern as `rotateStaleMonoWebhookSecrets` / `/api/internal/
 * mono/webhook/rotate`) — no scheduler is wired in-process.
 *
 * CodeRabbit review on PR #627 flagged four correctness/PII gaps in the
 * original version of this worker, all fixed here:
 *
 *   1. **Starvation.** A row `skipped` because a vendor token isn't
 *      configured used to keep whatever `next_attempt_at` the claim step put
 *      it at — it stayed at (or near) the head of the `ORDER BY
 *      next_attempt_at ASC` queue, and once enough such rows piled up past
 *      `limit`, no other row (including ones that genuinely need a retry)
 *      was ever reached. Fix: reschedule those rows `+1 hour`
 *      (`UNCONFIGURED_RETRY_HOURS`) WITHOUT touching `attempts` — see the
 *      dedicated `UPDATE` in the dispatch loop below.
 *   2. **Unbounded backoff.** `2^attempts` minutes with no ceiling — by
 *      roughly attempts≈30 the resulting interval starts approaching what
 *      `timestamptz` can represent added to `NOW()`, the `UPDATE` throws,
 *      and (absent a `try/catch`) that exception used to propagate out of
 *      the `for` loop and abort the ENTIRE batch — every row behind the
 *      poison one silently starved too. Fix: `MAX_ATTEMPTS` ceiling (10 —
 *      останній записаний backoff — 2^9 = 512min ≈ 8.5h, бо рядок, що
 *      досяг стелі, більше не ретраїться); a row that reaches the
 *      ceiling is marked exhausted (`next_attempt_at = 'infinity'`,
 *      `last_error` prefixed `max_attempts_exhausted:`) instead of retried
 *      forever, and the retry-`UPDATE` itself is wrapped in `try/catch` so
 *      one bad row can never take the batch down again.
 *   3. **Concurrent-batch double-processing.** Two overlapping invocations
 *      (e.g. a slow cron tick overlapping the next) used to `SELECT` the
 *      SAME candidate rows and call the same vendor API twice for them.
 *      Fix: `claimBatch()` folds `FOR UPDATE SKIP LOCKED` into the same
 *      statement as a short-lived lease bump (`next_attempt_at = NOW() +
 *      CLAIM_LEASE_MINUTES`) — one atomic round-trip, no long-held
 *      transaction spanning the vendor HTTP calls, and a crashed batch
 *      self-heals once the lease expires.
 *   4. **PII retention.** A `completed_at` row used to keep `email` /
 *      `stripe_customer_id` / `last_error` forever — exactly the PII this
 *      queue exists to purge, just from OUR OWN database rather than the
 *      vendor's. Fix: redact those three columns to `NULL` the moment a row
 *      completes (`completed_at` itself stays — audit trail "this cleanup
 *      happened" without the PII), and additionally hard-delete completed
 *      rows older than `COMPLETED_RETENTION_DAYS` (30, ADR-0016 addendum)
 *      on every batch invocation via `purgeExpiredCompletedRows()`.
 *
 * Per-row dispatch and what "done" means differs by service on purpose:
 *
 *   - `posthog`: `deletePostHogPerson()` predates this queue and documents
 *     its own contract — `"skipped"` (PostHog not configured at all in this
 *     deployment) is treated as nothing-to-wait-for, so the row is marked
 *     `completed_at` immediately.
 *   - `stripe` / `sentry` / `resend`: no admin-token wiring exists yet for
 *     these three. `"skipped"` here means "operator hasn't configured the
 *     token" — the row is rescheduled `+1 hour` (neither `completed_at` nor
 *     `attempts` touched) so it is picked up again once the token is set,
 *     rather than being silently marked "cleaned" when nothing happened, or
 *     starving the rest of the queue in the meantime (fix #1 above).
 *
 * `ok` / `not_found` (idempotent — already gone upstream) both count as
 * done. `rate_limited` / `timeout` / `error` increment `attempts` and
 * push `next_attempt_at` out with exponential backoff (`2^attempts`
 * minutes, ADR-6.3's own formula, now capped — fix #2 above).
 */

export interface GdprCleanupQueueRow {
  id: string | number;
  user_id: string;
  email: string;
  stripe_customer_id: string | null;
  service: GdprCleanupService;
  attempts: number | string;
}

export interface ProcessGdprCleanupQueueOptions {
  /** Max rows to process per invocation. Default 20. */
  limit?: number | undefined;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch | undefined;
  /**
   * Overall wall-clock budget for the dispatch loop, in ms. Default
   * `DEFAULT_DEADLINE_MS` (60s). At up to `DEFAULT_TIMEOUT_MS` (10s, see
   * `externalDelete.ts`) per vendor HTTP call, a caller-supplied `limit` of
   * a few dozen could otherwise block far past any reasonable HTTP-request
   * timeout (`routes/internal/gdpr.ts` fix — CodeRabbit #627: `limit=200`
   * × 10s/vendor was a theoretical 2000s request). Rows left unprocessed
   * when the deadline hits keep the `next_attempt_at` lease `claimBatch()`
   * already gave them, so they are safely retried on the next invocation —
   * nothing is lost, the batch just returns a partial result early.
   */
  deadlineMs?: number | undefined;
}

export interface ProcessGdprCleanupQueueResult {
  /** Rows actually dispatched this run (may be less than claimed if `deadlineMs` was hit). */
  processed: number;
  completed: number;
  /** Rows left pending because the vendor isn't configured yet (rescheduled +1h). */
  waitingOnConfig: number;
  failed: number;
  /** Of `failed`, how many hit `MAX_ATTEMPTS` this run and are now parked (`next_attempt_at = 'infinity'`). */
  exhausted: number;
  /** Completed rows hard-deleted this run for exceeding the 30-day PII retention window. */
  purged: number;
  /** `true` when the loop stopped early because `deadlineMs` elapsed — some claimed rows were left untouched for the next invocation. */
  deadlineExceeded: boolean;
}

/** Default overall wall-clock budget for one batch invocation (see `deadlineMs`). */
const DEFAULT_DEADLINE_MS = 60_000;

/**
 * Backoff/retry ceiling (CodeRabbit #627, fix #2). Останній backoff, який
 * реально записується — `2^(MAX_ATTEMPTS-1)` = 512min ≈ 8.5h: рядок, чиї
 * attempts досягли стелі, позначається exhausted замість чергового retry.
 * Це sane worst-case cadence для фонової черги без user-facing latency;
 * рядок, що впав стільки разів поспіль, потребує оператора, не ретраю.
 */
const MAX_ATTEMPTS = 10;

/**
 * Short atomic-claim lease (fix #3) — long enough to cover one
 * dispatch+update round-trip comfortably, short enough that a crashed batch
 * (claimed rows never reach their final `UPDATE`) self-heals within
 * minutes rather than being stuck until an operator intervenes.
 */
const CLAIM_LEASE_MINUTES = 5;

/**
 * Re-check horizon for vendor-not-configured rows (fix #1). Long enough
 * that we don't burn a `dispatch()` call on them every single tick, short
 * enough that an operator who just set the missing token sees it picked up
 * within the hour.
 */
const UNCONFIGURED_RETRY_HOURS = 1;

/**
 * PII-retention window for completed rows (fix #4, ADR-0016 addendum —
 * `docs/04-governance/adr/0016-user-deletion-and-pii-handling.md`). After
 * this many days past `completed_at`, the row itself is hard-deleted, not
 * just its already-redacted PII columns — there is no remaining reason to
 * keep a bare `(id, service, completed_at)` audit row around indefinitely.
 */
const COMPLETED_RETENTION_DAYS = 30;

async function dispatch(
  row: GdprCleanupQueueRow,
  fetchImpl: typeof fetch | undefined,
): Promise<VendorDeleteResult> {
  switch (row.service) {
    case "posthog":
      return deletePostHogPerson(row.user_id, { fetchImpl });
    case "stripe":
      return deleteStripeCustomer(row.stripe_customer_id, { fetchImpl });
    case "sentry":
      return deleteSentryUser(row.user_id, { fetchImpl });
    case "resend":
      return deleteResendContact(row.email, { fetchImpl });
    default:
      return {
        outcome: "error",
        error: `unknown service ${String(row.service)}`,
      };
  }
}

/** `posthog`'s own skip contract (see module doc) — mark completed. */
const SKIP_MEANS_COMPLETE: ReadonlySet<GdprCleanupService> = new Set([
  "posthog",
]);

/**
 * Claim up to `limit` due rows with `FOR UPDATE SKIP LOCKED` folded into a
 * single `UPDATE ... FROM (SELECT ...) RETURNING` statement (fix #3) — a
 * concurrent invocation's own claim query simply skips whatever this one
 * has already locked, and the lease bump means it won't reappear as "due"
 * again until `CLAIM_LEASE_MINUTES` from now even after this statement's
 * implicit single-statement transaction commits.
 */
async function claimBatch(
  pool: Pick<Pool, "query">,
  limit: number,
): Promise<GdprCleanupQueueRow[]> {
  const { rows } = await pool.query<GdprCleanupQueueRow>(
    `WITH claimed AS (
       SELECT id
         FROM gdpr_cleanup_queue
        WHERE completed_at IS NULL
          AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE gdpr_cleanup_queue AS q
        SET next_attempt_at = NOW() + ($2 || ' minutes')::interval
       FROM claimed
      WHERE q.id = claimed.id
     RETURNING q.id, q.user_id, q.email, q.stripe_customer_id, q.service, q.attempts`,
    [limit, String(CLAIM_LEASE_MINUTES)],
  );
  return rows;
}

/**
 * Fix #4 (second half) — hard-delete completed rows past the PII retention
 * window. Runs once per batch invocation; failures are swallowed (logged,
 * not thrown) because a purge failure must never block the actual
 * cleanup-dispatch work above it.
 */
async function purgeExpiredCompletedRows(
  pool: Pick<Pool, "query">,
): Promise<number> {
  try {
    const result = await pool.query(
      `DELETE FROM gdpr_cleanup_queue
        WHERE completed_at IS NOT NULL
          AND completed_at < NOW() - ($1 || ' days')::interval`,
      [String(COMPLETED_RETENTION_DAYS)],
    );
    return result.rowCount ?? 0;
  } catch (err) {
    logger.warn({
      msg: "gdpr_cleanup_purge_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

export async function processGdprCleanupQueueBatch(
  pool: Pick<Pool, "query">,
  options: ProcessGdprCleanupQueueOptions = {},
): Promise<ProcessGdprCleanupQueueResult> {
  const limit = options.limit ?? 20;
  const fetchImpl = options.fetchImpl;
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const startedAt = Date.now();

  const rows = await claimBatch(pool, limit);

  let processed = 0;
  let completed = 0;
  let waitingOnConfig = 0;
  let failed = 0;
  let exhausted = 0;
  let deadlineExceeded = false;

  for (const row of rows) {
    if (Date.now() - startedAt >= deadlineMs) {
      // Overall budget spent — stop dispatching. Already-claimed-but-
      // untouched rows keep the short claim-lease `next_attempt_at`, so
      // they are picked up again on the next invocation rather than lost.
      deadlineExceeded = true;
      break;
    }
    processed += 1;

    let result: VendorDeleteResult;
    try {
      result = await dispatch(row, fetchImpl);
    } catch (err) {
      result = {
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (result.outcome === "skipped" && !SKIP_MEANS_COMPLETE.has(row.service)) {
      // Fix #1 — admin token not configured for this vendor yet. Reschedule
      // rather than leaving `next_attempt_at` wherever the claim-lease put
      // it, or this row crowds out every other row on the next tick too.
      try {
        await pool.query(
          `UPDATE gdpr_cleanup_queue
              SET next_attempt_at = NOW() + ($2 || ' hours')::interval
            WHERE id = $1`,
          [row.id, String(UNCONFIGURED_RETRY_HOURS)],
        );
      } catch (err) {
        logger.error({
          msg: "gdpr_cleanup_reschedule_failed",
          queueRowId: row.id,
          service: row.service,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      waitingOnConfig += 1;
      continue;
    }

    if (
      result.outcome === "ok" ||
      result.outcome === "not_found" ||
      result.outcome === "skipped"
    ) {
      try {
        // Fix #4 — redact PII the moment the row is done; `completed_at`
        // itself stays as the audit trail ("this cleanup happened"), the
        // PII it needed to get there does not need to.
        await pool.query(
          `UPDATE gdpr_cleanup_queue
              SET completed_at = NOW(),
                  email = NULL,
                  stripe_customer_id = NULL,
                  last_error = NULL
            WHERE id = $1`,
          [row.id],
        );
        completed += 1;
      } catch (err) {
        logger.error({
          msg: "gdpr_cleanup_complete_update_failed",
          queueRowId: row.id,
          service: row.service,
          err: err instanceof Error ? err.message : String(err),
        });
        failed += 1;
      }
      continue;
    }

    const currentAttempts = Number(row.attempts);
    const nextAttempts = currentAttempts + 1;
    const willExhaust = nextAttempts >= MAX_ATTEMPTS;
    const backoffMinutes = Math.pow(2, Math.min(nextAttempts, MAX_ATTEMPTS));
    const errorMessage = result.error ?? result.outcome;

    try {
      if (willExhaust) {
        // Fix #2 — ceiling reached: park the row instead of retrying it
        // into an ever-larger interval. `'infinity'::timestamptz` is a real
        // (non-NULL) value, so it satisfies the column's `NOT NULL`
        // constraint while guaranteeing `next_attempt_at <= NOW()` never
        // matches again — an operator has to manually reset it to retry.
        await pool.query(
          `UPDATE gdpr_cleanup_queue
              SET attempts = $2,
                  last_error = $3,
                  next_attempt_at = 'infinity'::timestamptz
            WHERE id = $1`,
          [row.id, nextAttempts, `max_attempts_exhausted: ${errorMessage}`],
        );
        exhausted += 1;
      } else {
        await pool.query(
          `UPDATE gdpr_cleanup_queue
              SET attempts = $2,
                  last_error = $3,
                  next_attempt_at = NOW() + ($4 || ' minutes')::interval
            WHERE id = $1`,
          [row.id, nextAttempts, errorMessage, String(backoffMinutes)],
        );
      }
    } catch (err) {
      // Fix #2 — one poison row must never take the whole batch down; every
      // other row's outcome above/below this one in the loop still lands.
      logger.error({
        msg: "gdpr_cleanup_retry_update_failed",
        queueRowId: row.id,
        service: row.service,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    failed += 1;
    logger.warn({
      msg: "gdpr_cleanup_attempt_failed",
      service: row.service,
      // Hard Rule #21 (Pino redaction) — log the opaque queue-row id, never
      // `row.user_id` (PII once tied back to a person, even post-deletion).
      queueRowId: row.id,
      attempts: nextAttempts,
      outcome: result.outcome,
      exhausted: willExhaust,
    });
  }

  const purged = await purgeExpiredCompletedRows(pool);

  return {
    processed,
    completed,
    waitingOnConfig,
    failed,
    exhausted,
    purged,
    deadlineExceeded,
  };
}
