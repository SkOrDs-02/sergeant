import type { RoutineState } from "@sergeant/routine-domain";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  applyRoutineDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter";
import { diffRoutineDualWriteOps } from "./diff";

/**
 * Orchestrator for the routine dual-write layer (mobile mirror of
 * `apps/web/src/modules/routine/lib/dualWrite/index.ts`).
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. The MMKV
 * write layer (`apps/mobile/src/modules/routine/lib/routineStore.ts`)
 * fires `triggerRoutineDualWrite(prev, next)` after every successful
 * MMKV write; this module decides whether to mirror to the local
 * expo-sqlite database based on the registered context.
 *
 * Stage 8 PR #056r removed `isEnabled()` from the context — the
 * legacy `feature.routine.sqlite_v2.dual_write` flag was default-on
 * with no toggle path remaining. Registration is `userId`-gated only.
 * The MMKV write stays as the source-of-truth for non-completion
 * routine state (habits / tags / categories / prefs / pushups /
 * habitOrder / completionNotes) because the routine SQLite schema is
 * narrower (only `routine_entries` + `routine_streaks`).
 *
 * Decoupling: see the web copy for the rationale (avoids cycles
 * between LS layer ↔ auth ↔ sqlite singleton, keeps tests independent).
 */

export interface RoutineDualWriteContext {
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: RoutineDualWriteContext | null = null;

export function registerRoutineDualWriteContext(
  ctx: RoutineDualWriteContext,
): () => void {
  registeredContext = ctx;
  return () => {
    if (registeredContext === ctx) registeredContext = null;
  };
}

export function __clearRoutineDualWriteContextForTests(): void {
  registeredContext = null;
}

export function isRoutineDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

export async function dualWriteRoutineState(
  prev: RoutineState,
  next: RoutineState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };

  const ops = diffRoutineDualWriteOps(prev, next);
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

  const result = await applyRoutineDualWriteOps(client, ops, {
    userId,
    clientTs: ctx.getNow(),
    logger: ctx.logger,
  });
  return { status: "applied", result };
}

export function triggerRoutineDualWrite(
  prev: RoutineState,
  next: RoutineState,
): void {
  if (!registeredContext) return;
  void Promise.resolve().then(() => dualWriteRoutineState(prev, next));
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
  ctx: RoutineDualWriteContext,
  level: "warn" | "info",
  msg: string,
  meta: Record<string, unknown>,
): void {
  try {
    if (ctx.logger) ctx.logger(level, msg, meta);
    else if (level === "warn") console.warn(`[routine.dualWrite] ${msg}`, meta);
  } catch {
    /* noop — logging must never throw */
  }
}

export {
  applyRoutineDualWriteOps,
  diffRoutineDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
};
