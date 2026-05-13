import { ApiError } from "../ApiError";

import type {
  SyncV2OpKind,
  SyncV2OpResult,
  SyncV2PushOp,
  SyncV2PushOptions,
  SyncV2PushResponse,
} from "./syncV2";

/**
 * Composable, dependency-injected push-loop orchestrator that
 * implements one tick of the client-side sync engine: drain the local
 * `sync_op_outbox`, push the batch to `/api/v2/sync/push`, then advance
 * each row's lifecycle (success / transient retry / terminal reject)
 * based on the server's per-op result.
 *
 * Stage 5 PR #042e-pushloop of `docs/planning/storage-roadmap.md`.
 * Pairs with PR #042e-lifecycle (write-side helpers in db-schema:
 * `markOutboxSuccess` / `markOutboxRetry` / `markOutboxRejected`),
 * PR #042e-drain (read-side helper), PR #042d-builder (enqueue helper),
 * PR #042e-mapping (camelCase ↔ snake_case envelope translation),
 * and PR #042e-submit (build → map → enqueue producer pipeline).
 *
 * Why DI rather than direct imports of `drainSyncOpOutbox`,
 * `markOutbox*`, and `planRetry`? Because `api-client` and `db-schema`
 * deliberately do NOT depend on each other (PR #042d-builder Risk
 * note in the roadmap). Inversion of control through function-shaped
 * dependencies keeps the package boundary clean while still letting
 * the consumer module (sync engine boot path; not in scope here)
 * call a single one-tick entry-point:
 *
 * ```ts
 * const result = await runSyncEnginePushOnce(
 *   {
 *     drain: (opts) => drainSyncOpOutbox(sqliteClient, opts),
 *     push: (ops, opts) => syncV2.pushV2(ops, opts),
 *     markSuccess: (id) => markOutboxSuccess(sqliteClient, id),
 *     markRetry: (id, plan) => markOutboxRetry(sqliteClient, id, plan),
 *     markRejected: (id, reason) =>
 *       markOutboxRejected(sqliteClient, id, reason),
 *     planRetry,
 *     now: () => new Date(),
 *   },
 *   { limit: 100, originDeviceId: deviceId },
 * );
 * ```
 *
 * The actual periodic-timer wiring (boot, online/offline events,
 * push-on-enqueue flush, Sentry breadcrumbs) is intentionally out of
 * scope and ships in a follow-up wiring PR. This module is pure
 * orchestration: same input → same lifecycle writes → same return
 * shape. Tests pin the dispatch table by stubbing every dependency.
 *
 * Selection / dispatch contract:
 *
 * - The drain helper already filters to `status='pending'` and
 *   `next_retry_at IS NULL OR next_retry_at <= now`, ordered by
 *   `id ASC`, capped at `limit`. The orchestrator passes its own
 *   `now` (from `deps.now()`) so a single tick is monotonic — no
 *   clock skew between drain and lifecycle writes.
 * - On `drained.length === 0`: return `{drained:0,…}` immediately,
 *   no HTTP call, no lifecycle writes.
 * - On HTTP success (`fetch` resolves with a parsed
 *   {@link SyncV2PushResponse}): the orchestrator matches each
 *   per-op `SyncV2OpResult` to its drained row by `idempotency_key`
 *   (the only field guaranteed to round-trip 1:1 from request → DB →
 *   response). For each row:
 *   * `applied` or `duplicate` → {@link MarkOutboxSuccessFn} (DELETE).
 *   * `rejected` → {@link MarkOutboxRejectedFn} with `reason` (kept
 *     verbatim). Empty / missing `reason` falls back to a stable
 *     `unspecified` literal so the dev panel never shows `null`.
 *   * Unknown server-side status → {@link MarkOutboxRetryFn} via
 *     `planRetry` with `last_error="unknown_status:<value>"`. Forward-
 *     compat with future server statuses; the row stays in the queue
 *     and the next tick re-pushes once the orchestrator code is
 *     updated.
 *   * Missing result for a known idempotency_key → same as unknown
 *     status, with `last_error="missing_result"`. The server is
 *     supposed to return one result per op submitted; if it doesn't,
 *     leaving the row in `pending` and bumping `attempts` is safer
 *     than silently dropping it.
 * - On HTTP failure (any thrown error from `deps.push`): the entire
 *   batch goes to {@link MarkOutboxRetryFn}. The error is classified
 *   via {@link describePushError} into a stable, low-cardinality
 *   string (`network`, `timeout`, `http_5xx`, `http_503`, …) so
 *   `last_error` keeps a bounded label space (analytics rollup
 *   cardinality budget — see Stage 5 reject-reason hygiene rule).
 *   `ApiError.kind === 'http'` with `status === 401 | 403` (auth) is
 *   propagated as `auth_<status>` and is still treated as transient
 *   — the engine has no way to mint new credentials on its own;
 *   re-auth happens out of band, after which the next tick re-pushes.
 *
 * Idempotency on retry:
 *
 * - The server dedups on `(user_id, idempotency_key)`, so a re-push
 *   of the same batch returns `duplicate` for already-applied rows
 *   and `applied` for fresh ones. This means a transient failure
 *   between "DB write" and "HTTP response received" is recoverable
 *   without a custom replay store: the row stays in `pending`, the
 *   next tick re-pushes, and the server short-circuits the apply.
 *   The orchestrator does NOT need to special-case this.
 *
 * Concurrency:
 *
 * - Two concurrent ticks (e.g. periodic timer + manual "force sync"
 *   button) can both drain the same rows. The lifecycle helpers are
 *   guarded against this — `markOutbox{Success,Retry,Rejected}` are
 *   idempotent on missing rows and refuse to advance non-pending
 *   ones (PR #042e-lifecycle). So overlapping ticks are safe; they
 *   just observe a partially-drained state on the slower side.
 *
 * Failure modes:
 *
 * - The orchestrator does NOT catch errors thrown by the DI helpers
 *   (`drain`, `markSuccess`, `markRetry`, `markRejected`,
 *   `planRetry`). Storage-layer failures (disk full, schema drift,
 *   FS lock) propagate to the caller — the sync engine boot path is
 *   responsible for global error handling / Sentry. Catching them
 *   here would silently lose the row.
 * - A {@link DrainedOutboxRowShape} whose `op` is outside the
 *   `SyncV2OpKind` tuple is impossible — `drainSyncOpOutbox` itself
 *   throws on out-of-tuple ops. The mapping below assumes the input
 *   is well-formed.
 */

