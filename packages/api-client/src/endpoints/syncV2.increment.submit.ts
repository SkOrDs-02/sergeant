import {
  buildSyncV2IncrementOp,
  type BuildSyncV2IncrementOpInput,
  type BuildSyncV2IncrementOpReason,
} from "./syncV2.increment";
import {
  mapSyncV2IncrementOpToOutboxInput,
  type OutboxIncrementInputShape,
  type SyncV2IncrementPushOp,
} from "./syncV2.increment.outboxEnqueue";

/**
 * Composable consumer-side helper that ties together the three already-
 * landed building blocks of the PN-counter `op='increment'` pipeline
 * (`docs/planning/storage-roadmap.md` Stage 5):
 *
 * 1. {@link buildSyncV2IncrementOp} (PR #042c) — typed envelope builder
 *    with bit-for-bit server-mirrored validation.
 * 2. {@link mapSyncV2IncrementOpToOutboxInput} (PR #042e-mapping) —
 *    snake_case → camelCase flattener for the db-schema enqueue input.
 * 3. A dependency-injected `submit` function — supplied by the caller
 *    and structurally mirrors `enqueueOutboxIncrement`
 *    (`packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts`,
 *    PR #042d-builder).
 *
 * Why DI rather than a direct import of `enqueueOutboxIncrement`?
 * Because `api-client` and `db-schema` deliberately do NOT depend on
 * each other (see PR #042d-builder Risk note in the roadmap). Inversion
 * of control through a function-shaped dependency keeps the package
 * boundaries clean while still letting consumer code (web / mobile
 * routine modules, future PN-counter producers) call a single
 * three-step pipeline:
 *
 * ```ts
 * const result = await submitSyncV2IncrementOp(
 *   (input) => enqueueOutboxIncrement(sqliteClient, input),
 *   { table, delta, clientTs, idempotencyKey },
 * );
 * if (!result.ok) {
 *   recordRejected(result.reason);
 *   return;
 * }
 * recordOutboxEnqueued({ id: result.id, inserted: result.inserted });
 * ```
 *
 * Stage 5 PR #042e of `docs/planning/storage-roadmap.md`. The full
 * sync-engine writer (push-loop refactor that drains
 * `sync_op_outbox` against `/api/v2/sync/push`) is the next step on
 * top of this helper. This PR ships the composable surface so future
 * call-sites — whichever module first wants to enqueue a PN-counter
 * delta — can plug into a single API rather than wiring three
 * layers individually.
 *
 * Result-discriminated-union mirror:
 *
 * - On `buildSyncV2IncrementOp` reject: `{ ok: false, reason }` with
 *   the same `op_not_supported` / `missing_delta` / `invalid_delta`
 *   string-literals as the upstream builder, threaded through 1:1.
 *   `submit` is NOT called — no outbox row is written for an envelope
 *   that the server would reject engine-level anyway.
 * - On a successful build + enqueue: `{ ok: true, id, inserted }`
 *   from the injected `submit`. `inserted=false` means the helper
 *   found an existing row under the same `idempotencyKey` and the
 *   call was a no-op replay; callers can wire telemetry on
 *   `inserted` without branching on a reject reason.
 *
 * Idempotency contract is inherited verbatim from
 * `enqueueOutboxIncrement` — see its docstring. Replaying the same
 * `idempotencyKey` is safe and returns the original row's `id`.
 */

/**
 * Successful outcome of the injected `submit` step. Structurally
 * mirrors `EnqueueOutboxIncrementOk` from db-schema's
 * `syncOpOutboxEnqueue.ts` so callers can pass the helper's result
 * straight through to telemetry without branching.
 *
 * Keep the field set byte-aligned with db-schema; the regression
 * test in `syncV2.increment.submit.test.ts` pins the shape.
 */
export interface SubmitSyncV2IncrementOpEnqueued {
  readonly ok: true;
  /** `sync_op_outbox.id` of the freshly-inserted or pre-existing row. */
  readonly id: number;
  /**
   * `true` when the `submit` step inserted a new row, `false` when it
   * found an existing row under the same `idempotencyKey` and
   * returned its id verbatim (idempotent replay).
   */
  readonly inserted: boolean;
}

/**
 * Reject outcome. `reason` is propagated 1:1 from
 * `buildSyncV2IncrementOp`, so callers can record it under the same
 * `sync_op_outbox_reject_total{reason}` cardinality budget that the
 * upstream builder already uses.
 */
export interface SubmitSyncV2IncrementOpRejected {
  readonly ok: false;
  readonly reason: BuildSyncV2IncrementOpReason;
}

export type SubmitSyncV2IncrementOpResult =
  | SubmitSyncV2IncrementOpEnqueued
  | SubmitSyncV2IncrementOpRejected;

/**
 * Function-shaped dependency that durably enqueues an
 * already-validated `op='increment'` envelope.
 *
 * Structurally mirrors the signature of `enqueueOutboxIncrement`
 * from `packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts` so an
 * adapter on the consumer side is a one-liner:
 *
 * ```ts
 * const submit: SubmitSyncV2IncrementOpFn =
 *   (input) => enqueueOutboxIncrement(sqliteClient, input);
 * ```
 *
 * Implementations MUST be idempotent on `input.idempotencyKey` —
 * `submitSyncV2IncrementOp` short-circuits on a build reject but does
 * NOT pre-check the outbox for a duplicate. Idempotency is the
 * `submit`-side responsibility; the canonical implementation
 * (`enqueueOutboxIncrement`) covers it via the
 * `sync_op_outbox_idem_uniq_lite` unique index.
 */
export type SubmitSyncV2IncrementOpFn = (
  input: OutboxIncrementInputShape,
) => Promise<{ readonly id: number; readonly inserted: boolean }>;

/**
 * Build → map → enqueue pipeline for a PN-counter `op='increment'`
 * envelope.
 *
 * Never throws on validation failure — returns
 * `{ ok: false, reason }` with the same string-literal that
 * `buildSyncV2IncrementOp` would. Throws synchronously only if the
 * injected `submit` throws (the helper does NOT swallow `submit`
 * errors; storage-layer failures are the caller's concern).
 */
export async function submitSyncV2IncrementOp(
  submit: SubmitSyncV2IncrementOpFn,
  input: BuildSyncV2IncrementOpInput,
): Promise<SubmitSyncV2IncrementOpResult> {
  const built = buildSyncV2IncrementOp(input);
  if (!built.ok) {
    return { ok: false, reason: built.reason };
  }
  const outboxInput = mapSyncV2IncrementOpToOutboxInput(
    built.op as SyncV2IncrementPushOp,
  );
  const enqueued = await submit(outboxInput);
  return { ok: true, id: enqueued.id, inserted: enqueued.inserted };
}
