import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  recordDualWriteOutcome,
  recordParityCheck,
  recordReadFallback,
} from "../../../../core/observability/dualWriteTelemetry.js";
import {
  applyFizrukDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter.js";
import { diffFizrukDualWriteOps, type FizrukDualWriteState } from "./diff.js";
import { probeFizrukParity } from "./parity.js";

/**
 * Orchestrator for the Fizruk dual-write layer.
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. Mirrors the
 * routine dual-write orchestrator pattern from PR #024.
 *
 * Glues together:
 *
 *  - the **gating** check (`feature.fizruk.sqlite_v2.dual_write`
 *    flag, default off);
 *  - the **identity** resolver (`getUserId()`);
 *  - the **SQLite** resolver (`getMigrationClient()`);
 *  - and the **adapter** (`applyFizrukDualWriteOps`).
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

export interface FizrukDualWriteContext {
  isEnabled(): boolean;
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: FizrukDualWriteContext | null = null;

/**
 * Install the dual-write context. Call from the platform bootstrap
 * file when the React Query client and sqlite singletons are available.
 *
 * Returns a teardown function that clears the registration.
 */
export function registerFizrukDualWriteContext(
  ctx: FizrukDualWriteContext,
): () => void {
  registeredContext = ctx;
  return () => {
    if (registeredContext === ctx) registeredContext = null;
  };
}

/** Test-only escape hatch — clears any registered context. */
export function __clearFizrukDualWriteContextForTests(): void {
  registeredContext = null;
}

/**
 * Returns `true` while a context is currently registered. Used by
 * the LS write layer to decide whether to read the previous state.
 */
export function isFizrukDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Run the dual-write pipeline for a `prev → next` LS-state transition.
 *
 * The function is `async` but the LS-write call site fires it
 * fire-and-forget through {@link triggerFizrukDualWrite}.
 *
 * Every call records its terminal outcome through
 * `recordDualWriteOutcome("fizruk", …)` so the Stage 8 decision-gate
 * tags stay current on the global Sentry scope — see
 * `apps/web/src/core/observability/dualWriteTelemetry.ts`.
 */
export async function dualWriteFizrukState(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
): Promise<DualWriteOutcome> {
  const outcome = await runDualWriteFizrukState(prev, next);
  recordDualWriteOutcome("fizruk", outcome);
  return outcome;
}

async function runDualWriteFizrukState(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };
  if (!ctx.isEnabled()) return { status: "skipped", reason: "flag-off" };

  const ops = diffFizrukDualWriteOps(prev, next);
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

  const result = await applyFizrukDualWriteOps(client, ops, {
    userId,
    clientTs: ctx.getNow(),
    logger: ctx.logger,
  });

  // Stage 8 parity probe — best-effort: never throws, never disturbs
  // the dual-write outcome. A failed probe-read is tagged distinctly
  // (`recordReadFallback`) so triage can tell `SELECT failing` apart
  // from a real LS↔SQLite divergence (`recordParityCheck("…",
  // "mismatch", …)`).
  try {
    const parity = await probeFizrukParity(client, userId, next);
    recordParityCheck("fizruk", parity.result, parity.details);
  } catch (err) {
    recordReadFallback(
      "fizruk",
      err instanceof Error
        ? `parity-probe-failed: ${err.message}`
        : "parity-probe-failed",
    );
  }

  return { status: "applied", result };
}

/**
 * Fire-and-forget entry point used by Fizruk LS-write hooks.
 * Resolves immediately so the LS-write call site doesn't pay any
 * latency on the happy path.
 */
export function triggerFizrukDualWrite(
  prev: FizrukDualWriteState,
  next: FizrukDualWriteState,
): void {
  if (!registeredContext) return;
  void Promise.resolve().then(() => dualWriteFizrukState(prev, next));
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
  ctx: FizrukDualWriteContext,
  level: "warn" | "info",
  msg: string,
  meta: Record<string, unknown>,
): void {
  try {
    if (ctx.logger) ctx.logger(level, msg, meta);
    else if (level === "warn") console.warn(`[fizruk.dualWrite] ${msg}`, meta);
  } catch {
    /* noop — logging must never throw */
  }
}

// Re-exports for callers that need the lower-level pieces (mostly tests).
export {
  applyFizrukDualWriteOps,
  diffFizrukDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type FizrukDualWriteState,
};
