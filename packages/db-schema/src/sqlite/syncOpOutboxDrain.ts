import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

import { SYNC_OP_OUTBOX_OPS, type SyncOpOutboxOp } from "./routine.js";

/**
 * Pure SQLite-side reader for the client push-loop
 * (`docs/planning/storage-roadmap.md` Stage 5 / PR #042e-drain).
 *
 * Pairs with `enqueueOutboxIncrement` (PR #042d-builder) on the write
 * side and feeds the eventual sync-engine writer (full-scope PR #042e):
 *
 * ```ts
 * const due = await drainSyncOpOutbox(client, { now, limit: 100 });
 * for (const row of due) {
 *   const op = mapOutboxRowToSyncV2PushOp(row); // PR-042e mapping
 *   await syncV2Push({ ops: [op] });            // /api/v2/sync/push
 * }
 * ```
 *
 * Selection contract:
 *
 * - `status='pending'` and the partial-pending index
 *   `sync_op_outbox_pending_due_idx_lite` (installed by PR #040,
 *   preserved through PR #042d-prep) are the only authoritative
 *   filters: `'rejected'` and `'dead_letter'` rows are intentionally
 *   skipped because they are terminal — the engine never re-pushes
 *   them. Triage moves a `'dead_letter'` row back to `'pending'` out
 *   of band; the next drain picks it up automatically.
 * - `next_retry_at IS NULL` (fresh enqueue, never tried) AND rows
 *   whose `next_retry_at <= now` (backed-off retry now due) are
 *   returned together — the engine does not need to distinguish.
 *   `next_retry_at > now` rows are skipped: their backoff window
 *   has not elapsed yet. The {@link DrainSyncOpOutboxOptions.now}
 *   argument is required so callers can pin a deterministic clock
 *   in tests; in production it is `new Date()`.
 * - Insertion-order delivery: ordered by `id ASC`. The outbox is an
 *   append-only log per device, so `id ASC` is equivalent to
 *   wall-clock-of-enqueue order. The server's `/v2/sync/push`
 *   handler de-duplicates on `(user_id, idempotency_key)` so an
 *   accidental re-order would be safe, but stable ordering keeps
 *   developer-tools readouts and Sentry breadcrumbs predictable.
 * - {@link DrainSyncOpOutboxOptions.limit} caps the batch size. The
 *   helper does NOT page: callers that need more rows call again
 *   after acking the current batch (the just-pushed rows leave the
 *   `'pending'` set, so the next drain sees the next slice). A
 *   non-positive `limit` returns `[]` immediately without touching
 *   the database.
 *
 * Mutation contract:
 *
 * - **Read-only.** No `UPDATE`, no `DELETE`, no transaction. The
 *   sync-engine writer is responsible for advancing the row's
 *   lifecycle (success → `DELETE`, transient failure → `planRetry`
 *   from `./syncOpRetry.ts`, terminal reject → `status='rejected'`).
 *   Keeping the reader pure means concurrent calls (e.g. a watchdog
 *   tick + a manual "force sync" button) cannot corrupt each other —
 *   they just observe the same rows.
 * - JSON parse: the helper parses `row` from TEXT into a
 *   `Readonly<Record<string, unknown>>`. A row with an unparseable
 *   `row` is **fatal** — it is a schema-invariant violation (only
 *   `enqueueOutboxIncrement` and the dual-write adapters write into
 *   this column, both `JSON.stringify`-encode their input). The
 *   helper throws with the offending `id` so the caller can
 *   dead-letter the row out of band rather than silently skipping a
 *   blocker. This mirrors the "loud failures" stance from PR #040 /
 *   PR #042d-builder.
 *
 * Schema compatibility:
 *
 * - Returned `op` is narrowed to {@link SyncOpOutboxOp} —
 *   `'insert' | 'update' | 'delete' | 'increment'`. Any value outside
 *   the tuple means a future migration relaxed the CHECK without
 *   updating this reader; the helper throws so callers cannot
 *   silently push an envelope the server-side engine will reject as
 *   `op_not_supported` (PR #042a engine-gate).
 *
 * The helper is small on purpose — it is the second of three
 * client-side push-loop primitives the storage roadmap calls out
 * (enqueue → drain → push), and the writer-loop wiring lives in
 * full-scope PR #042e.
 */

