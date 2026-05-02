import type { RoutineState } from "@sergeant/routine-domain";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  applyRoutineDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
} from "./adapter.js";
import { diffRoutineDualWriteOps } from "./diff.js";

/**
 * Orchestrator for the routine dual-write layer.
 *
 * Stage 4 PR #024 of `docs/planning/storage-roadmap.md`. Glues
 * together:
 *
 *  - the **gating** check (`feature.routine.sqlite_v2.dual_write`
 *    flag, default off) — provided by the host app at registration
 *    time so this module stays decoupled from the
 *    web/mobile-specific flag store implementations;
 *  - the **identity** resolver (`getUserId()`) — web reads from the
 *    React-Query `me` cache, mobile from session storage, both
 *    return `null` while bootstrapping;
 *  - the **SQLite** resolver (`getMigrationClient()`) — web returns
 *    the `migrationClient()` accessor on the lazy sqlite-wasm
 *    singleton, mobile wraps `expo-sqlite` via
 *    `createExpoSqliteRawClient`;
 *  - and the **adapter** (`applyRoutineDualWriteOps`) which performs
 *    the actual SQL writes.
 *
 * Why a registration shape: `routineStorage.ts` (the LS write layer)
 * sits below the auth + sqlite singletons in the dependency graph.
 * Pulling those in directly creates a cycle and forces every test
 * that touches the LS layer to mock React-Query + sqlite-wasm. The
 * registration pattern lets the boot wiring file (e.g. `main.tsx`)
 * install the dependencies once, and tests stay decoupled.
 *
 * Best-effort guarantees:
 *
 *  - The orchestrator's promise NEVER rejects — adapter or resolver
 *    errors are caught and logged via the registered logger.
 *  - When the flag is off, no resolver is called and no diff is
 *    computed (zero per-write overhead).
 *  - When `getUserId()` or `getMigrationClient()` return null/undefined
 *    the call is a no-op (`reason: "user-id-missing"` /
 *    `"sqlite-unavailable"`) — useful for the early boot window
 *    where state isn't hydrated yet.
 */

export interface RoutineDualWriteContext {
  /** Returns true while the user has the dual-write flag enabled. */
  isEnabled(): boolean;
  /** Owning user id, or `null` if not yet known. */
  getUserId(): string | null;
  /**
   * Resolves the SQLite migration client. May throw — the orchestrator
   * catches and logs. Returning `null` is treated the same as throwing.
   */
  getMigrationClient(): Promise<SqliteMigrationClient | null>;
  /** Returns the timestamp written to `created_at` / `updated_at`. */
  getNow(): string;
  /** Optional structured logger. Defaults to `console.warn` wrapper. */
  logger?: DualWriteLogger;
}

let registeredContext: RoutineDualWriteContext | null = null;

/**
 * Install the dual-write context. Call from the platform bootstrap
 * file (`apps/web/src/main.tsx`, mobile equivalent) when the React
 * Query client and sqlite singletons are available.
 *
 * Returns a teardown function that clears the registration — handy
 * for tests using `afterEach`.
 */
export function registerRoutineDualWriteContext(
  ctx: RoutineDualWriteContext,
): () => void {
  registeredContext = ctx;
  return () => {
    if (registeredContext === ctx) registeredContext = null;
  };
}

/** Test-only escape hatch — clears any registered context. */
export function __clearRoutineDualWriteContextForTests(): void {
  registeredContext = null;
}

/**
 * Returns `true` while a context is currently registered. Used by
 * the LS write layer (`routineStorage.ts`) to decide whether to read
 * the previous state at all — when no context is installed the
 * dual-write pipeline is a guaranteed no-op and the read can be
 * skipped to keep the off-flag write path unchanged.
 */
export function isRoutineDualWriteRegistered(): boolean {
  return registeredContext !== null;
}

/**
 * Run the dual-write pipeline for a `prev → next` LS-state transition.
 *
 * The function is `async` but the LS-write call site fires it
 * fire-and-forget through {@link triggerRoutineDualWrite} — callers
 * should not await it, since SQLite latency must never block a
 * `setState` round-trip.
 */
export async function dualWriteRoutineState(
  prev: RoutineState,
  next: RoutineState,
): Promise<DualWriteOutcome> {
  const ctx = registeredContext;
  if (!ctx) return { status: "skipped", reason: "context-unset" };
  if (!ctx.isEnabled()) return { status: "skipped", reason: "flag-off" };

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

/**
 * Fire-and-forget entry point used by `routineStorage.ts` /
 * `routineStore.ts`. Resolves immediately so the LS-write call site
 * doesn't pay any latency on the happy path.
 */
export function triggerRoutineDualWrite(
  prev: RoutineState,
  next: RoutineState,
): void {
  if (!registeredContext) return;
  // Schedule on a microtask so a synchronous LS-side caller gets
  // control back before any async work begins.
  void Promise.resolve().then(() => dualWriteRoutineState(prev, next));
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

// Re-exports for callers that need the lower-level pieces (mostly tests).
export {
  applyRoutineDualWriteOps,
  diffRoutineDualWriteOps,
  type ApplyDualWriteResult,
  type DualWriteLogger,
};
