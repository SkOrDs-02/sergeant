import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  recordDualWriteOutcome,
  recordParityCheck,
  recordReadFallback,
} from "../../../../core/observability/dualWriteTelemetry.js";
import {
  applyNutritionDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter.js";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
} from "./diff.js";
import { probeNutritionParity } from "./parity.js";

/**
 * Orchestrator for the Nutrition dual-write layer.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Mirrors the
 * fizruk dual-write orchestrator pattern from PR #028.
 *
 * Glues together:
 *
 *  - the **identity** resolver (`getUserId()`);
 *  - the **SQLite** resolver (`getMigrationClient()`);
 *  - and the **adapter** (`applyNutritionDualWriteOps`).
 *
 * Registration pattern: the hooks that write to localStorage sit below
 * the auth + sqlite singletons in the dependency graph. Pulling those
 * in directly creates a cycle. The registration pattern lets the boot
 * wiring file install the dependencies once. Stage 8 PR #056n dropped
 * the `feature.nutrition.sqlite_v2.dual_write` gate — the SQLite mirror
 * is now unconditional whenever a dual-write context is registered.
 *
 * Best-effort guarantees:
 *
 *  - The orchestrator's promise NEVER rejects.
 *  - When `getUserId()` or `getMigrationClient()` return null the
 *    call is a no-op.
 */

export interface NutritionDualWriteContext {
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: NutritionDualWriteContext | null = null;

/**
 * Install the dual-write context. Call from the platform bootstrap
 * file when the React Query client and sqlite singletons are available.
 *
 * Returns a teardown function that clears the registration.
 */
export function registerNutritionDualWriteContext(
  ctx: NutritionDualWriteContext,
): () => void {
  registeredContext = ctx;
  return () => {
    if (registeredContext === ctx) registeredContext = null;
  };
}

/** Test-only escape hatch — clears any registered context. */
export function __clearNutritionDualWriteContextForTests(): void {
  registeredContext = null;
}

/**
 * Returns `true` while a context is currently registered. Used by
 * the LS write layer to decide whether to read the previous state.
 */
export function isNutritionDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Run the dual-write pipeline for a `prev → next` LS-state transition.
 *
 * The function is `async` but the LS-write call site fires it
 * fire-and-forget through {@link triggerNutritionDualWrite}.
 *
 * Every call records its terminal outcome through
 * `recordDualWriteOutcome("nutrition", …)` so the Stage 8
 * decision-gate tags stay current on the global Sentry scope — see
 * `apps/web/src/core/observability/dualWriteTelemetry.ts`.
 */
export async function dualWriteNutritionState(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
): Promise<DualWriteOutcome> {
  const outcome = await runDualWriteNutritionState(prev, next);
  recordDualWriteOutcome("nutrition", outcome);
  return outcome;
}

async function runDualWriteNutritionState(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };

  const ops = diffNutritionDualWriteOps(prev, next);
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

  const result = await applyNutritionDualWriteOps(client, ops, {
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
    const parity = await probeNutritionParity(client, userId, next);
    recordParityCheck("nutrition", parity.result, parity.details);
  } catch (err) {
    recordReadFallback(
      "nutrition",
      err instanceof Error
        ? `parity-probe-failed: ${err.message}`
        : "parity-probe-failed",
    );
  }

  return { status: "applied", result };
}

/**
 * Fire-and-forget entry point used by Nutrition LS-write hooks.
 * Resolves immediately so the LS-write call site doesn't pay any
 * latency on the happy path.
 */
export function triggerNutritionDualWrite(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
): void {
  if (!registeredContext) return;
  void Promise.resolve().then(() => dualWriteNutritionState(prev, next));
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
  ctx: NutritionDualWriteContext,
  level: "warn" | "info",
  msg: string,
  meta: Record<string, unknown>,
): void {
  try {
    if (ctx.logger) ctx.logger(level, msg, meta);
    else if (level === "warn")
      console.warn(`[nutrition.dualWrite] ${msg}`, meta);
  } catch {
    /* noop — logging must never throw */
  }
}

// Re-exports for callers that need the lower-level pieces (mostly tests).
export {
  applyNutritionDualWriteOps,
  diffNutritionDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type NutritionDualWriteState,
};
