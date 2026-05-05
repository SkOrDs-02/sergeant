import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

/**
 * Dead-letter recovery helper for the client-side `sync_op_outbox`
 * (`docs/planning/storage-roadmap.md` Stage 5 / PR #042e-recover).
 *
 * Pairs with the lifecycle helpers (PR #042e-lifecycle) and the
 * status reader (PR #042e-status). Lifecycle helpers move rows
 * forward (`pending` → terminal); the status reader exposes how many
 * are stuck in each terminal bucket; this helper closes the loop on
 * the read-side: it brings rows back from `'dead_letter'` to
 * `'pending'` so the next push tick re-tries them.
 *
 * Why dead-letter only, not rejected:
 *
 * - `'rejected'` is a server-side terminal status (server said
 *   `op_not_supported` / `tombstoned` / etc.) — a client-driven
 *   recovery would just bounce off the server again. Rejected rows
 *   are removed by the operator after diagnosing the underlying
 *   schema drift, not retried.
 * - `'dead_letter'` is a client-side terminal status (we ran out of
 *   retries against transient server failures). The next time the
 *   user is back online or the outage is over, an operator (or the
 *   UI dev panel) can call this helper to give them another shot.
 *
 * Two recovery modes (mutually exclusive — exactly one must be set):
 *
 * - `{ ids: number[] }` — recover a specific list of rows. Used by
 *   the dev panel ("retry this row" / "retry these 5 rows" buttons)
 *   and by ops scripts that recover after fixing a server-side bug.
 *   Rows in the list whose current status is not `'dead_letter'`
 *   are reported in `skipped` (not in `recovered`); duplicate ids
 *   in the input are de-duplicated before the SQL.
 * - `{ all: true }` — recover every dead-letter row in one shot.
 *   Used by the "retry all" / "force flush" workflow after a
 *   service incident is resolved. Bounded internally by the row
 *   count of the dead-letter bucket; for huge backlogs callers
 *   should chunk via `ids` so they can show progress.
 *
 * Mutation contract (idempotent + total):
 *
 * - `UPDATE sync_op_outbox SET status='pending', attempts=0,
 *   next_retry_at=NULL, last_error=NULL WHERE id IN (...) AND
 *   status='dead_letter'`. The `WHERE status='dead_letter'` guard
 *   makes the helper safe under concurrent races: another worker
 *   that has just moved the same id back to `'pending'` cannot have
 *   its retry counter clobbered, and a row that some out-of-band
 *   tool moved to `'rejected'` is left alone.
 * - `attempts` is reset to `0` so {@link planRetry} on the next
 *   transient failure re-walks the full backoff curve (matches
 *   user mental model: "retry from scratch").
 * - `next_retry_at` and `last_error` are cleared so {@link drainSyncOpOutbox}
 *   sees the row as immediately due. The recovery operation is
 *   idempotent on a row that is already pending: the `WHERE` guard
 *   filters it out, and the row stays in its current pending state.
 * - The helper is tx-free for the same reason as the lifecycle
 *   helpers — SQLite's single-writer model makes a single UPDATE
 *   atomic, and the engine batches its own transactions at a
 *   higher level when needed.
 *
 * Why this lives in db-schema (not api-client):
 *
 * - The SQL it issues is bound to the `sync_op_outbox` schema shape
 *   declared in `./routine.ts`. Keeping the helper next to the
 *   schema means a future column rename (e.g., `last_error` →
 *   `last_failure`) surfaces here at typecheck-time.
 * - The api-client's push-loop / scheduler do not need to know
 *   about recovery — recovery is a UI / ops affordance, not part
 *   of the push loop itself. The boot-path helper that wires
 *   recovery into the dev panel takes this function via DI in the
 *   same way it takes drain / lifecycle helpers (PR #042e-pushloop
 *   pattern).
 *
 * Failure modes:
 *
 * - The `client.run` shim does not surface SQLite's `changes()`
 *   count, so the helper performs a `SELECT id FROM sync_op_outbox
 *   WHERE id IN (...) AND status='pending'` after the UPDATE to
 *   compute the `recovered` set. Cost is one extra round-trip per
 *   call, which is fine because recovery is a low-frequency
 *   operation (manual UI button or periodic ops script).
 * - Driver-level errors (disk full, schema drift, FS lock)
 *   propagate to the caller unchanged. Recovery should be a
 *   foreground operation with a visible failure mode in the UI.
 *
 * Tests pin the contract: idempotent on already-pending / missing
 * ids, no-op when the input list is empty, no-op for `all: true`
 * when no dead-letter rows exist, status transitions are
 * dead-letter-only (rejected + pending rows are left alone), and
 * the `attempts` / `next_retry_at` / `last_error` reset is total.
 */

export type RecoverDeadLetterSelector =
  | { readonly ids: readonly number[]; readonly all?: undefined }
  | { readonly all: true; readonly ids?: undefined };

