import type {
  SyncV2Endpoints,
  SyncV2OpResult,
  SyncV2PullOp,
  SyncV2PushOp,
} from "@sergeant/api-client";

import {
  applyPulledRoutineEntry,
  applyPulledRoutineStreak,
  enqueueOutboxOp,
  getPullSince,
  listPendingOutboxOps,
  rejectOutboxOp,
  removeOutboxOp,
  setPullSince,
  softDeleteRoutineEntry,
  upsertRoutineEntry,
  type EnqueueOutboxInput,
  type SpikeSqliteClient,
} from "./repo.js";
import { newIdempotencyKey } from "./idempotencyKey.js";

/**
 * Routine SPIKE sync engine.
 *
 * Responsibilities:
 *
 *  1. **Push** — drain the local outbox in FIFO order to /v2/sync/push,
 *     remove `applied` / `duplicate` rows, mark `rejected` rows for
 *     human triage. Caps each batch at the server's
 *     `SYNC_V2_MAX_OPS_PER_PUSH = 200`.
 *  2. **Pull** — fetch ops from /v2/sync/pull?since=<cursor> and apply
 *     them via the per-table apply paths in `repo.ts`. Persists the
 *     cursor after each successful batch.
 *  3. **Mutation helpers** — high-level "toggle a habit completion" /
 *     "delete a habit completion" that combine the row write with the
 *     outbox enqueue. Stage 5 will replace this with crash-safe
 *     transactions; SPIKE accepts the small race window.
 *
 * Design choices:
 *
 *  - `originDeviceId` is opt-in. When present it goes on every push
 *    and pull request via the `X-Origin-Device-Id` header so the
 *    server can suppress same-device echoes during pull (see
 *    `apps/server/src/modules/sync/syncV2.ts`).
 *  - The engine takes the api-client {@link SyncV2Endpoints} object
 *    directly instead of building it itself — that lets tests pass a
 *    mocked endpoint pair without touching real HTTP, and lets the
 *    web/mobile call sites reuse whatever client they already have.
 *  - Errors during push or pull leave the state intact so the next
 *    invocation retries from the same cursor / outbox tail.
 */

const ROUTINE_ENTRIES_TABLE = "routine_entries";
const ROUTINE_STREAKS_TABLE = "routine_streaks";

export interface SyncEngineOptions {
  /** Optional `X-Origin-Device-Id` so pulls skip our own pushed ops. */
  readonly originDeviceId?: string;
  /** Caps per push batch. Server max is 200; default 100 is friendly. */
  readonly pushBatchSize?: number;
  /** Caps per pull page. Server max is 500; default 100. */
  readonly pullPageSize?: number;
}

export interface PushResult {
  attempted: number;
  applied: number;
  duplicates: number;
  rejected: number;
  /** Highest server `last_op_id` seen — useful as a `pull?since` hint. */
  lastOpId: number | null;
}

export interface PullResult {
  applied: number;
  conflicts: number;
  /** Final cursor after the loop; null if no ops were fetched. */
  cursor: number | null;
}

/**
 * Drain the outbox in FIFO order. One push per call (no recursion) —
 * the caller decides cadence (timer, app-foregrounded event, etc.).
 *
 * Returns counters so callers can decide whether to schedule the next
 * push immediately (more pending) or back off (everything quiet).
 */
export async function pushPendingOutbox(
  client: SpikeSqliteClient,
  endpoints: Pick<SyncV2Endpoints, "pushV2">,
  opts: SyncEngineOptions = {},
): Promise<PushResult> {
  const batchSize = opts.pushBatchSize ?? 100;
  const pending = await listPendingOutboxOps(client, batchSize);
  if (pending.length === 0) {
    return {
      attempted: 0,
      applied: 0,
      duplicates: 0,
      rejected: 0,
      lastOpId: null,
    };
  }

  const ops: SyncV2PushOp[] = pending.map((row) => ({
    table: row.tableName,
    op: row.op,
    row: parseRowSafe(row.row),
    client_ts: row.clientTs,
    idempotency_key: row.idempotencyKey,
  }));

  const response = await endpoints.pushV2(ops, {
    originDeviceId: opts.originDeviceId,
  });

  let applied = 0;
  let duplicates = 0;
  let rejected = 0;
  for (const result of response.results) {
    if (result.status === "applied") {
      await removeOutboxOp(client, result.idempotency_key);
      applied++;
    } else if (result.status === "duplicate") {
      // Server has already applied the same idempotency key. Drop the
      // local outbox row — the world has already converged.
      await removeOutboxOp(client, result.idempotency_key);
      duplicates++;
    } else {
      // "rejected" — keep the row, mark with reason for triage. SPIKE
      // does NOT auto-retry; PR #040 introduces back-off.
      await rejectOutboxOp(
        client,
        result.idempotency_key,
        result.reason ?? "rejected",
      );
      rejected++;
    }
  }
  return {
    attempted: pending.length,
    applied,
    duplicates,
    rejected,
    lastOpId: response.last_op_id,
  };
}

/**
 * Pull from /v2/sync/pull starting from the persisted cursor and
 * apply each op via the `applyPulled*` repo helpers. Loops until the
 * server returns an empty page, persisting the cursor after every
 * successful batch so a crash mid-pull does not re-apply ops on
 * restart.
 */
