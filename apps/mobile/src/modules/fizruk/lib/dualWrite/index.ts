import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  recordDualWriteOutcome,
  recordParityCheck,
  recordReadFallback,
} from "../../../../lib/observability/dualWriteTelemetry";
import {
  applyFizrukDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter";
import { diffFizrukDualWriteOps, type FizrukDualWriteState } from "./diff";
import { probeFizrukParity } from "./parity";

/**
 * Orchestrator for the Fizruk dual-write layer (mobile mirror of
 * `apps/web/src/modules/fizruk/lib/dualWrite/index.ts`).
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. The MMKV
 * write layer fires `triggerFizrukDualWrite(prev, next)` after every
 * successful MMKV write; this module decides whether to mirror to the
 * local expo-sqlite database based on the registered context.
 *
 * **Stage 12 / PR #070f-mobile-dualwrite** — wires the orchestrator
 * to the shared dual-write telemetry sink (`recordDualWriteOutcome`,
 * `recordParityCheck`, `recordReadFallback`) and runs the
 * `probeFizrukParity` best-effort check after every successful apply.
 * Mirrors the mobile Routine orchestrator (Stage 10) so all four
 * dual-write modules emit the same Sentry breadcrumb shape.
 *
 * Decoupling: see the web copy for the rationale (avoids cycles
 * between MMKV layer ↔ auth ↔ sqlite singleton, keeps tests independent).
 */

export interface FizrukDualWriteContext {
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: FizrukDualWriteContext | null = null;

export function registerFizrukDualWriteContext(
  ctx: FizrukDualWriteContext,
): () => void {
  registeredContext = ctx;
  return () => {
    if (registeredContext === ctx) registeredContext = null;
  };
}

export function __clearFizrukDualWriteContextForTests(): void {
  registeredContext = null;
}

export function isFizrukDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Run the dual-write pipeline for a `prev → next` MMKV-state transition.
 *
 * Every call records its terminal outcome through
 * `recordDualWriteOutcome("fizruk", …)` so the Stage 8 decision-gate
 * counters stay current on mobile Sentry breadcrumbs.
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

  // Stage 12 / PR #070f-mobile-dualwrite — best-effort parity probe
  // mirrors the mobile Routine orchestrator. A failed probe-read is
  // tagged distinctly (`recordReadFallback`) so triage can tell
  // `SELECT failing` apart from a real MMKV↔SQLite divergence
  // (`recordParityCheck("…", "mismatch", …)`).
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

export {
  applyFizrukDualWriteOps,
  diffFizrukDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type FizrukDualWriteState,
};
