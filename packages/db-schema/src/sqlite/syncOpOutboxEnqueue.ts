import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

/**
 * Durable enqueue helper for PN-counter `op='increment'` envelopes
 * into the client-side `sync_op_outbox` (`docs/planning/storage-roadmap.md`
 * Stage 5 / PR #042d-builder).
 *
 * Pairs with `buildSyncV2IncrementOp`
 * (`packages/api-client/src/endpoints/syncV2.increment.ts`, PR #042c) —
 * callers that have a validated envelope flatten it into
 * {@link OutboxIncrementInput} and call this helper to write it
 * durably:
 *
 * ```ts
 * const built = buildSyncV2IncrementOp({ table, delta, clientTs,
 *                                        idempotencyKey });
 * if (!built.ok) {
 *   recordRejected(built.reason);
 *   return;
 * }
 * const enq = await enqueueOutboxIncrement(client, {
 *   table: built.op.table,
 *   row: built.op.row,
 *   clientTs: built.op.client_ts,
 *   idempotencyKey: built.op.idempotency_key,
 * });
 * ```
 *
 * `db-schema` deliberately does NOT depend on `api-client`, so the
 * helper accepts a flat input shape rather than `SyncV2PushOp`. A
 * regression-test in api-client
 * (`syncV2.increment.outboxEnqueue.test.ts`) pins the field-name
 * mapping so the two shapes stay byte-aligned.
 *
 * Schema contract:
 *
 * - Writes `op='increment'` literally — caller cannot override. The
 *   `003_sync_op_outbox_increment_op.sql` migration (PR #042d-prep)
 *   admits this literal alongside the legacy LWW kinds.
 * - `status='pending'`, `attempts=0`, `next_retry_at=NULL`,
 *   `last_error=NULL`, `created_at=datetime('now')` come from the
 *   schema defaults — the helper never overrides them. Mutating
 *   retry state goes through `planRetry` (`./syncOpRetry.ts`).
 * - `row` is `JSON.stringify`-ed exactly as the caller hands it in
 *   (no key sorting). Callers that want byte-stable hashing of the
 *   payload pre-canonicalise their object.
 *
 * Idempotency:
 *
 * - `sync_op_outbox` has a UNIQUE INDEX
 *   `sync_op_outbox_idem_uniq_lite (idempotency_key)`. The helper
 *   pre-checks for an existing row under the same `idempotencyKey`
 *   and short-circuits; on a fresh key it issues an `INSERT OR IGNORE`
 *   so a race-conceded duplicate also degrades to a no-op rather
 *   than throwing on the UNIQUE constraint. Single-threaded SQLite
 *   clients (better-sqlite3, sqlite-wasm worker, expo-sqlite) do
 *   not actually race; the IGNORE is defence-in-depth.
 * - On a duplicate the helper returns
 *   `{ ok: true, id, inserted: false }` with the **existing** row's
 *   id — callers can wire telemetry on `inserted` without branching
 *   on a reject reason. `inserted: true` means the helper committed
 *   a new row.
 * - Rationale: replay-safety mirrors the server's
 *   `(user_id, idempotency_key)` dedup in `applyPushOps` —
 *   client-side dedup makes a `pushV2` retry a no-op even if the
 *   first envelope already sat in the outbox.
 */

export interface OutboxIncrementInput {
  /**
   * Owner of the row — the currently-authenticated user's id
   * (Better Auth opaque string). Persisted into the new `user_id`
   * column added by `005_sync_op_outbox_user_id.sql` (HIGH-#2 of the
   * T3 audit). Used by `drainSyncOpOutbox` as the scope filter so a
   * shared-device session swap cannot smuggle the previous user's
   * queued ops under the new user's cookie. Empty string is rejected
   * (the column is `NOT NULL` and an empty owner is a programmer bug).
   */
  readonly userId: string;
  /**
   * Target table. Must be a member of `INCREMENT_OP_SUPPORTED_TABLES`
   * (server engine-gate + api-client allowlist) — the helper does
   * NOT re-validate. Use `buildSyncV2IncrementOp` upstream for
   * validation; the helper is the durable-write layer below it.
   */
  readonly table: string;
  /**
   * Row payload that the server's apply-fn consumes. For
   * `routine_streaks`, the only consumer today, this is `{ delta }`
   * plus optional `user_id`. The helper JSON-stringifies as-is.
   */
  readonly row: Readonly<Record<string, unknown>>;
  /** ISO-8601 timestamp; written verbatim into `client_ts`. */
  readonly clientTs: string;
  /**
   * ULID/UUID, unique under `(user_id, idempotency_key)` server-side.
   * The helper uses it as the dedup key. Empty string is NOT
   * validated here — server's zod schema rejects it on push and the
   * outbox would carry a useless row, so callers should pre-validate.
   */
  readonly idempotencyKey: string;
}

