import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

import { SYNC_OP_OUTBOX_STATUSES, type SyncOpOutboxStatus } from "./routine.js";

/**
 * Read-only status reporter for the client-side `sync_op_outbox`
 * (`docs/planning/storage-roadmap.md` Stage 5 / PR #042e-status).
 *
 * Pairs with {@link drainSyncOpOutbox} (PR #042e-drain) and the
 * write-side lifecycle helpers (PR #042e-lifecycle). Where the drain
 * reader pulls *due* `'pending'` rows out for the next push tick and
 * the lifecycle helpers advance rows out of `'pending'`, this helper
 * answers the orthogonal question: how many rows are currently in
 * each status bucket, regardless of `next_retry_at`?
 *
 * Three concrete consumers in the storage-roadmap pipeline:
 *
 * - **UI badge**: a small chip in the status row of the dev panel /
 *   onboarding-debug screen — "12 items waiting to sync" /
 *   "3 items in dead-letter, tap to retry". Reads pending +
 *   dead_letter; ignores rejected (terminal, server-side).
 * - **Sentry breadcrumbs**: the sync-engine boot path (follow-up
 *   wiring PR) emits one `sync.outbox` breadcrumb per push tick with
 *   the current bucket counts so post-hoc Sentry events from another
 *   call site (HubChat error, MonoWebhook 5xx) carry the queue
 *   pressure context for free.
 * - **Engine-side "should we tick?"**: a fast pre-check in the
 *   scheduler (PR #042e-scheduler) so a periodic interval can short-
 *   circuit before paying for a full {@link drainSyncOpOutbox} call
 *   when `pending === 0`. The drain call is already cheap on a
 *   partial index, but skipping the SELECT entirely keeps SQLite-WASM
 *   warm and avoids a no-op breadcrumb.
 *
 * Selection contract:
 *
 * - Aggregates the entire table by `status` in one round-trip:
 *   `SELECT status, COUNT(*) FROM sync_op_outbox GROUP BY status`.
 *   Uses the unique `(idempotency_key)` index implicitly (any
 *   reasonable plan); the partial-pending index is not needed
 *   because `'rejected'` and `'dead_letter'` rows participate.
 * - **Includes `next_retry_at` rows that are not yet due.** This is
 *   the explicit difference from {@link drainSyncOpOutbox}: a UI
 *   badge that hides backed-off rows would under-report queue
 *   pressure, and Sentry breadcrumbs benefit from the full picture.
 *   Callers that want only "due now" should call drain instead.
 * - All three statuses from {@link SYNC_OP_OUTBOX_STATUSES} are
 *   present in the returned object even when their database count is
 *   zero. This keeps the caller's destructure `{ pending, rejected,
 *   dead_letter }` total and removes a class of `?? 0` boilerplate
 *   from every consumer.
 *
 * Mutation contract:
 *
 * - **Read-only.** No `UPDATE`, no `DELETE`, no transaction.
 *   Concurrent calls (UI poll + scheduler pre-check + breadcrumb
 *   emit) cannot corrupt each other.
 *
 * Schema compatibility:
 *
 * - The helper rejects an unknown `status` literal in the result set
 *   the same way {@link drainSyncOpOutbox} rejects an unknown `op`:
 *   throws with the offending value, so a future migration that
 *   relaxes the CHECK without updating this reader fails loud rather
 *   than under-counting silently.
 *
 * - `bigint`→`number` coercion (AGENTS.md hard rule #1): SQLite
 *   `COUNT(*)` returns INTEGER (mapped to JS `number` by all three
 *   driver shims), but the helper still funnels every result through
 *   `Number()` and a `Number.isFinite` assertion so a future driver
 *   change that surfaces COUNT as `bigint` would surface here at
 *   typecheck-time / runtime, not as a string `"42"` leaking to a UI
 *   badge.
 */

export type SyncOpOutboxStatusCounts = {
  readonly [Status in SyncOpOutboxStatus]: number;
};

interface CountRowFromDb extends Record<string, unknown> {
  status: string;
  count: number | bigint;
}

/**
 * Count rows in `sync_op_outbox` grouped by `status`.
 *
 * Returns an object with a key for every member of
 * {@link SYNC_OP_OUTBOX_STATUSES} (currently `'pending'`,
 * `'rejected'`, `'dead_letter'`) — keys for empty buckets are present
 * with value `0`. Throws on:
 *
 *   - a `status` literal in the database that is not a member of
 *     {@link SYNC_OP_OUTBOX_STATUSES} (schema-invariant violation —
 *     a future CHECK relaxation that did not update this reader),
 *   - a `count` value that is not a finite number (driver-shim
 *     surprise: bigint coercion failed, NaN, or a non-numeric type).
 *
 * @param client SQLite client (better-sqlite3 in tests; sqlite-wasm
 *               in `apps/web`; expo-sqlite in `apps/mobile`).
 */
export async function countOutboxByStatus(
  client: SqliteMigrationClient,
): Promise<SyncOpOutboxStatusCounts> {
  const rows = await client.all<CountRowFromDb>(
    `SELECT status, COUNT(*) AS count
       FROM sync_op_outbox
      GROUP BY status`,
  );

  const counts = makeZeroedCounts();

  for (const row of rows) {
    if (!isKnownStatus(row.status)) {
      throw new Error(
        `countOutboxByStatus: unknown status=${JSON.stringify(row.status)} ` +
          `in sync_op_outbox; expected one of ${JSON.stringify(SYNC_OP_OUTBOX_STATUSES)}`,
      );
    }
    const coerced = Number(row.count);
    if (!Number.isFinite(coerced) || !Number.isInteger(coerced)) {
      throw new Error(
        `countOutboxByStatus: COUNT(*) for status=${JSON.stringify(row.status)} ` +
          `coerced to non-integer ${JSON.stringify(row.count)}`,
      );
    }
    if (coerced < 0) {
      throw new Error(
        `countOutboxByStatus: COUNT(*) for status=${JSON.stringify(row.status)} ` +
          `is negative (${coerced})`,
      );
    }
    counts[row.status] = coerced;
  }

  return counts;
}

function makeZeroedCounts(): { [Status in SyncOpOutboxStatus]: number } {
  // Build via a fresh object literal so every caller gets an
  // independent mutable copy rather than aliased state.
  const out: { [Status in SyncOpOutboxStatus]: number } = {
    pending: 0,
    rejected: 0,
    dead_letter: 0,
    quarantined: 0,
  };
  // Belt-and-suspenders: assert at runtime that the literal above
  // covers every status in the const tuple. If a new status is added
  // to SYNC_OP_OUTBOX_STATUSES without updating this object literal,
  // the typecheck above already fails — but the runtime check makes
  // the failure mode obvious in stack traces from old bundles, too.
  for (const status of SYNC_OP_OUTBOX_STATUSES) {
    if (!Object.prototype.hasOwnProperty.call(out, status)) {
      throw new Error(
        `countOutboxByStatus: zeroed-counts literal is missing status=${JSON.stringify(status)}; ` +
          `update makeZeroedCounts after extending SYNC_OP_OUTBOX_STATUSES`,
      );
    }
  }
  return out;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(SYNC_OP_OUTBOX_STATUSES);

function isKnownStatus(value: string): value is SyncOpOutboxStatus {
  return KNOWN_STATUSES.has(value);
}
