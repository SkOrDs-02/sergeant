import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  applyFizrukDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter";
import { diffFizrukDualWriteOps, type FizrukDualWriteState } from "./diff";

/**
 * Orchestrator for the Fizruk dual-write layer (mobile mirror of
 * `apps/web/src/modules/fizruk/lib/dualWrite/index.ts`).
 *
 * Stage 4 PR #028 of `docs/planning/storage-roadmap.md`. The MMKV
 * write layer fires `triggerFizrukDualWrite(prev, next)` after every
 * successful MMKV write; this module decides whether to mirror to the
 * local expo-sqlite database based on the registered context.
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

export async function dualWriteFizrukState(
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
