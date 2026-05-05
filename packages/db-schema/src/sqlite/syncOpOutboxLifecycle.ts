import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

import type { SyncOpRetryPlan } from "./syncOpRetry.js";

/**
 * Write-side lifecycle helpers for the client-side `sync_op_outbox`
 * (`docs/planning/storage-roadmap.md` Stage 5 / PR #042e-lifecycle).
 *
 * Mirror of {@link drainSyncOpOutbox} (PR #042e-drain) on the write
 * side. Where the drain reader pulls due, pending rows out of the
 * outbox in insertion order, these three helpers advance the row's
 * lifecycle once `/api/v2/sync/push` returns:
 *
 * ```ts
 * for (const row of due) {
 *   const result = await syncV2Push({ ops: [mapToOp(row)] });
 *   const status = result.results[0]?.status;
 *   if (status === "applied" || status === "duplicate") {
 *     await markOutboxSuccess(client, row.id);
 *   } else if (status === "rejected") {
 *     await markOutboxRejected(client, row.id, result.results[0]!.reason);
 *   } else {
 *     // 5xx, network, timeout — call planRetry on the previous attempts
 *     await markOutboxRetry(
 *       client,
 *       row.id,
 *       planRetry(row.attempts, new Date(), "http_503"),
 *     );
 *   }
 * }
 * ```
 *
 * The push-loop orchestrator that wires these calls together lives in
 * `packages/api-client/src/sync/pushLoop.ts` (PR #042e-pushloop).
 *
 * Mutation contract:
 *
 * - {@link markOutboxSuccess} `DELETE`s the row by `id`. Calls on a
 *   missing row are a silent no-op (idempotent) — concurrent workers
 *   that drained the same `id` and both reach success after a
 *   server-side `(user_id, idempotency_key)` dedup are safe.
 * - {@link markOutboxRetry} and {@link markOutboxRejected} both update
 *   under `WHERE id = ? AND status = 'pending'` so a row that was
 *   already advanced to a terminal status by another worker is left
 *   alone. The drain reader filters on `status='pending'` already, so
 *   under normal operation only a parallel race ever puts a row out
 *   of `'pending'` between drain and lifecycle.
 * - All three helpers are tx-free — the engine batches its own
 *   transactions at a higher level, and SQLite's single-writer model
 *   means a tight `UPDATE` or `DELETE` does not need its own
 *   `BEGIN`/`COMMIT` to be atomic.
 *
 * Why this lives in db-schema (not api-client):
 *
 * - The SQL it issues is bound to the `sync_op_outbox` schema shape
 *   declared in `./routine.ts` (and provisioned by
 *   `001_routine_spike.sql` + `002_sync_op_outbox_retry.sql` from
 *   `./migrations/index.ts`). Keeping the helpers next to the schema
 *   means a future column rename surfaces here at typecheck-time, not
 *   in api-client.
 * - api-client deliberately has no dependency on db-schema (mirror
 *   shapes via tripwire tests; see PR #042e-mapping). The push-loop
 *   in api-client takes these helpers via DI so the dependency
 *   direction stays one-way.
 *
 * Failure modes:
 *
 * - The `client.run` shim does not surface SQLite's `changes()` count,
 *   so the helpers cannot return "did we update a row" without an
 *   extra `SELECT`. The cost is that callers cannot distinguish
 *   "row already terminal" from "row still pending and got updated";
 *   tests use a post-`SELECT` to assert state. This trade matches the
 *   {@link drainSyncOpOutbox} stance — surface state via the schema,
 *   not via helper return values — and keeps the wire-shape narrow.
 * - Driver-level errors (disk full, schema drift, FS lock) propagate
 *   to the caller unchanged. The push-loop converts them into
 *   `last_error='driver_error:<msg>'` on the next retry tick rather
 *   than swallowing them here.
 */

/**
 * Advance a successfully-pushed row out of the outbox.
 *
 * Issues `DELETE FROM sync_op_outbox WHERE id = ?` unconditionally —
 * SQLite's `DELETE` on a missing row is a silent no-op, which is the
 * idempotency we want for concurrent workers that both drained the
 * same id.
 *
 * @param client SQLite client (better-sqlite3 in tests; sqlite-wasm
 *               in `apps/web`; expo-sqlite in `apps/mobile`).
 * @param id     `sync_op_outbox.id` of the row that the server just
 *               acknowledged with `applied` or `duplicate`.
 */
export async function markOutboxSuccess(
  client: SqliteMigrationClient,
  id: number,
): Promise<void> {
  await client.run(`DELETE FROM sync_op_outbox WHERE id = ?`, [id]);
}

/**
 * Advance a row whose push attempt just failed transiently
 * (network error, 5xx, timeout). Updates `attempts`, `status`,
 * `next_retry_at`, and `last_error` from the {@link SyncOpRetryPlan}
 * computed by `planRetry` (`./syncOpRetry.ts`).
 *
 * Guarded with `status = 'pending'` so a parallel worker that already
 * advanced the row to `'rejected'` or `'dead_letter'` wins — this
 * helper is a no-op in that case.
 *
 * @param client SQLite client.
 * @param id     `sync_op_outbox.id` of the row whose push just failed.
 * @param plan   {@link SyncOpRetryPlan} from
 *               `planRetry(previousAttempts, now, lastError)`. The
 *               plan is precomputed on the caller side so this helper
 *               stays clock-pure (tests pin a deterministic clock).
 */
export async function markOutboxRetry(
  client: SqliteMigrationClient,
  id: number,
  plan: SyncOpRetryPlan,
): Promise<void> {
  await client.run(
    `UPDATE sync_op_outbox
        SET attempts = ?,
            status = ?,
            next_retry_at = ?,
            last_error = ?
      WHERE id = ?
        AND status = 'pending'`,
    [plan.attempts, plan.status, plan.nextRetryAt, plan.lastError, id],
  );
}

/**
 * Advance a row whose push attempt was terminally rejected by the
 * server (durable 4xx — for example, `op_not_supported`,
 * `tombstoned`, `missing_delta`, `invalid_delta`). Sets
 * `status='rejected'` and writes `reject_reason` for triage. The row
 * stays in the outbox so the dev panel and human-triage flows can
 * inspect it; the engine never retries `'rejected'` rows.
 *
 * Guarded with `status = 'pending'` so a parallel worker that already
 * advanced the row to a terminal status wins.
 *
 * @param client SQLite client.
 * @param id     `sync_op_outbox.id` of the rejected row.
 * @param reason Server-supplied rejection reason — written verbatim
 *               into `reject_reason`. Conventionally one of the
 *               server's stable enum values (e.g. `op_not_supported`,
 *               `tombstoned`, `invalid_delta`); not validated here.
 */
export async function markOutboxRejected(
  client: SqliteMigrationClient,
  id: number,
  reason: string,
): Promise<void> {
  await client.run(
    `UPDATE sync_op_outbox
        SET status = 'rejected',
            reject_reason = ?
      WHERE id = ?
        AND status = 'pending'`,
    [reason, id],
  );
}
