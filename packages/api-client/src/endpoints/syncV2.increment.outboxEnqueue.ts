import type { SyncV2PushOp } from "./syncV2";

/**
 * Adapter that flattens an `op='increment'` `SyncV2PushOp` envelope
 * (built by `buildSyncV2IncrementOp` upstream) into the camelCase
 * shape that `enqueueOutboxIncrement` (db-schema) expects.
 *
 * `db-schema` deliberately does NOT depend on `api-client` (see
 * PR #042d-builder Risk note in `docs/planning/storage-roadmap.md`),
 * so this adapter sits on the consumer side. The contract — field-name
 * alignment between snake_case `SyncV2PushOp` and camelCase
 * `OutboxIncrementInput` — is byte-aligned and pinned by
 * `syncV2.increment.outboxEnqueue.test.ts`; any drift on either side
 * fails CI before reaching production.
 *
 * Stage 5 PR #042e-mapping (`docs/planning/storage-roadmap.md`).
 * The actual sync-engine writer that calls `enqueueOutboxIncrement`
 * with this output ships in PR #042e (push-loop refactor).
 *
 * Cross-references:
 * - `packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts` →
 *   `OutboxIncrementInput` (the structural target shape).
 * - `./syncV2.increment.ts` → `buildSyncV2IncrementOp` (upstream typed
 *   builder; happy-path output is the input to this mapper).
 */

/**
 * `SyncV2PushOp` narrowed to `op='increment'`. Only PN-counter
 * envelopes flow through `enqueueOutboxIncrement`; the LWW kinds
 * (`insert`/`update`/`delete`) sit on a separate writer that this
 * mapper deliberately does NOT cover (different table, different
 * row-payload contract).
 */
export type SyncV2IncrementPushOp = SyncV2PushOp & { readonly op: "increment" };

/**
 * Structural mirror of `OutboxIncrementInput` from
 * `packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts`. We mirror
 * the shape rather than importing the type so api-client doesn't
 * grow a workspace dep on db-schema for one mapping function. The
 * regression test in this directory pins the structural identity —
 * if the db-schema interface drifts, the assertion fails in CI.
 */
export interface OutboxIncrementInputShape {
  /**
   * Owner of the row — the currently-authenticated user's id.
   * Persisted into `sync_op_outbox.user_id` (NOT NULL since migration
   * `005_sync_op_outbox_user_id.sql`, HIGH-#2 of the T3 audit). The
   * mapper does NOT read it off the `SyncV2PushOp.row` payload — the
   * caller (sync-engine writer / increment submitter) supplies it
   * explicitly so the column is always populated even when callers
   * choose to omit `user_id` from the row payload itself.
   */
  readonly userId: string;
  readonly table: string;
  readonly row: Readonly<Record<string, unknown>>;
  readonly clientTs: string;
  readonly idempotencyKey: string;
}

/**
 * Map a typed `op='increment'` envelope to the flat camelCase shape
 * that `enqueueOutboxIncrement` (`packages/db-schema`) consumes.
 *
 * Field mapping (snake_case → camelCase):
 *
 * - `op.table`            → `table`
 * - `op.row`              → `row` (passed through, no copy / no key sort)
 * - `op.client_ts`        → `clientTs`
 * - `op.idempotency_key`  → `idempotencyKey`
 *
 * The mapper does NOT include `op.op` — `enqueueOutboxIncrement`
 * writes the `'increment'` literal verbatim into the
 * `sync_op_outbox.op` column, so threading it through would be
 * redundant and a refactor hazard if the constant drifts. The
 * runtime assertion below guards against callers that bypass
 * TypeScript narrowing (e.g. via `as` casts or a JSON-deserialised
 * value with no compile-time guarantees).
 *
 * Throws synchronously on `op.op !== 'increment'`.
 */
export function mapSyncV2IncrementOpToOutboxInput(
  op: SyncV2IncrementPushOp,
  userId: string,
): OutboxIncrementInputShape {
  if (op.op !== "increment") {
    throw new Error(
      `mapSyncV2IncrementOpToOutboxInput: expected op='increment', got ${JSON.stringify(op.op)}`,
    );
  }
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error(
      `mapSyncV2IncrementOpToOutboxInput: userId is required — ` +
        `sync_op_outbox.user_id is NOT NULL since migration 005.`,
    );
  }
  return {
    userId,
    table: op.table,
    row: op.row,
    clientTs: op.client_ts,
    idempotencyKey: op.idempotency_key,
  };
}
