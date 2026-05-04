import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  applyFinykDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter.js";
import {
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type FinykDualWriteState,
} from "./diff.js";

/**
 * Orchestrator for the Finyk dual-write layer.
 *
 * Stage 4 PR #036 of `docs/planning/storage-roadmap.md`. Mirrors the
 * nutrition dual-write orchestrator pattern from PR #032.
 *
 * Glues together:
 *
 *  - the **gating** check (`feature.finyk.sqlite_v2.dual_write` flag,
 *    default off);
 *  - the **identity** resolver (`getUserId()`);
 *  - the **SQLite** resolver (`getMigrationClient()`);
 *  - and the **adapter** (`applyFinykDualWriteOps`).
 *
 * Registration pattern: the hooks that write to localStorage sit below
 * the auth + sqlite singletons in the dependency graph. Pulling those
 * in directly creates a cycle. The registration pattern lets the boot
 * wiring file install the dependencies once.
 *
 * Best-effort guarantees:
 *
 *  - The orchestrator's promise NEVER rejects.
 *  - When the flag is off, no resolver is called and no diff is
 *    computed (zero per-write overhead).
 *  - When `getUserId()` or `getMigrationClient()` return null the
 *    call is a no-op.
 */

export interface FinykDualWriteContext {
  isEnabled(): boolean;
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
}

/**
 * Returns `true` while a context is currently registered. Used by
 * the LS write layer to decide whether to read the previous state.
 */
export function isFinykDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Run the dual-write pipeline for a `prev → next` LS-state transition.
 *
 * The function is `async` but the LS-write call site fires it
 * fire-and-forget through {@link triggerFinykDualWrite}.
 */
export async function dualWriteFinykState(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };
  if (!ctx.isEnabled()) return { status: "skipped", reason: "flag-off" };

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
    clientTs: ctx.getNow(),
    logger: ctx.logger,
  });
  return { status: "applied", result };
}

/**
 * Fire-and-forget entry point used by Finyk LS-write hooks.
 * Resolves immediately so the LS-write call site doesn't pay any
 * latency on the happy path.
 */
export function triggerFinykDualWrite(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): void {
  if (!registeredContext) return;
  void Promise.resolve().then(() => dualWriteFinykState(prev, next));
}

export type DualWriteOutcome =
  | { status: "applied"; result: ApplyDualWriteResult }
  | {
      status: "skipped";
      reason:
        | "context-unset"
        | "flag-off"
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
    else if (level === "warn") console.warn(`[finyk.dualWrite] ${msg}`, meta);
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
