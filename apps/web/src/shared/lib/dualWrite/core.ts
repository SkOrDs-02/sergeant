/**
 * Shared dual-write framework for module SQLite adapters.
 *
 * Stage 10 PR #070-dualwrite-refactor. Provides generic types and helpers
 * for best-effort, idempotent, LWW-guarded SQLite writes. Each module's
 * adapter imports these and implements module-specific operation handlers.
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
 * Default logger that forwards warnings to the shared web logger.
 */
export const createDefaultLogger = (prefix: string): DualWriteLogger => {
  return (level, message, meta) => {
    if (level === "warn") {
      // Lazy import to avoid circular deps
      const { logger } = require("../lib" as any);
      logger?.warn?.(`[${prefix}] ${message}`, meta ?? {});
    }
  };
};

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
        op: (op as any).kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errored, skipped };
}

interface ApplyDualWriteLoggerOptions {
  logger: DualWriteLogger;
}

// Helper for nullable int conversion
export function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Helper for nullable real conversion
export function toRealOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}