export interface RecoverDeadLetterResult {
  /** Ids that transitioned `'dead_letter'` → `'pending'` in this call. */
  readonly recovered: readonly number[];
  /**
   * Ids passed in via {@link RecoverDeadLetterSelector.ids} that did
   * NOT transition because their current status was not
   * `'dead_letter'` (or the row was missing). Always empty when the
   * caller used `{ all: true }`.
   */
  readonly skipped: readonly number[];
}

/**
 * Move rows from `'dead_letter'` back to `'pending'` so the next
 * push tick re-tries them. Resets `attempts=0`, `next_retry_at=NULL`,
 * and `last_error=NULL` on each recovered row.
 *
 * Throws on:
 *
 *   - both `ids` and `all` set, or neither set (selector is
 *     mutually exclusive);
 *   - `ids` containing a non-finite or non-integer value (caller
 *     bug — would generate malformed SQL);
 *   - `ids` containing a negative id (schema-invariant violation).
 *
 * @param client SQLite client (better-sqlite3 in tests; sqlite-wasm
 *               in `apps/web`; expo-sqlite in `apps/mobile`).
 * @param selector Either an explicit `{ ids: [...] }` list or
 *                 `{ all: true }` to recover every dead-letter row.
 */
export async function recoverDeadLetter(
  client: SqliteMigrationClient,
  selector: RecoverDeadLetterSelector,
): Promise<RecoverDeadLetterResult> {
  validateSelector(selector);

  if (selector.all === true) {
    return recoverAllDeadLetter(client);
  }

  return recoverByIds(client, selector.ids);
}

function validateSelector(selector: RecoverDeadLetterSelector): void {
  const hasIds = selector.ids !== undefined;
  const hasAll = selector.all !== undefined;
  if (hasIds === hasAll) {
    throw new Error(
      `recoverDeadLetter: selector must set exactly one of { ids } or { all: true }`,
    );
  }
}

async function recoverAllDeadLetter(
  client: SqliteMigrationClient,
): Promise<RecoverDeadLetterResult> {
  // Snapshot the dead-letter set BEFORE the UPDATE so we can return
  // the recovered ids verbatim. Any rows that arrive in dead-letter
  // between the SELECT and the UPDATE are picked up by the next
  // recovery call — that race is harmless because dead-letter is a
  // terminal status (no other writer moves rows out of it).
  const snapshot = await client.all<{ id: number }>(
    `SELECT id FROM sync_op_outbox WHERE status = 'dead_letter' ORDER BY id ASC`,
  );
  if (snapshot.length === 0) {
    return { recovered: [], skipped: [] };
  }
  await client.run(
    `UPDATE sync_op_outbox
        SET status = 'pending',
            attempts = 0,
            next_retry_at = NULL,
            last_error = NULL
      WHERE status = 'dead_letter'`,
    [],
  );
  return { recovered: snapshot.map((row) => row.id), skipped: [] };
}

async function recoverByIds(
  client: SqliteMigrationClient,
  rawIds: readonly number[],
): Promise<RecoverDeadLetterResult> {
  const ids = dedupeIds(rawIds);
  if (ids.length === 0) {
    return { recovered: [], skipped: [] };
  }

  const placeholders = ids.map(() => "?").join(", ");
  // Pin the recoverable set before issuing the UPDATE — without
  // SQLite's `changes()` we cannot see post-hoc which rows the
  // UPDATE actually touched, so we capture the eligible set first.
  // The status guard on the UPDATE keeps this race-safe: a row that
  // moves out of `'dead_letter'` between the SELECT and the UPDATE
  // is dropped by the UPDATE's WHERE, and we report it as `skipped`
  // because it is no longer in the eligible set the second SELECT
  // returns.
  const eligibleRows = await client.all<{ id: number }>(
    `SELECT id FROM sync_op_outbox
      WHERE id IN (${placeholders}) AND status = 'dead_letter'`,
    ids,
  );
  const eligible = new Set(eligibleRows.map((row) => row.id));

  if (eligible.size > 0) {
    await client.run(
      `UPDATE sync_op_outbox
          SET status = 'pending',
              attempts = 0,
              next_retry_at = NULL,
              last_error = NULL
        WHERE id IN (${placeholders}) AND status = 'dead_letter'`,
      ids,
    );
  }

  const recovered: number[] = [];
  const skipped: number[] = [];
  for (const id of ids) {
    if (eligible.has(id)) {
      recovered.push(id);
    } else {
      skipped.push(id);
    }
  }
  return { recovered, skipped };
}

function dedupeIds(rawIds: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of rawIds) {
    if (!Number.isFinite(id) || !Number.isInteger(id)) {
      throw new Error(
        `recoverDeadLetter: ids must be finite integers, got ${JSON.stringify(id)}`,
      );
    }
    if (id < 0) {
      throw new Error(`recoverDeadLetter: ids must be non-negative, got ${id}`);
    }
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
