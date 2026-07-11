/**
 * Shared dual-write types (ADR-0073, крок 1). The op-loop itself lives in
 * `createApplyOps.ts` — these types are its public request/result shape.
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