export async function pullSince(
  client: SpikeSqliteClient,
  endpoints: Pick<SyncV2Endpoints, "pullV2">,
  opts: SyncEngineOptions = {},
): Promise<PullResult> {
  const pageSize = opts.pullPageSize ?? 100;
  let cursor = await getPullSince(client);
  let applied = 0;
  let conflicts = 0;

  // Bound the loop defensively. SPIKE's server caps at 500 per page;
  // 50 pages = 25k ops in a single sync — well above expected cold
  // starts.
  for (let page = 0; page < 50; page++) {
    const res = await endpoints.pullV2(cursor, {
      limit: pageSize,
      originDeviceId: opts.originDeviceId,
    });
    if (res.ops.length === 0) {
      return { applied, conflicts, cursor: cursor === 0 ? null : cursor };
    }

    for (const op of res.ops) {
      const outcome = await applyOneOp(client, op);
      if (outcome === "applied") applied++;
      else if (outcome === "lww_conflict") conflicts++;
    }

    if (res.next_cursor != null) {
      cursor = res.next_cursor;
    } else {
      cursor = Math.max(cursor, res.ops[res.ops.length - 1]!.id);
    }
    await setPullSince(client, cursor, res.ops[res.ops.length - 1]!.server_ts);

    if (res.next_cursor == null) {
      return { applied, conflicts, cursor };
    }
  }
  return { applied, conflicts, cursor };
}

async function applyOneOp(
  client: SpikeSqliteClient,
  op: SyncV2PullOp,
): Promise<"applied" | "lww_conflict" | "missing_id"> {
  if (op.table === ROUTINE_ENTRIES_TABLE) {
    return applyPulledRoutineEntry(client, {
      op: op.op,
      row: op.row,
      clientTs: op.client_ts,
    });
  }
  if (op.table === ROUTINE_STREAKS_TABLE) {
    return applyPulledRoutineStreak(client, {
      op: op.op,
      row: op.row,
      clientTs: op.client_ts,
    });
  }
  // Unknown table — server should never send these to a SPIKE client,
  // but if it does we treat it as a conflict so the cursor still
  // advances.
  return "lww_conflict";
}

// ───────────────────────── high-level mutations ─────────────────────────

/**
 * High-level "log a habit completion" mutation: writes the routine
 * entry to local SQLite and enqueues an `insert` op on the outbox.
 * Caller decides when to flush via {@link pushPendingOutbox}.
 *
 * The two writes are NOT in a single transaction — see SPIKE-only
 * note in `repo.ts`. Stage 5 PR #040 hardens this.
 */
export async function recordRoutineCompletion(
  client: SpikeSqliteClient,
  args: {
    id: string;
    userId: string;
    name: string;
    completedAt: string;
    clientTs: string;
  },
): Promise<{ idempotencyKey: string }> {
  await upsertRoutineEntry(client, {
    id: args.id,
    userId: args.userId,
    name: args.name,
    completedAt: args.completedAt,
    createdAt: args.clientTs,
    updatedAt: args.clientTs,
  });

  const wireRow = {
    id: args.id,
    user_id: args.userId,
    name: args.name,
    completed_at: args.completedAt,
    created_at: args.clientTs,
    updated_at: args.clientTs,
    deleted_at: null,
  };
  const enqueue: EnqueueOutboxInput = {
    tableName: ROUTINE_ENTRIES_TABLE,
    op: "insert",
    row: wireRow,
    clientTs: args.clientTs,
    idempotencyKey: newIdempotencyKey(),
  };
  await enqueueOutboxOp(client, enqueue);
  return { idempotencyKey: enqueue.idempotencyKey };
}

/**
 * High-level "undo a completion" mutation: tombstones the local row
 * and enqueues a `delete` op. Returns the idempotency key for tests
 * that want to assert on outbox contents.
 */
export async function deleteRoutineCompletion(
  client: SpikeSqliteClient,
  args: {
    id: string;
    userId: string;
    clientTs: string;
  },
): Promise<{ idempotencyKey: string }> {
  await softDeleteRoutineEntry(client, {
    id: args.id,
    userId: args.userId,
    clientTs: args.clientTs,
  });

  const enqueue: EnqueueOutboxInput = {
    tableName: ROUTINE_ENTRIES_TABLE,
    op: "delete",
    row: { id: args.id, user_id: args.userId },
    clientTs: args.clientTs,
    idempotencyKey: newIdempotencyKey(),
  };
  await enqueueOutboxOp(client, enqueue);
  return { idempotencyKey: enqueue.idempotencyKey };
}

function parseRowSafe(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { __invalid: true, raw: json };
  } catch {
    return { __invalid: true, raw: json };
  }
}

/** Helper for tests / callers wanting to inspect a sync push result. */
export function summarizePushResults(results: SyncV2OpResult[]): PushResult {
  let applied = 0;
  let duplicates = 0;
  let rejected = 0;
  for (const r of results) {
    if (r.status === "applied") applied++;
    else if (r.status === "duplicate") duplicates++;
    else rejected++;
  }
  return {
    attempted: results.length,
    applied,
    duplicates,
    rejected,
    lastOpId: null,
  };
}