/**
 * Structural mirror of {@link DrainedOutboxRow} from
 * `packages/db-schema/src/sqlite/syncOpOutboxDrain.ts`. We mirror the
 * shape rather than importing the type so api-client doesn't grow a
 * workspace dep on db-schema. The drift-tripwire for the mirror lives
 * inline in the test file (a structural assignability assertion that
 * fails at compile time if either side changes a field name / type).
 */
export interface DrainedOutboxRowShape {
  /** `sync_op_outbox.id`, primary key. */
  readonly id: number;
  /** `sync_op_outbox.table_name`, renamed for symmetry with helper inputs. */
  readonly table: string;
  /** `sync_op_outbox.op`. Drain narrows it to {@link SyncV2OpKind}. */
  readonly op: SyncV2OpKind;
  /** `sync_op_outbox.row` after `JSON.parse`. */
  readonly row: Readonly<Record<string, unknown>>;
  /** ISO-8601 string written verbatim on enqueue. */
  readonly clientTs: string;
  /** Server-side dedup key. */
  readonly idempotencyKey: string;
  /** Current attempt counter — fed to `planRetry` on transient failure. */
  readonly attempts: number;
  /** `null` when the row was just enqueued; otherwise an ISO-8601 due-time. */
  readonly nextRetryAt: string | null;
  /** Last engine-reported failure reason; `null` for fresh enqueues. */
  readonly lastError: string | null;
  /** Schema-default `created_at`. */
  readonly createdAt: string;
}