export interface EnqueueOutboxIncrementOk {
  readonly ok: true;
  /**
   * `sync_op_outbox.id` of the row this call is associated with —
   * either the freshly-inserted row (when {@link inserted} is `true`)
   * or the pre-existing row that owns the same `idempotency_key`
   * (when {@link inserted} is `false`).
   */
  readonly id: number;
  /**
   * `true` when this call inserted a new row, `false` when the
   * helper found an existing row under the same `idempotency_key`
   * and returned its id verbatim. Callers wire this into the
   * `sync_op_outbox_enqueue_total{result="inserted"|"deduped"}`
   * counter (introduced in a later observability PR).
   */
  readonly inserted: boolean;
}

export type EnqueueOutboxIncrementResult = EnqueueOutboxIncrementOk;

/**
 * Durably append an `op='increment'` envelope to the client-side
 * `sync_op_outbox`. Idempotent on `idempotencyKey` — see module
 * docstring.
 *
 * Never throws on idempotency-key collision; SQL errors (e.g.
 * unrelated `CHECK` failures, FS-level disk full) propagate to the
 * caller unchanged so the higher-level sync engine can decide
 * whether to back off or escalate.
 */
export async function enqueueOutboxIncrement(
  client: SqliteMigrationClient,
  input: OutboxIncrementInput,
): Promise<EnqueueOutboxIncrementResult> {
  const { userId, table, row, clientTs, idempotencyKey } = input;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error(
      `enqueueOutboxIncrement: userId is required (NOT NULL column ` +
        `since migration 005). Pass the authenticated session userId.`,
    );
  }
  const rowJson = JSON.stringify(row);

  // Pre-check: if a row already owns this idempotency_key, return
  // its id verbatim and short-circuit without touching the table.
  // Steady-state replays (e.g. a network-timed-out push retried by
  // the engine) all land here rather than burning an INSERT only
  // for the IGNORE clause to drop it.
  const existing = await client.all<{ id: number }>(
    `SELECT id FROM sync_op_outbox WHERE idempotency_key = ?`,
    [idempotencyKey],
  );
  if (existing.length === 1) {
    return { ok: true, id: existing[0]!.id, inserted: false };
  }

  // Fresh key → write a new row. `INSERT OR IGNORE` is defence-in-depth
  // against a hypothetical race window between the SELECT above and
  // this INSERT (single-threaded SQLite drivers do not actually race,
  // but an interleaved call from a parallel adapter could). On the
  // happy path the IGNORE clause is a no-op — a real UNIQUE collision
  // means a parallel writer landed first, and the SELECT below resolves
  // the surviving row's id.
  await client.run(
    `INSERT OR IGNORE INTO sync_op_outbox
       (user_id, table_name, op, row, client_ts, idempotency_key)
     VALUES (?, ?, 'increment', ?, ?, ?)`,
    [userId, table, rowJson, clientTs, idempotencyKey],
  );

  const after = await client.all<{ id: number }>(
    `SELECT id FROM sync_op_outbox WHERE idempotency_key = ?`,
    [idempotencyKey],
  );
  if (after.length !== 1) {
    // The UNIQUE index guarantees at most one row per
    // idempotency_key. Zero rows here means the INSERT was silently
    // dropped by some constraint we do NOT know about — surface it
    // loudly so the higher-level sync engine can dead-letter the
    // envelope rather than spin on a phantom enqueue.
    throw new Error(
      `enqueueOutboxIncrement: expected exactly one row for ` +
        `idempotency_key=${JSON.stringify(idempotencyKey)}, got ${after.length}`,
    );
  }
  return { ok: true, id: after[0]!.id, inserted: true };
}
