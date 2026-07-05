import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger as webLogger } from "@shared/lib";

import {
  recordDualWriteOutcome,
  recordParityCheck,
  recordReadFallback,
} from "../../../../core/observability/dualWriteTelemetry.js";
import { refreshFinykSqliteState } from "../sqliteReader.js";
import {
  __closeFinykSqliteMutationWindow,
  __openFinykSqliteMutationWindow,
  notifyFinykSqliteCacheRefresh,
} from "../sqliteReadGate.js";
import {
  applyFinykDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter.js";
import {
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type FinykDualWriteOp,
  type FinykDualWriteState,
} from "./diff.js";
import { probeFinykParity } from "./parity.js";

/**
 * Orchestrator for the Finyk dual-write layer.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Mirrors the
 * nutrition dual-write orchestrator pattern from PR #032.
 *
 * Glues together:
 *
 *  - the **identity** resolver (`getUserId()`);
 *  - the **SQLite** resolver (`getMigrationClient()`);
 *  - and the **adapter** (`applyFinykDualWriteOps`).
 *
 * Registration pattern: the hooks that write to localStorage sit below
 * the auth + sqlite singletons in the dependency graph. Pulling those
 * in directly creates a cycle. The registration pattern lets the boot
 * wiring file install the dependencies once.
 *
 * Stage 8 PR #056k dropped the `feature.finyk.sqlite_v2.dual_write`
 * gate — the SQLite mirror now fires unconditionally whenever a
 * context is registered. LS/MMKV-write remains source-of-truth until
 * PR #057k.
 *
 * Best-effort guarantees:
 *
 *  - The orchestrator's promise NEVER rejects.
 *  - When `getUserId()` or `getMigrationClient()` return null the
 *    call is a no-op.
 */

export interface FinykDualWriteContext {
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: FinykDualWriteContext | null = null;

/**
 * Install the dual-write context. Call from the platform bootstrap
 * file when the React Query client and sqlite singletons are available.
 *
 * Returns a teardown function that clears the registration.
 */
export function registerFinykDualWriteContext(
  ctx: FinykDualWriteContext,
): () => void {
  registeredContext = ctx;
  return () => {
    if (registeredContext === ctx) registeredContext = null;
  };
}

/** Test-only escape hatch — clears any registered context. */
export function __clearFinykDualWriteContextForTests(): void {
  registeredContext = null;
  lastIssuedClientTs = null;
}

// DCRUD-108 — last clientTs handed to ANY Finyk dual-write apply, across
// both the single-flight queue below (`triggerFinykDualWrite`) and the
// off-React mirror path (`applyFinykDualWriteOpsViaContext`). `ctx.getNow()`
// is `Date.now()`-resolution (millisecond); a create immediately followed
// by an edit to the SAME row can legitimately dequeue two flushes whose
// `getNow()` calls land in the identical millisecond — more so on CI's
// coarser system-timer resolution than on a dev machine. The adapter's LWW
// guard is strictly-greater-than by design (`WHERE excluded.updated_at >
// table.updated_at` — see adapter.ts; never weaken to `>=`, that would
// blur real concurrent-write detection), so an EQUAL clientTs silently
// no-ops the second write and the edit never reaches the local SQLite
// mirror (root cause of the finyk deep-CRUD E2E regression — the edit is
// visible in React state but lost from the SQLite row the post-reload
// overlay reads). `nextMonotonicClientTs` guarantees every apply gets a
// strictly-increasing clientTs regardless of wall-clock resolution,
// without touching the guard itself.
let lastIssuedClientTs: string | null = null;

function nextMonotonicClientTs(
  ctx: Pick<FinykDualWriteContext, "getNow">,
): string {
  const now = ctx.getNow();
  const nowMs = Date.parse(now);
  const lastMs =
    lastIssuedClientTs === null ? NaN : Date.parse(lastIssuedClientTs);
  if (!Number.isNaN(lastMs) && !Number.isNaN(nowMs) && nowMs <= lastMs) {
    const bumped = new Date(lastMs + 1).toISOString();
    lastIssuedClientTs = bumped;
    return bumped;
  }
  lastIssuedClientTs = now;
  return now;
}

/**
 * Returns `true` while a context is currently registered. Used by
 * the LS write layer to decide whether to read the previous state.
 */
export function isFinykDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Non-hook accessor for the registered context's identity + SQLite
 * resolver. Returns `null` when no context is registered or the user
 * id is unavailable.
 *
 * Used by the chat-action dual-write bridge
 * (`core/lib/chatActions/finykActions/dualWriteBridge.ts`), which runs
 * synchronously outside React and therefore cannot read `useAuth()` or
 * the React Query `me` cache. The registered context's `getUserId()` is
 * the canonical source of the real Better-Auth id the `finyk_*` tables
 * key on (NOT the sanitised SQLite partition key in `core/db/sqlite`).
 */
export function getFinykDualWriteRuntime(): {
  readonly userId: string;
  readonly getMigrationClient: () => Promise<SqliteMigrationClient | null>;
  readonly getNow: () => string;
} | null {
  const ctx = registeredContext;
  if (!ctx) return null;
  const userId = ctx.getUserId();
  if (!userId) return null;
  return {
    userId,
    getMigrationClient: ctx.getMigrationClient,
    getNow: ctx.getNow,
  };
}

/**
 * Run the dual-write pipeline for a `prev → next` LS-state transition.
 *
 * The function is `async` but the LS-write call site fires it
 * fire-and-forget through {@link triggerFinykDualWrite}.
 *
 * Every call records its terminal outcome through
 * `recordDualWriteOutcome("finyk", …)` so the Stage 8 decision-gate
 * tags stay current on the global Sentry scope — see
 * `apps/web/src/core/observability/dualWriteTelemetry.ts`.
 */
export async function dualWriteFinykState(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): Promise<DualWriteOutcome> {
  const outcome = await runDualWriteFinykState(prev, next);
  recordDualWriteOutcome("finyk", outcome);
  return outcome;
}

async function runDualWriteFinykState(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };

  const ops = diffFinykDualWriteOps(prev, next);
  if (ops.length === 0) return { status: "skipped", reason: "no-ops" };

  const userId = ctx.getUserId();
  if (!userId) {
    logSafe(ctx, "warn", "dual-write skipped: user id unavailable", {
      ops: ops.length,
    });
    return { status: "skipped", reason: "user-id-missing" };
  }

  let client: SqliteMigrationClient | null = null;
  try {
    client = await ctx.getMigrationClient();
  } catch (err) {
    logSafe(ctx, "warn", "dual-write skipped: sqlite unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "skipped", reason: "sqlite-unavailable" };
  }
  if (!client) {
    logSafe(ctx, "warn", "dual-write skipped: sqlite returned null", {});
    return { status: "skipped", reason: "sqlite-unavailable" };
  }

  const result = await applyFinykDualWriteOps(client, ops, {
    userId,
    clientTs: nextMonotonicClientTs(ctx),
    logger: ctx.logger,
  });

  try {
    await refreshFinykSqliteState(client, userId);
    notifyFinykSqliteCacheRefresh();
  } catch (err) {
    recordReadFallback(
      "finyk",
      err instanceof Error
        ? `cache-refresh-failed: ${err.message}`
        : "cache-refresh-failed",
    );
  }

  // Stage 8 parity probe — best-effort: never throws, never disturbs
  // the dual-write outcome. A failed probe-read is tagged distinctly
  // (`recordReadFallback`) so triage can tell `SELECT failing` apart
  // from a real LS↔SQLite divergence (`recordParityCheck("…",
  // "mismatch", …)`).
  try {
    const parity = await probeFinykParity(client, userId, next);
    recordParityCheck("finyk", parity.result, parity.details);
  } catch (err) {
    recordReadFallback(
      "finyk",
      err instanceof Error
        ? `parity-probe-failed: ${err.message}`
        : "parity-probe-failed",
    );
  }

  return { status: "applied", result };
}

// DCRUD-007 single-flight queue: concurrent fire-and-forget dual-writes
// used to interleave apply → refresh → notify, so a refresh whose
// snapshot predated a newer local mutation could be the LAST notify —
// and the read overlay would clobber the fresh UI state with the stale
// cache (which then escalated to a spurious blob-delete through the
// diff-writer). Serializing the pipeline + exposing the pending count
// lets the overlay skip replacements while writes are in flight.
let dualWriteQueue: Promise<unknown> = Promise.resolve();

/**
 * Fire-and-forget entry point used by Finyk LS-write hooks.
 * Resolves immediately so the LS-write call site doesn't pay any
 * latency on the happy path. Runs are serialized (single-flight) in
 * enqueue order; the final run of a burst re-notifies subscribers so
 * the overlay applies exactly one causally-latest snapshot.
 */
export function triggerFinykDualWrite(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): void {
  const ctx = registeredContext;
  if (!ctx) return;
  __openFinykSqliteMutationWindow();
  dualWriteQueue = dualWriteQueue
    .then(() => new Promise((resolve) => globalThis.setTimeout(resolve, 0)))
    .then(() => dualWriteFinykState(prev, next))
    .catch((err) => {
      logSafe(ctx, "warn", "dual-write task failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .then(() => {
      __closeFinykSqliteMutationWindow();
      // No-op while later writes are still queued (their windows are
      // open); the last write of a burst delivers the visible refresh.
      notifyFinykSqliteCacheRefresh();
    });
}

/**
 * Apply a pre-built op list through the registered context, SKIPPING
 * the `prev → next` diff and the Stage 8 parity probe that
 * {@link dualWriteFinykState} runs.
 *
 * Off-React callers (Hub chat-action executors) mutate a single entity
 * and have no full LS-state snapshot to diff. Routing them through
 * `dualWriteFinykState(EMPTY, next)` would diff against an empty state
 * (re-emitting every row) and the parity probe would compare a partial
 * `next` against the full SQLite table and falsely report a mismatch.
 * This entry point hands the ops straight to the adapter instead.
 *
 * Best-effort: never rejects; a missing context / user id / sqlite
 * client is a no-op. Records the terminal outcome on the shared Sentry
 * scope like the orchestrator does.
 */
export async function applyFinykDualWriteOpsViaContext(
  ops: readonly FinykDualWriteOp[],
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };
  if (ops.length === 0) return { status: "skipped", reason: "no-ops" };

  const userId = ctx.getUserId();
  if (!userId) {
    logSafe(ctx, "warn", "dual-write skipped: user id unavailable", {
      ops: ops.length,
    });
    return { status: "skipped", reason: "user-id-missing" };
  }

  let client: SqliteMigrationClient | null = null;
  try {
    client = await ctx.getMigrationClient();
  } catch (err) {
    logSafe(ctx, "warn", "dual-write skipped: sqlite unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "skipped", reason: "sqlite-unavailable" };
  }
  if (!client) {
    logSafe(ctx, "warn", "dual-write skipped: sqlite returned null", {});
    return { status: "skipped", reason: "sqlite-unavailable" };
  }

  const result = await applyFinykDualWriteOps(client, ops, {
    userId,
    clientTs: nextMonotonicClientTs(ctx),
    logger: ctx.logger,
  });
  const outcome: DualWriteOutcome = { status: "applied", result };
  recordDualWriteOutcome("finyk", outcome);
  return outcome;
}

/** Shape of a manual-expense entry as persisted in the LS bundle (грн). */
export interface ManualExpenseMirrorEntry {
  readonly id: string;
  readonly date?: string;
  readonly description?: string;
  /** Amount in **гривні** (minor-unit ×100 is server-only — Hard Rule #1). */
  readonly amount: number;
  readonly category?: string;
  readonly type?: string;
  readonly [extra: string]: unknown;
}

/**
 * Fire-and-forget: mirror a manual-expense create/update into the
 * `finyk_manual_expenses` SQLite table (blob-upsert). The blob is the
 * verbatim LS shape — amount stays in **гривні**, matching what the
 * finyk module's own dual-write extractor writes for the same key.
 */
export function triggerManualExpenseSqliteMirror(
  expense: ManualExpenseMirrorEntry,
): void {
  if (!registeredContext || !expense?.id) return;
  const op: FinykDualWriteOp = {
    kind: "blob-upsert",
    table: "finyk_manual_expenses",
    entry: { id: expense.id, dataJson: JSON.stringify(expense) },
  };
  void Promise.resolve().then(() => applyFinykDualWriteOpsViaContext([op]));
}

/**
 * Fire-and-forget: mirror a manual-expense removal (undo / delete tool)
 * into SQLite (blob soft-delete) so the off-React delete agrees with
 * the create mirror and the row stops showing up in the overlay read.
 */
export function triggerManualExpenseDeleteSqliteMirror(id: string): void {
  if (!registeredContext || !id) return;
  const op: FinykDualWriteOp = {
    kind: "blob-delete",
    table: "finyk_manual_expenses",
    id,
  };
  void Promise.resolve().then(() => applyFinykDualWriteOpsViaContext([op]));
}

/**
 * Fire-and-forget: mirror per-tx category overrides (`finyk_tx_cats`)
 * into SQLite (`tx-category-upsert`). Sibling of
 * {@link triggerManualExpenseSqliteMirror} for the `change_category` /
 * `batch_categorize` tools.
 */
export function triggerTxCategorySqliteMirror(
  entries: ReadonlyArray<{ transactionId: string; categoryId: string }>,
): void {
  if (!registeredContext) return;
  const ops: FinykDualWriteOp[] = [];
  for (const e of entries) {
    if (!e.transactionId || !e.categoryId) continue;
    ops.push({
      kind: "tx-category-upsert",
      entry: { transactionId: e.transactionId, categoryId: e.categoryId },
    });
  }
  if (ops.length === 0) return;
  void Promise.resolve().then(() => applyFinykDualWriteOpsViaContext(ops));
}

/**
 * Fire-and-forget: mirror a hide-transaction into SQLite
 * (`id-upsert` on `finyk_hidden_transactions`) so the AI `hide` tool
 * agrees with the migrated hidden-tx read.
 */
export function triggerHiddenTransactionSqliteMirror(txId: string): void {
  if (!registeredContext || !txId) return;
  const op: FinykDualWriteOp = {
    kind: "id-upsert",
    table: "finyk_hidden_transactions",
    entry: { id: txId },
  };
  void Promise.resolve().then(() => applyFinykDualWriteOpsViaContext([op]));
}

export type DualWriteOutcome =
  | { status: "applied"; result: ApplyDualWriteResult }
  | {
      status: "skipped";
      reason:
        | "context-unset"
        | "no-ops"
        | "user-id-missing"
        | "sqlite-unavailable";
    };

function logSafe(
  ctx: FinykDualWriteContext,
  level: "warn" | "info",
  msg: string,
  meta: Record<string, unknown>,
): void {
  try {
    if (ctx.logger) ctx.logger(level, msg, meta);
    else if (level === "warn") webLogger.warn(`[finyk.dualWrite] ${msg}`, meta);
  } catch {
    /* noop — logging must never throw */
  }
}

export {
  applyFinykDualWriteOps,
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type FinykDualWriteState,
};