/**
 * Structural mirror of {@link SyncOpRetryPlan} from
 * `packages/db-schema/src/sqlite/syncOpRetry.ts`. Returned by the
 * injected {@link PlanRetryFn} and consumed verbatim by
 * {@link MarkOutboxRetryFn}.
 */
export interface SyncOpRetryPlanShape {
  readonly attempts: number;
  readonly status: "pending" | "dead_letter";
  readonly nextRetryAt: string | null;
  readonly lastError: string;
}

/**
 * DI: drain due rows from the local outbox. Mirror of
 * `drainSyncOpOutbox(client, options)` from db-schema. Errors in the
 * drain helper propagate unchanged — the orchestrator does not catch
 * them, since drain is a read-only operation and a failing drain is
 * a hard schema/FS issue worth surfacing.
 */
export type DrainSyncOpOutboxFn = (options: {
  readonly limit: number;
  readonly now: Date;
}) => Promise<readonly DrainedOutboxRowShape[]>;

/**
 * DI: HTTP push to `/api/v2/sync/push`. In production this is wired
 * to `createSyncV2Endpoints(http).pushV2`. The function-shaped
 * dependency lets tests pin a fake without spinning up an HTTP layer.
 */
export type SyncV2PushFn = (
  ops: SyncV2PushOp[],
  options?: SyncV2PushOptions,
) => Promise<SyncV2PushResponse>;

/**
 * DI: lifecycle write — DELETE the row by id. Mirrors
 * `markOutboxSuccess(client, id)` from db-schema PR #042e-lifecycle.
 */
export type MarkOutboxSuccessFn = (id: number) => Promise<void>;

/**
 * DI: lifecycle write — UPDATE attempts/status/next_retry_at/last_error
 * from a precomputed plan. Mirrors
 * `markOutboxRetry(client, id, plan)` from db-schema PR #042e-lifecycle.
 */
export type MarkOutboxRetryFn = (
  id: number,
  plan: SyncOpRetryPlanShape,
) => Promise<void>;

/**
 * DI: lifecycle write — UPDATE status='rejected' + reject_reason.
 * Mirrors `markOutboxRejected(client, id, reason)` from db-schema
 * PR #042e-lifecycle.
 */
export type MarkOutboxRejectedFn = (
  id: number,
  reason: string,
) => Promise<void>;

/**
 * DI: pure retry-policy. Mirror of `planRetry` from
 * `packages/db-schema/src/sqlite/syncOpRetry.ts`. Takes the row's
 * previous attempt count, the engine's pinned clock, a stable
 * low-cardinality `lastError` label, and an optional `jitterMs` in
 * `[0, SYNC_OP_JITTER_WINDOW_MS]`; returns a {@link SyncOpRetryPlanShape}.
 *
 * The `jitterMs` argument exists so the orchestrator can desynchronize
 * fleet-wide retry storms after an outage (T3 audit MEDIUM finding —
 * without jitter, every client globally retries on identical 1s/2s/4s/…
 * boundaries). Pre-existing callers that omitted `jitterMs` still work:
 * the underlying `planRetry` impl defaults it to 0.
 */
export type PlanRetryFn = (
  previousAttempts: number,
  now: Date,
  lastError: string,
  jitterMs?: number,
) => SyncOpRetryPlanShape;

export interface SyncEnginePushDeps {
  readonly drain: DrainSyncOpOutboxFn;
  readonly push: SyncV2PushFn;
  readonly markSuccess: MarkOutboxSuccessFn;
  readonly markRetry: MarkOutboxRetryFn;
  readonly markRejected: MarkOutboxRejectedFn;
  readonly planRetry: PlanRetryFn;
  /**
   * Wall-clock for one tick. Single source of truth — the orchestrator
   * pins it once at the start, threads it into both `drain`
   * (`next_retry_at <= now`) and every `planRetry` call within the tick
   * so retry windows are deterministic in tests and monotonic in prod.
   */
  readonly now: () => Date;
  /**
   * Optional jitter source for `planRetry`. Returns a number in
   * `[0, SYNC_OP_JITTER_WINDOW_MS]` (250 ms today). The orchestrator
   * calls this once per `planRetry` invocation within a tick — never
   * caches across rows — so a transient batch failure spreads its
   * retries within the window instead of stacking them on the same
   * scheduler beat. Omit to keep the pre-PR-#040 zero-jitter behavior;
   * production singletons should wire `Math.random() *
   * SYNC_OP_JITTER_WINDOW_MS` so fleet-wide outage recoveries
   * desynchronize.
   */
  readonly jitterMs?: () => number;
}

