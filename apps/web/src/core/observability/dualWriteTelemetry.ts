/**
 * Stage 8 telemetry sink for the SQLite dual-write rollout
 * decision-gates.
 *
 * Roadmap §3 Stage 8 (`docs/planning/storage-roadmap.md`) names three
 * client-side metrics that gate progression past `default-on
 * .dual_write` and into `default-on .read_sqlite`:
 *
 *   - `<module>.sqlite.dualwrite.error_rate` ≤ 0.1 % over 14 d
 *   - `<module>.sqlite.dualwrite.parity` (LS ↔ SQLite read equality)
 *   - `<module>.sqlite.read.fallback`     = 0 in steady state
 *
 * Browser clients cannot push to Prometheus directly, so this module
 * surfaces the same shape as **global Sentry tags** (sticky for the
 * session, queryable in saved-searches and the Discover view) plus
 * **breadcrumbs** on every error / mismatch / fallback so a follow-up
 * Sentry event in the same session carries the trail back to the
 * boot path that produced it (see `setSentryTag` semantics in
 * `./sentry.ts`).
 *
 * The aggregation is intentionally simple: per-module in-memory
 * counters plus bucketed-string tags (`"0"`, `"1-5"`, …, `"100+"`)
 * rather than raw cardinality, so a single user emitting 500
 * dual-write events does not fragment Sentry's tag index. The bucket
 * granularity is enough to answer the gate questions ("is the error
 * rate above 0.1 %?", "does the tail of users have any
 * read-fallbacks?") via Discover faceting.
 *
 * The module does **not** push to a server endpoint and does **not**
 * register Prometheus counters. A follow-up server PR can pick up
 * these tags via Sentry's Discover-to-metric pipe if absolute
 * cardinality becomes necessary; for the immediate decision-gate
 * lookup the bucketed Sentry tag is sufficient.
 */

import { addSentryBreadcrumb, setSentryTag } from "./sentry";

export type DualWriteModule = "routine" | "fizruk" | "nutrition" | "finyk";

const MODULES: readonly DualWriteModule[] = [
  "routine",
  "fizruk",
  "nutrition",
  "finyk",
];

interface ModuleCounters {
  /** `dualWriteXxxState` returned `status:"applied"` (irrespective of per-op outcome). */
  applied: number;
  /** `dualWriteXxxState` returned `status:"skipped"` (any reason). */
  skipped: number;
  /** Sum of `result.errored` across every `"applied"` outcome. */
  erroredOps: number;
  /** `status:"skipped"` events with `reason:"sqlite-unavailable"`. */
  sqliteUnavailable: number;
  /** SQLite-read boot or runtime failure → consumer fell back to LS. */
  readFallback: number;
  /** Parity probe: LS-derived state == SQLite-derived state. */
  parityMatch: number;
  /** Parity probe: LS-derived state ≠ SQLite-derived state. */
  parityMismatch: number;
}

function blankCounters(): ModuleCounters {
  return {
    applied: 0,
    skipped: 0,
    erroredOps: 0,
    sqliteUnavailable: 0,
    readFallback: 0,
    parityMatch: 0,
    parityMismatch: 0,
  };
}

const counters: Record<DualWriteModule, ModuleCounters> = {
  routine: blankCounters(),
  fizruk: blankCounters(),
  nutrition: blankCounters(),
  finyk: blankCounters(),
};

export type CountBucket = "0" | "1-5" | "6-20" | "21-100" | "100+";

/**
 * Bucket a count into a stable, low-cardinality string. Sentry tag
 * values are strings; the bucket boundaries match the rough sensitivity
 * the Stage 8 gate needs (a "no failures at all" cohort vs. a "rare"
 * vs. "tail-of-users" vs. "bug" cohort).
 */
export function bucketCount(n: number): CountBucket {
  if (n <= 0) return "0";
  if (n <= 5) return "1-5";
  if (n <= 20) return "6-20";
  if (n <= 100) return "21-100";
  return "100+";
}

export type ErrorRateBucket =
  | "0"
  | "<=0.1pct"
  | "0.1-1pct"
  | "1-5pct"
  | ">5pct";

/**
 * Bucket the running error-rate (errored ops / total ops) into the
 * Stage 8 decision-gate brackets. The `<=0.1pct` bucket is the gate
 * threshold: anything above it on a 14-day window stalls rollout.
 *
 * Tag-safe ASCII labels are used (`pct` instead of `%`) so the bucket
 * survives the Sentry tag-value charset without escaping.
 */
export function bucketErrorRate(rate: number): ErrorRateBucket {
  if (rate <= 0) return "0";
  if (rate <= 0.001) return "<=0.1pct";
  if (rate <= 0.01) return "0.1-1pct";
  if (rate <= 0.05) return "1-5pct";
  return ">5pct";
}

function totalDualWriteAttempts(c: ModuleCounters): number {
  // `applied` is the number of batches that reached SQLite; `erroredOps`
  // is the per-op error sum across those batches. For the rate
  // denominator we approximate batches × 1 op-per-batch, which is the
  // steady-state shape — drift on multi-op batches is bounded above by
  // the bucket width.
  return c.applied + c.erroredOps + c.sqliteUnavailable;
}

