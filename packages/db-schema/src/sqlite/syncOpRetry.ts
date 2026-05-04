/**
 * Persistent retry policy for the client-side `sync_op_outbox`
 * (`docs/planning/storage-roadmap.md` Stage 5 / PR #040).
 *
 * The op-log table itself is platform-independent (sqlite-wasm in
 * `apps/web`, expo-sqlite in `apps/mobile`, better-sqlite3 in tests),
 * so the retry math lives in pure functions here and is consumed by
 * each client repo through narrow helpers. The schema columns these
 * helpers manipulate are declared in `./routine.ts` and provisioned
 * by the `002_sync_op_outbox_retry.sql` migration in
 * `./migrations/index.ts`.
 *
 * Retry shape:
 *
 *   - On enqueue: `attempts=0`, `next_retry_at=NULL`, `last_error=NULL`.
 *     Sync engine picks the row up immediately (`next_retry_at IS NULL`
 *     branch in the partial pending index `sync_op_outbox_pending_due_idx_lite`).
 *   - On transient transport / 5xx response: increment `attempts`, set
 *     `last_error`, and compute `next_retry_at` via {@link computeBackoffMs}.
 *     The engine ignores rows whose `next_retry_at` is in the future so
 *     the device backs off without burning battery on a flapping API.
 *   - On the {@link SYNC_OP_MAX_ATTEMPTS}-th failure: flip status to
 *     `'dead_letter'`. The engine stops retrying; a human triage path
 *     (dev panel, support tooling) decides whether to reset to
 *     `'pending'` or surface the issue to the user.
 *
 * This module is intentionally pure — no SQL, no I/O, no Date.now() —
 * so callers can unit-test outcomes by passing a fixed `now`. Callers
 * that need to persist the resulting fields use the SQL helper
 * patterns documented inline below.
 */

/**
 * Maximum number of failed attempts before an op transitions from
 * `'pending'` to `'dead_letter'`. Tuned to give roughly 35 minutes of
 * exponential backoff between the first and last attempt with the
 * default base/cap settings, which mirrors the apps' typical
 * background-fetch wakeup cadence.
 */
export const SYNC_OP_MAX_ATTEMPTS = 10;

/**
 * Initial backoff (milliseconds) after the first failed attempt.
 * Doubles for each subsequent attempt up to {@link SYNC_OP_MAX_BACKOFF_MS}.
 */
export const SYNC_OP_BASE_BACKOFF_MS = 1_000;

/**
 * Backoff cap (milliseconds). The exponential schedule clamps at this
 * value so a long-lived offline session doesn't push `next_retry_at`
 * months into the future.
 */
export const SYNC_OP_MAX_BACKOFF_MS = 5 * 60 * 1_000;

/**
 * Jitter window (milliseconds) added to the deterministic backoff via
 * {@link computeBackoffMs}'s optional `jitterMs` argument. Callers
 * that want jitter should pass a value in `[0, SYNC_OP_JITTER_WINDOW_MS]`
 * derived from a per-run RNG; this constant is a recommendation, not
 * an enforced bound, so tests can pin the value to `0`.
 */
export const SYNC_OP_JITTER_WINDOW_MS = 250;

/**
 * Compute the exponential backoff for the {@link attempts}-th failed
 * attempt. Returns the **delay** (milliseconds) the caller should add
 * to "now" before scheduling the next retry — not an absolute timestamp.
 *
 * Schedule (default base = 1s, cap = 5min):
 *
 * | attempts | delay      |
 * | -------- | ---------- |
 * | 1        |   1s       |
 * | 2        |   2s       |
 * | 3        |   4s       |
 * | 4        |   8s       |
 * | 5        |  16s       |
 * | 6        |  32s       |
 * | 7        |  64s       |
 * | 8        | 128s       |
 * | 9        | 256s       |
 * | 10       | 300s (cap) |
 *
 * `attempts` of 0 (or negative) returns `0` — there's no "before the
 * first attempt" delay; the engine should retry the row immediately.
 * Callers that want jitter pass a non-negative `jitterMs` which is
 * added verbatim. Keeping jitter as a caller-provided argument lets
 * tests pin to `0` and production code use a per-run `Math.random()`.
 */
export function computeBackoffMs(attempts: number, jitterMs = 0): number {
  if (!Number.isFinite(attempts) || attempts <= 0) return 0;
  const exponent = Math.min(Math.floor(attempts) - 1, 30);
  const raw = SYNC_OP_BASE_BACKOFF_MS * Math.pow(2, exponent);
  const capped = Math.min(raw, SYNC_OP_MAX_BACKOFF_MS);
  const jitter = Math.max(0, jitterMs);
  return capped + jitter;
}

/**
 * Compute the absolute `next_retry_at` ISO-8601-with-offset timestamp
 * for a row whose attempt-counter just incremented to {@link attempts}.
 *
 * Returns the same string shape the rest of the SQLite schema uses
 * (UTC `Z` offset rather than `datetime('now')`'s offset-less form)
 * so cross-device LWW comparisons against the server-side `client_ts`
 * stay byte-identical.
 *
 * Pass `now` explicitly so this function is pure and trivially
 * testable with a fixed clock.
 */
export function computeNextRetryAt(
  attempts: number,
  now: Date,
  jitterMs = 0,
): string {
  const delayMs = computeBackoffMs(attempts, jitterMs);
  return new Date(now.getTime() + delayMs).toISOString();
}

/**
 * Decide the next status for a row whose push attempt just failed
 * with a transient error. Returns `'pending'` until the row has
 * exhausted {@link SYNC_OP_MAX_ATTEMPTS}; afterwards it returns
 * `'dead_letter'` and the caller should also clear `next_retry_at`
 * (no point in scheduling a retry the engine will not run).
 */
export function nextStatusForRetry(
  attemptsAfterIncrement: number,
): "pending" | "dead_letter" {
  return attemptsAfterIncrement >= SYNC_OP_MAX_ATTEMPTS
    ? "dead_letter"
    : "pending";
}

/**
 * Convenience plan object the caller writes back to the row. Combines
 * the status decision, the new attempt count, and the precomputed
 * `next_retry_at` so a single SQL `UPDATE` mutates all retry columns
 * atomically:
 *
 * ```sql
 * UPDATE sync_op_outbox
 *    SET attempts = ?, status = ?, next_retry_at = ?, last_error = ?
 *  WHERE id = ?
 * ```
 *
 * @param previousAttempts row's `attempts` value before the failed call.
 * @param now              current wall-clock time.
 * @param lastError        short machine-readable reason (≤ 120 chars
 *                         is conventional; not enforced here).
 * @param jitterMs         caller-provided jitter (see {@link computeBackoffMs}).
 */
export interface SyncOpRetryPlan {
  attempts: number;
  status: "pending" | "dead_letter";
  /** ISO-8601 timestamp; null when status is `'dead_letter'`. */
  nextRetryAt: string | null;
  lastError: string;
}

export function planRetry(
  previousAttempts: number,
  now: Date,
  lastError: string,
  jitterMs = 0,
): SyncOpRetryPlan {
  const attempts = Math.max(0, Math.floor(previousAttempts)) + 1;
  const status = nextStatusForRetry(attempts);
  const nextRetryAt =
    status === "dead_letter"
      ? null
      : computeNextRetryAt(attempts, now, jitterMs);
  return { attempts, status, nextRetryAt, lastError };
}