export interface SyncEnginePushOptions {
  /**
   * Per-tick batch cap. Forwarded to `drain` verbatim; the orchestrator
   * does NOT page on its own (the next tick picks up whatever the
   * current tick acknowledged out of `pending`).
   */
  readonly limit: number;
  /**
   * Optional `X-Origin-Device-Id` header forwarded to `push`. When set,
   * `pull` from the same device can exclude its own writes.
   */
  readonly originDeviceId?: string;
}

export interface SyncEnginePushResult {
  /** Number of rows the drain returned (same as `pushed + retried + rejected`). */
  readonly drained: number;
  /** Rows the server acknowledged (`applied` or `duplicate`) — DELETED. */
  readonly pushed: number;
  /** Rows that hit a transient failure — UPDATEd with a new retry plan. */
  readonly retried: number;
  /** Rows the server terminally rejected — UPDATEd to `status='rejected'`. */
  readonly rejected: number;
}

/**
 * One tick of the client-side push-loop. Pure orchestration:
 *
 *   drain → map → push → lifecycle (success / retry / rejected)
 *
 * Returns aggregate counts; does not throw on transient HTTP /
 * network errors (those land in the `retried` bucket). Re-throws on
 * storage-layer failures (the DI helpers' errors propagate unchanged).
 */
export async function runSyncEnginePushOnce(
  deps: SyncEnginePushDeps,
  options: SyncEnginePushOptions,
): Promise<SyncEnginePushResult> {
  const now = deps.now();
  const drained = await deps.drain({ limit: options.limit, now });

  if (drained.length === 0) {
    return { drained: 0, pushed: 0, retried: 0, rejected: 0 };
  }

  const ops: SyncV2PushOp[] = drained.map(mapDrainedRowToSyncV2PushOp);
  const pushOptions: SyncV2PushOptions | undefined =
    options.originDeviceId !== undefined
      ? { originDeviceId: options.originDeviceId }
      : undefined;

  let response: SyncV2PushResponse;
  try {
    response = await deps.push(ops, pushOptions);
  } catch (err) {
    // Transport / HTTP failure: every row in the batch goes to retry.
    const lastError = describePushError(err);
    for (const row of drained) {
      const plan = callPlanRetry(deps, row.attempts, now, lastError);
      await deps.markRetry(row.id, plan);
    }
    return {
      drained: drained.length,
      pushed: 0,
      retried: drained.length,
      rejected: 0,
    };
  }

  // HTTP success: dispatch each row by its result.
  const resultByKey = new Map<string, SyncV2OpResult>();
  for (const result of response.results) {
    resultByKey.set(result.idempotency_key, result);
  }

  let pushed = 0;
  let retried = 0;
  let rejected = 0;

  for (const row of drained) {
    const result = resultByKey.get(row.idempotencyKey);

    if (result === undefined) {
      // Server returned 2xx but no matching result for this op.
      // Treat as transient: bump attempts, leave the row pending.
      const plan = callPlanRetry(deps, row.attempts, now, "missing_result");
      await deps.markRetry(row.id, plan);
      retried += 1;
      continue;
    }

    if (result.status === "applied" || result.status === "duplicate") {
      await deps.markSuccess(row.id);
      pushed += 1;
      continue;
    }

    if (result.status === "rejected") {
      const reason =
        typeof result.reason === "string" && result.reason.length > 0
          ? result.reason
          : "unspecified";
      await deps.markRejected(row.id, reason);
      rejected += 1;
      continue;
    }

    // Forward-compat: unknown future status. Don't drop the row;
    // mark for retry with a labelled error. The label keeps
    // `last_error` cardinality bounded.
    const unknownStatus = (result as { status: string }).status;
    const plan = callPlanRetry(
      deps,
      row.attempts,
      now,
      `unknown_status:${unknownStatus}`,
    );
    await deps.markRetry(row.id, plan);
    retried += 1;
  }

  return {
    drained: drained.length,
    pushed,
    retried,
    rejected,
  };
}

