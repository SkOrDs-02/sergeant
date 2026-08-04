import type { Pool, PoolClient } from "pg";

/**
 * `gdpr_cleanup_queue` writer — ADR-0016 § ADR-6.3 "External services
 * cleanup queue" (`docs/04-governance/adr/0016-user-deletion-and-pii-handling.md`).
 * Schema landed schema-only in migration 113; this module is the Stage 2
 * wiring the migration's header comment calls out.
 *
 * On account deletion we enqueue one row per external service
 * (`stripe`, `sentry`, `posthog`, `resend`) so a background worker
 * (`cleanupWorker.ts`) can call each vendor's delete API asynchronously,
 * with retry/backoff, WITHOUT holding the `DELETE /api/v1/me` request open
 * for 2-3s of sequential third-party HTTP calls (ADR-6.3 rationale).
 *
 * `user_id`/`email` are snapshotted here because they must survive the
 * `"user"` row's hard-delete (migration 113's own header note: no FK on
 * purpose) — the worker still needs them to call, e.g., Resend's
 * contacts-by-email delete endpoint after the row is long gone.
 */

export type GdprCleanupService = "stripe" | "sentry" | "posthog" | "resend";

const ALL_SERVICES: readonly GdprCleanupService[] = [
  "stripe",
  "sentry",
  "posthog",
  "resend",
];

export interface EnqueueGdprCleanupInput {
  userId: string;
  /** Snapshot of `"user".email` taken BEFORE any anonymization/deletion. */
  email: string;
  /** `subscriptions.provider_customer_id` for the `provider = 'stripe'` row, if any. */
  stripeCustomerId?: string | null | undefined;
}

/**
 * Inserts one queue row per external service. Call this BEFORE the `"user"`
 * row is deleted (same transaction as `deleteUserData`, ideally) so the
 * `email`/`stripeCustomerId` snapshot is still accurate.
 *
 * Idempotency: this is called exactly once per real deletion (the caller
 * guards against enqueueing when the user row is already gone — see
 * `dataRights.ts::deleteUserData`), so no `ON CONFLICT` guard is needed;
 * the table has no natural unique key across (user_id, service) by design
 * (a user could theoretically be deleted, restored via support, and
 * deleted again, each time deserving its own cleanup attempt).
 *
 * Four separate static-literal `INSERT`s (one per service) rather than a
 * single dynamically-built multi-row `VALUES (...), (...), ...` — mirrors
 * `anthropicUsageStore.ts::recordAnthropicUsageToDb`'s own reasoning
 * (M11 no-dynamic-template `pool.query`): a hand-assembled placeholder
 * list is exactly the shape M11 flags, even though every value here is
 * still bound as a parameter, never interpolated into the SQL text.
 */
export async function enqueueGdprCleanup(
  db: Pick<Pool | PoolClient, "query">,
  input: EnqueueGdprCleanupInput,
): Promise<void> {
  const { userId, email, stripeCustomerId } = input;
  if (!userId || !email) return;

  for (const service of ALL_SERVICES) {
    await db.query(
      `INSERT INTO gdpr_cleanup_queue (user_id, email, stripe_customer_id, service)
       VALUES ($1, $2, $3, $4)`,
      [userId, email, stripeCustomerId ?? null, service],
    );
  }
}
