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
 * Per-row dispatch and what "done" means differs by service on purpose:
 *
 *   - `posthog`: `deletePostHogPerson()` predates this queue and documents
 *     its own contract — `"skipped"` (PostHog not configured at all in this
 *     deployment) is treated as nothing-to-wait-for, so the row is marked
 *     `completed_at` immediately.
 *   - `stripe` / `sentry` / `resend`: no admin-token wiring exists yet for
 *     these three. `"skipped"` here means "operator hasn't configured the
 *     token" — the row is left PENDING (neither `completed_at` nor
 *     `attempts` touched) so it is picked up again once the token is set,
 *     rather than being silently marked "cleaned" when nothing happened.
 *
 * `ok` / `not_found` (idempotent — already gone upstream) both count as
 * done. `rate_limited` / `timeout` / `error` increment `attempts` and
 * push `next_attempt_at` out with exponential backoff (`2^attempts` minutes,
 * ADR-6.3's own formula).
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
}

export interface ProcessGdprCleanupQueueResult {
  processed: number;
  completed: number;
  /** Rows left pending because the vendor isn't configured yet. */
  waitingOnConfig: number;
  failed: number;
}

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

export async function processGdprCleanupQueueBatch(
  pool: Pick<Pool, "query">,
  options: ProcessGdprCleanupQueueOptions = {},
): Promise<ProcessGdprCleanupQueueResult> {
  const limit = options.limit ?? 20;
  const fetchImpl = options.fetchImpl;

  const { rows } = await pool.query<GdprCleanupQueueRow>(
    `SELECT id, user_id, email, stripe_customer_id, service, attempts
       FROM gdpr_cleanup_queue
      WHERE completed_at IS NULL
        AND next_attempt_at <= NOW()
      ORDER BY next_attempt_at ASC
      LIMIT $1`,
    [limit],
  );

  let completed = 0;
  let waitingOnConfig = 0;
  let failed = 0;

  for (const row of rows) {
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
      // Admin token not configured for this vendor yet — leave pending.
      waitingOnConfig += 1;
      continue;
    }

    if (
      result.outcome === "ok" ||
      result.outcome === "not_found" ||
      result.outcome === "skipped"
    ) {
      await pool.query(
        `UPDATE gdpr_cleanup_queue SET completed_at = NOW() WHERE id = $1`,
        [row.id],
      );
      completed += 1;
      continue;
    }

    const nextAttempts = Number(row.attempts) + 1;
    const backoffMinutes = Math.pow(2, nextAttempts);
    await pool.query(
      `UPDATE gdpr_cleanup_queue
          SET attempts = $2,
              last_error = $3,
              next_attempt_at = NOW() + ($4 || ' minutes')::interval
        WHERE id = $1`,
      [
        row.id,
        nextAttempts,
        result.error ?? result.outcome,
        String(backoffMinutes),
      ],
    );
    failed += 1;
    logger.warn({
      msg: "gdpr_cleanup_attempt_failed",
      service: row.service,
      userId: row.user_id,
      attempts: nextAttempts,
      outcome: result.outcome,
    });
  }

  return { processed: rows.length, completed, waitingOnConfig, failed };
}