function syncTagsFor(module: DualWriteModule): void {
  const c = counters[module];
  setSentryTag(`dualwrite.${module}.applied`, bucketCount(c.applied));
  setSentryTag(`dualwrite.${module}.errored`, bucketCount(c.erroredOps));
  setSentryTag(`dualwrite.${module}.skipped`, bucketCount(c.skipped));
  setSentryTag(
    `dualwrite.${module}.sqlite_unavailable`,
    bucketCount(c.sqliteUnavailable),
  );
  setSentryTag(`read.fallback.${module}`, bucketCount(c.readFallback));
  setSentryTag(`dualwrite.${module}.parity_match`, bucketCount(c.parityMatch));
  setSentryTag(
    `dualwrite.${module}.parity_mismatch`,
    bucketCount(c.parityMismatch),
  );

  const total = totalDualWriteAttempts(c);
  const rate = total === 0 ? 0 : c.erroredOps / total;
  setSentryTag(`dualwrite.${module}.error_rate`, bucketErrorRate(rate));
}

/**
 * The narrowed shape of `DualWriteOutcome` we accept. Every per-module
 * orchestrator (`routine`, `fizruk`, `nutrition`, `finyk`) emits this
 * shape — the recorder is generic over the `module` label so we do
 * not couple the four orchestrators to each other through a shared
 * type.
 */
export interface DualWriteOutcomeRecord {
  status: "applied" | "skipped";
  /** Per-op summary returned by the adapter when `status === "applied"`. */
  result?: { applied?: number; errored?: number; skipped?: number };
  /** Reason string when `status === "skipped"`. */
  reason?: string;
}

/**
 * Public hook called from each `dualWriteXxxState` orchestrator just
 * before it returns. Updates the per-module counters and re-syncs all
 * tags (so the *latest* event in the session always carries the most
 * up-to-date bucket).
 *
 * Never throws — Sentry forwards already swallow SDK exceptions, and
 * counter mutation is local memory.
 */
export function recordDualWriteOutcome(
  module: DualWriteModule,
  outcome: DualWriteOutcomeRecord,
): void {
  const c = counters[module];
  if (outcome.status === "applied") {
    c.applied += 1;
    const erroredThisBatch = outcome.result?.errored ?? 0;
    if (erroredThisBatch > 0) {
      c.erroredOps += erroredThisBatch;
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: `dualwrite ${module} ops errored`,
        data: {
          module,
          errored: erroredThisBatch,
          applied: outcome.result?.applied ?? 0,
        },
      });
    }
  } else {
    c.skipped += 1;
    if (outcome.reason === "sqlite-unavailable") {
      c.sqliteUnavailable += 1;
      addSentryBreadcrumb({
        category: "storage",
        level: "warning",
        message: `dualwrite ${module} fell back: sqlite-unavailable`,
        data: { module, reason: outcome.reason },
      });
    }
  }
  syncTagsFor(module);
}

/**
 * Public hook called from the SQLite-read boot path
 * (`bootSqliteReadPath` and equivalents) when SQLite is unable to
 * serve the read and the consumer falls back to LS. The `reason` is
 * a free-form string surfaced as a breadcrumb so triage can tell
 * "boot-failed" from "schema-mismatch" without parsing stack traces.
 */
export function recordReadFallback(
  module: DualWriteModule,
  reason: string,
): void {
  const c = counters[module];
  c.readFallback += 1;
  addSentryBreadcrumb({
    category: "storage",
    level: "warning",
    message: `read.fallback ${module}: ${reason}`,
    data: { module, reason },
  });
  syncTagsFor(module);
}

/**
 * Public hook called when a parity probe ran (planned for a later
 * Stage 8 follow-up — exported now so the recorder API is complete).
 * `details` is forwarded to the breadcrumb on mismatch (e.g.
 * `{ ls: 12, sqlite: 11 }`) so triage can spot the divergence shape;
 * on `match` the breadcrumb is skipped (steady-state noise reduction).
 */
export function recordParityCheck(
  module: DualWriteModule,
  result: "match" | "mismatch",
  details?: Record<string, unknown>,
): void {
  const c = counters[module];
  if (result === "match") {
    c.parityMatch += 1;
  } else {
    c.parityMismatch += 1;
    addSentryBreadcrumb({
      category: "storage",
      level: "warning",
      message: `dualwrite parity mismatch: ${module}`,
      data: { module, ...(details ?? {}) },
    });
  }
  syncTagsFor(module);
}

/** Test-only escape hatch — clears every module's counters. */
export function __resetDualWriteTelemetryForTests(): void {
  for (const m of MODULES) {
    counters[m] = blankCounters();
  }
}

/**
 * Test-only read of the in-memory counters. Returns a shallow clone so
 * callers cannot mutate internal state through the returned object.
 */
export function __peekDualWriteTelemetryForTests(
  module: DualWriteModule,
): Readonly<ModuleCounters> {
  return { ...counters[module] };
}
