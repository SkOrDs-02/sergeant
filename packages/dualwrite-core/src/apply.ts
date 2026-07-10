/**
 * Platform-neutral dual-write op-loop (ADR-0073, крок 1).
 *
 * Extracted verbatim from `apps/web/src/shared/lib/sqliteWriter/core.ts`
 * (Stage 10 PR #070-dualwrite-refactor). Behaviour is unchanged: best-effort,
 * idempotent iteration over ops with per-op try/catch and counters.
 *
 * AI-CONTEXT: цей пакет — дім generic dual-write фреймворку для 4 модульних
 * пайплайнів (finyk/fizruk/nutrition/routine, web + mobile). Він МУСИТЬ
 * лишатися вільним від DOM/React-Native/Sentry залежностей — усе платформне
 * (логер, телеметрія, uuid) ін'єктується споживачем (ADR-0073 § Risks #2).
 */

export interface ApplyDualWriteOptions {
  readonly userId: string;
  readonly clientTs: string;
  readonly logger?: DualWriteLogger | undefined;
}

export type DualWriteLogger = (
  level: "warn" | "info",
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface ApplyDualWriteResult {
  readonly applied: number;
  readonly errored: number;
  readonly skipped: number;
}

/**
 * Generic outcome type for apply operations.
 */
export type ApplyOutcome = "applied" | "skipped";

/**
 * Apply helper: iterates over ops with try/catch, returns counters.
 * Module adapters call this with their specific applyOne implementation.
 */
export async function applyDualWriteOps<T extends string>(
  ops: readonly { kind: T }[],
  applyOne: (op: { kind: T }) => Promise<ApplyOutcome>,
  options: ApplyDualWriteLoggerOptions,
): Promise<ApplyDualWriteResult> {
  if (ops.length === 0) {
    return { applied: 0, errored: 0, skipped: 0 };
  }
  const { logger } = options;
  let applied = 0;
  let errored = 0;
  let skipped = 0;

  for (const op of ops) {
    try {
      const outcome = await applyOne(op);
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

interface ApplyDualWriteLoggerOptions {
  logger: DualWriteLogger;
}
