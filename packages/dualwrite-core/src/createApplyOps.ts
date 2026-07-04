/**
 * Op-loop factory with a parameterised error policy (ADR-0073, крок 2).
 *
 * Generalises the two apply shapes that live in the module adapters today:
 *
 *  - `"best-effort"` — per-op try/catch; a single failed op is counted and
 *    logged but never aborts the rest (finyk/nutrition/routine + all mobile).
 *  - `"atomic-batch"` — BEGIN/COMMIT/ROLLBACK; any failure rolls the whole
 *    batch back and reports `errored = ops.length` (web-fizruk only; kept in
 *    the API for крок 4, currently unused by any migrated pipeline).
 *
 * The handler map is keyed by `Op["kind"]`, so the type system enforces an
 * exhaustive handler set at the call site.
 *
 * AI-CONTEXT: platform-neutral — the logger is injected (ADR-0073 § Risks #2);
 * no DOM/RN/Sentry. The `"best-effort"` branch is byte-behaviourally identical
 * to the hand-written loop it replaces (see `apply.ts` `applyDualWriteOps`).
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  ApplyDualWriteOptions,
  ApplyDualWriteResult,
  ApplyOutcome,
  DualWriteLogger,
} from "./apply.js";

export type ErrorPolicy = "best-effort" | "atomic-batch";

/** Runtime passed to every op handler. */
export interface DualWriteRuntime {
  readonly userId: string;
  /** ISO-8601; source is the orchestrator's `getNow()`, never `Date.now()` here. */
  readonly clientTs: string;
}

export type OpHandler<Op, K extends string> = (
  client: SqliteMigrationClient,
  op: Extract<Op, { readonly kind: K }>,
  rt: DualWriteRuntime,
) => Promise<ApplyOutcome>;

export interface ApplyOpsSpec<Op extends { readonly kind: string }> {
  readonly errorPolicy: ErrorPolicy;
  /** One handler per op-kind; the mapped type enforces exhaustiveness. */
  readonly handlers: {
    readonly [K in Op["kind"]]: OpHandler<Op, K>;
  };
}

const DEFAULT_LOGGER: DualWriteLogger = () => {};

/**
 * Build an `apply*` function from a spec. The returned function has the same
 * signature every module adapter exposes today.
 */
export function createApplyOps<Op extends { readonly kind: string }>(
  spec: ApplyOpsSpec<Op>,
): (
  client: SqliteMigrationClient,
  ops: readonly Op[],
  options: ApplyDualWriteOptions,
) => Promise<ApplyDualWriteResult> {
  return async function applyOps(client, ops, options) {
    if (ops.length === 0) {
      return { applied: 0, errored: 0, skipped: 0 };
    }
    const logger = options.logger ?? DEFAULT_LOGGER;
    const rt: DualWriteRuntime = {
      userId: options.userId,
      clientTs: options.clientTs,
    };

    if (spec.errorPolicy === "atomic-batch") {
      return applyAtomicBatch(spec, client, ops, rt, logger);
    }
    return applyBestEffort(spec, client, ops, rt, logger);
  };
}

async function runHandler<Op extends { readonly kind: string }>(
  spec: ApplyOpsSpec<Op>,
  client: SqliteMigrationClient,
  op: Op,
  rt: DualWriteRuntime,
): Promise<ApplyOutcome> {
  const handler = spec.handlers[op.kind as Op["kind"]] as OpHandler<
    Op,
    Op["kind"]
  >;
  return handler(client, op as Extract<Op, { readonly kind: string }>, rt);
}

async function applyBestEffort<Op extends { readonly kind: string }>(
  spec: ApplyOpsSpec<Op>,
  client: SqliteMigrationClient,
  ops: readonly Op[],
  rt: DualWriteRuntime,
  logger: DualWriteLogger,
): Promise<ApplyDualWriteResult> {
  let applied = 0;
  let errored = 0;
  let skipped = 0;

  for (const op of ops) {
    try {
      const outcome = await runHandler(spec, client, op, rt);
      if (outcome === "applied") applied += 1;
      else skipped += 1;
    } catch (err) {
      errored += 1;
      logger("warn", "dual-write op failed", {
        op: op.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errored, skipped };
}

async function applyAtomicBatch<Op extends { readonly kind: string }>(
  spec: ApplyOpsSpec<Op>,
  client: SqliteMigrationClient,
  ops: readonly Op[],
  rt: DualWriteRuntime,
  logger: DualWriteLogger,
): Promise<ApplyDualWriteResult> {
  let applied = 0;
  let skipped = 0;

  await client.exec("BEGIN");
  try {
    for (const op of ops) {
      const outcome = await runHandler(spec, client, op, rt);
      if (outcome === "applied") applied += 1;
      else skipped += 1;
    }
    await client.exec("COMMIT");
    return { applied, errored: 0, skipped };
  } catch (err) {
    await client.exec("ROLLBACK");
    logger("warn", "dual-write batch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { applied: 0, errored: ops.length, skipped: 0 };
  }
}
