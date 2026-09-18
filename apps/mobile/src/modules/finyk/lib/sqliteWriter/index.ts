import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  applyFinykDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter";
import {
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type FinykDualWriteState,
} from "./diff";

/**
 * Orchestrator for the mobile Finyk dual-write layer.
 *
 * Stage 4 PR #036 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirror of
 * `apps/web/src/modules/finyk/lib/sqliteWriter/index.ts` and of the
 * mobile nutrition orchestrator (PR #032).
 *
 * Stage 8 PR #056k dropped the `feature.finyk.sqlite_v2.dual_write`
 * gate — the SQLite mirror now fires unconditionally whenever a
 * context is registered. MMKV-write remains source-of-truth until
 * PR #057k.
 */

export interface FinykDualWriteContext {
  getUserId(): string | null;
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  getNow(): string;
  logger?: DualWriteLogger;
}

let registeredContext: FinykDualWriteContext | null = null;

export function registerFinykDualWriteContext(
  ctx: FinykDualWriteContext,
): () => void {
  registeredContext = ctx;
  return () => {
    if (registeredContext === ctx) registeredContext = null;
  };
}

export function __clearFinykDualWriteContextForTests(): void {
  registeredContext = null;
}

export function isFinykDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

export async function dualWriteFinykState(
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
    clientTs: ctx.getNow(),
    logger: ctx.logger,
  });
  return { status: "applied", result };
}

export function triggerFinykDualWrite(
  prev: FinykDualWriteState,
  next: FinykDualWriteState,
): void {
  if (!registeredContext) return;
  // `.catch` обовʼязковий: без нього відхилення дзеркалення — це unhandled
  // rejection, який у RN не видно ніде, а людина бачить підтвердження в UI,
  // тоді як SQLite рядка не отримав (аудит 2026-09-15 § 2; веб-писачі
  // ловлять це з 2026-09). `no-floating-promises` у репо не ввімкнено, тож
  // цю форму тримає лише огляд.
  const ctx = registeredContext;
  void Promise.resolve()
    .then(() => dualWriteFinykState(prev, next))
    .catch((err) => {
      logSafe(ctx, "warn", "dual-write mirror failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

export type DualWriteOutcome =
  | { status: "applied"; result: ApplyDualWriteResult }
  | {
      status: "skipped";
      reason:
        "context-unset" | "no-ops" | "user-id-missing" | "sqlite-unavailable";
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
