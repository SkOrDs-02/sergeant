import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  applyNutritionDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
} from "./diff";

/**
 * Orchestrator for the Nutrition dual-write layer (mobile mirror of
 * `apps/web/src/modules/nutrition/lib/dualWrite/index.ts`).
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. The MMKV
 * write layer fires `triggerNutritionDualWrite(prev, next)` after every
 * successful MMKV write; this module decides whether to mirror to the
 * local expo-sqlite database based on the registered context.
 *
 * Stage 8 PR #056n dropped the
 * `feature.nutrition.sqlite_v2.dual_write` gate — the SQLite mirror is
 * now unconditional whenever a dual-write context is registered.
 *
 * Decoupling: see the web copy for the rationale (avoids cycles
 * between MMKV layer ↔ auth ↔ sqlite singleton, keeps tests independent).
 */

export interface NutritionDualWriteContext {
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: NutritionDualWriteContext | null = null;

export function registerNutritionDualWriteContext(
  ctx: NutritionDualWriteContext,
): () => void {
  registeredContext = ctx;
  return () => {
    if (registeredContext === ctx) registeredContext = null;
  };
}

export function __clearNutritionDualWriteContextForTests(): void {
  registeredContext = null;
}

export function isNutritionDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

export async function dualWriteNutritionState(
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
  return { status: "applied", result };
}

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

export {
  applyNutritionDualWriteOps,
  diffNutritionDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
  type NutritionDualWriteState,
};