export interface DrainSyncOpOutboxOptions {
  /**
   * Maximum number of rows to return. Non-positive values short-
   * circuit to `[]` without hitting the database. Typical production
   * value is `100` (matches the server's per-push payload cap from
   * PR #021 zod schema); tests pin it lower to assert ordering.
   */
  readonly limit: number;
  /**
   * Wall-clock time used to filter `next_retry_at`. Pass a `Date`
   * explicitly so this function stays pure / deterministic in tests;
   * production callers pass `new Date()`.
   */
  readonly now: Date;
  /**
   * Optional sink invoked once per poison row encountered while
   * decoding the drain batch (T3 audit HIGH#3 — poison-row
   * quarantine). Production wiring: forward to `addBreadcrumb` /
   * `captureException` so SRE has Sentry visibility on every
   * quarantine event; tests assert the call shape.
   *
   * Invoked AFTER the row has been UPDATE-d to `status='quarantined'`
   * with the populated `reject_reason`, so the callback is purely
   * observational. If the callback itself throws, drainSyncOpOutbox
   * lets the throw propagate — a misbehaving callback should not
   * silently swallow.
   */
  readonly onQuarantine?: (event: OutboxQuarantineEvent) => void;
}

/**
 * Diagnostic event handed to {@link DrainSyncOpOutboxOptions.onQuarantine}
 * for each row that was moved to `status='quarantined'` because
 * decoding failed inside the drain batch. The `reason` matches the
 * `reject_reason` column that was just written, so callers can
 * synthesize a one-liner Sentry message without re-querying SQLite.
 */
export interface OutboxQuarantineEvent {
  readonly id: number;
  readonly tableName: string;
  readonly op: string;
  readonly reason: string;
}

export interface DrainedOutboxRow {
  /** `sync_op_outbox.id` — primary key, monotonically increasing. */
  readonly id: number;
  /** `sync_op_outbox.table_name`, renamed for symmetry with helper inputs. */
  readonly table: string;
  /**
   * `sync_op_outbox.op`. Always one of {@link SYNC_OP_OUTBOX_OPS}; an
   * out-of-tuple literal in the database means a CHECK relaxation
   * landed without updating this reader, and the helper throws on
   * the offending row.
   */
  readonly op: SyncOpOutboxOp;
  /**
   * `sync_op_outbox.row` after `JSON.parse`. Returned as
   * `Record<string, unknown>` because the per-table payload shape is
   * the caller's concern (server-side engine validates per
   * `OP_LOG_TABLE_REGISTRY`). Helper does NOT canonicalise / sort
   * keys — the round-trip pin in
   * `sqlite-syncOpOutboxEnqueue.test.ts` keeps callers honest.
   */
  readonly row: Readonly<Record<string, unknown>>;
  /** `sync_op_outbox.client_ts` (ISO-8601, written verbatim on enqueue). */
  readonly clientTs: string;
  /** `sync_op_outbox.idempotency_key` — server-side dedup key. */
  readonly idempotencyKey: string;
  /** Current attempt counter. `0` for fresh enqueues. */
  readonly attempts: number;
  /**
   * `sync_op_outbox.next_retry_at`. `null` when the row was just
   * enqueued or after a successful drain that the engine reset (the
   * latter does not happen today; included for shape stability).
   */
  readonly nextRetryAt: string | null;
  /** Last engine-reported failure reason; `null` for fresh enqueues. */
  readonly lastError: string | null;
  /** Schema-default `created_at` (server-style ISO-8601, no offset). */
  readonly createdAt: string;
}