/**
 * Internal helper: forwards to `deps.planRetry`, only passing the 4th
 * `jitterMs` argument when the orchestrator has a `deps.jitterMs`
 * source. Done this way (rather than always passing `undefined`) so
 * existing call-sites and tests that assert `planRetry` was called with
 * exactly 3 arguments continue to pass — both shapes remain valid per
 * {@link PlanRetryFn}.
 */
function callPlanRetry(
  deps: SyncEnginePushDeps,
  previousAttempts: number,
  now: Date,
  lastError: string,
): SyncOpRetryPlanShape {
  if (deps.jitterMs === undefined) {
    return deps.planRetry(previousAttempts, now, lastError);
  }
  return deps.planRetry(previousAttempts, now, lastError, deps.jitterMs());
}

/**
 * Reverse of `mapSyncV2IncrementOpToOutboxInput` (PR #042e-mapping)
 * generalised to all four `SyncV2OpKind`s — flattens a drained row
 * (camelCase shape from db-schema) back into the `SyncV2PushOp` wire
 * shape (snake_case fields the server expects on `/api/v2/sync/push`).
 *
 * Field mapping (camelCase → snake_case):
 *
 * - `row.table`           → `table`
 * - `row.op`              → `op`           (verbatim, narrowed)
 * - `row.row`             → `row`          (passed by reference)
 * - `row.clientTs`        → `client_ts`
 * - `row.idempotencyKey`  → `idempotency_key`
 *
 * Drops the local-only fields (`id`, `attempts`, `nextRetryAt`,
 * `lastError`, `createdAt`) — those are write-side bookkeeping and
 * have no place on the wire.
 *
 * Exported for the drift-tripwire test that pins this mirror against
 * the `mapSyncV2IncrementOpToOutboxInput` round-trip in
 * `syncV2.increment.outboxEnqueue.test.ts`.
 */
export function mapDrainedRowToSyncV2PushOp(
  row: DrainedOutboxRowShape,
): SyncV2PushOp {
  return {
    table: row.table,
    op: row.op,
    row: row.row,
    client_ts: row.clientTs,
    idempotency_key: row.idempotencyKey,
  };
}

/**
 * Classify a thrown push error into a stable, low-cardinality string
 * suitable for `sync_op_outbox.last_error` and downstream metric
 * labels. Bucket scheme:
 *
 *   - {@link ApiError} `kind="aborted"`        → `"aborted"` (timeout / AbortSignal).
 *   - {@link ApiError} `kind="network"`        → `"network"`.
 *   - {@link ApiError} `kind="parse"`          → `"parse"`.
 *   - {@link ApiError} `kind="http"`,
 *     `status` 5xx (or `0`)                    → `"http_5xx"` if status omitted,
 *                                                otherwise `"http_<status>"`.
 *   - {@link ApiError} `kind="http"`,
 *     `status` 4xx                             → `"http_<status>"`. 401/403 are
 *                                                also surfaced this way; the
 *                                                engine treats them as transient
 *                                                because credentials may refresh
 *                                                out of band.
 *   - Anything else                            → `"unknown"`.
 *
 * Exported for tests; not part of the runtime contract.
 */
export function describePushError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === "aborted") {
      return "aborted";
    }
    if (err.kind === "network") {
      return "network";
    }
    if (err.kind === "parse") {
      return "parse";
    }
    if (err.kind === "http") {
      if (err.status >= 100) {
        return `http_${err.status}`;
      }
      return "http_5xx";
    }
  }
  return "unknown";
}