interface OutboxRowFromDb extends Record<string, unknown> {
  id: number;
  table_name: string;
  op: string;
  row: string;
  client_ts: string;
  idempotency_key: string;
  attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
}

const SUPPORTED_OPS: ReadonlySet<string> = new Set(SYNC_OP_OUTBOX_OPS);

/**
 * Read pending, due ops from `sync_op_outbox` in insertion order.
 *
 * Returns the subset of rows that decoded cleanly. Rows that fail
 * to decode (T3 audit HIGH#3 — "poison rows": unparseable JSON,
 * non-object payload, or `op` outside the supported tuple) are
 * UPDATE-d in place to `status='quarantined'` with a populated
 * `reject_reason`, so the next drain tick advances past them
 * instead of head-of-line blocking the entire writer-runtime.
 *
 * Returns an empty array when nothing is due, when `limit <= 0`, or
 * when the table is empty.
 *
 * The per-row quarantine UPDATE is best-effort: a failure to write
 * the status (e.g. the SQLite client is in a read-only transient
 * state) is caught and logged via {@link DrainSyncOpOutboxOptions.onQuarantine}
 * with `reason='quarantine_failed:<message>'` so the next tick can
 * try again. The decoded-clean rows are still returned regardless.
 */
export async function drainSyncOpOutbox(
  client: SqliteMigrationClient,
  options: DrainSyncOpOutboxOptions,
): Promise<DrainedOutboxRow[]> {
  const { limit, now, onQuarantine } = options;
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }
  const cap = Math.floor(limit);
  const nowIso = now.toISOString();

  const rows = await client.all<OutboxRowFromDb>(
    `SELECT id, table_name, op, row, client_ts, idempotency_key,
            attempts, next_retry_at, last_error, created_at
       FROM sync_op_outbox
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY id ASC
      LIMIT ?`,
    [nowIso, cap],
  );

  const decoded: DrainedOutboxRow[] = [];
  for (const raw of rows) {
    const result = tryParseDrainedRow(raw);
    if (result.kind === "ok") {
      decoded.push(result.row);
      continue;
    }
    // Poison row — move it to 'quarantined' so the next tick skips
    // it. The UPDATE is best-effort; if it fails we still report the
    // quarantine event so the runtime can breadcrumb / alert.
    let quarantineReason = result.reason;
    try {
      await client.run(
        `UPDATE sync_op_outbox
            SET status = 'quarantined',
                reject_reason = ?
          WHERE id = ?`,
        [result.reason, raw.id],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      quarantineReason = `quarantine_failed:${message}`;
    }
    if (onQuarantine) {
      onQuarantine({
        id: raw.id,
        tableName: raw.table_name,
        op: raw.op,
        reason: quarantineReason,
      });
    }
  }
  return decoded;
}

type ParseResult =
  | { kind: "ok"; row: DrainedOutboxRow }
  | { kind: "poison"; reason: string };

function tryParseDrainedRow(raw: OutboxRowFromDb): ParseResult {
  if (!SUPPORTED_OPS.has(raw.op)) {
    return {
      kind: "poison",
      reason: `unsupported_op:${raw.op}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "poison",
      reason: `parse_failed:${message}`,
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const shape =
      parsed === null
        ? "null"
        : Array.isArray(parsed)
          ? "array"
          : typeof parsed;
    return {
      kind: "poison",
      reason: `non_object_payload:${shape}`,
    };
  }
  return {
    kind: "ok",
    row: {
      id: raw.id,
      table: raw.table_name,
      op: raw.op as SyncOpOutboxOp,
      row: parsed as Readonly<Record<string, unknown>>,
      clientTs: raw.client_ts,
      idempotencyKey: raw.idempotency_key,
      attempts: raw.attempts,
      nextRetryAt: raw.next_retry_at,
      lastError: raw.last_error,
      createdAt: raw.created_at,
    },
  };
}
