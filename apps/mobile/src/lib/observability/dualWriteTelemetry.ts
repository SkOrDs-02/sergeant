/**
 * Mobile mirror of `apps/web/src/core/observability/dualWriteTelemetry.ts`.
 *
 * Stage 8 of `docs/planning/storage-roadmap.md` defines three
 * client-side decision-gate metrics:
 *
 *   - `<module>.sqlite.dualwrite.error_rate` ≤ 0.1 % over 14 d
 *   - `<module>.sqlite.dualwrite.parity` (LS ↔ SQLite read equality)
 *   - `<module>.sqlite.read.fallback`     = 0 in steady state
 *
 * The web sink also pushes sticky **Sentry tags** so Discover can
 * facet on bucketed counts. Mobile observability (`./observability`)
 * currently exposes only `addSentryBreadcrumb` — no `setTag` /
 * `setContext`. To keep the orchestrator API symmetrical with web,
 * this module exposes the same `record*` hooks but the tag-side is
 * a no-op until a mobile-side `setSentryTag` lands. Breadcrumbs are
 * still emitted on errors / mismatches / fallbacks so triage retains
 * the same trail in mobile Sentry events.
 *
 * **Stage 10 mobile mirror** introduces `recordParityCheck` for
 * Routine — see `../../modules/routine/lib/dualWrite/parity.ts`.
 *
 * @see apps/web/src/core/observability/dualWriteTelemetry.ts — single
 *      source-of-truth for the bucket boundaries and gate thresholds.
 */

import { addSentryBreadcrumb } from "../observability";

export type DualWriteModule = "routine" | "fizruk" | "nutrition" | "finyk";

const MODULES: readonly DualWriteModule[] = [
  "routine",
  "fizruk",
  "nutrition",
  "finyk",
];

interface ModuleCounters {
  applied: number;
  skipped: number;
  erroredOps: number;
  sqliteUnavailable: number;
  readFallback: number;
  parityMatch: number;
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

export interface DualWriteOutcomeRecord {
  status: "applied" | "skipped";
  result?: { applied?: number; errored?: number; skipped?: number };
  reason?: string;
}

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
}

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
}

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
}

/** Test-only escape hatch — clears every module's counters. */
export function __resetDualWriteTelemetryForTests(): void {
  for (const m of MODULES) {
    counters[m] = blankCounters();
  }
}

/** Test-only read of the in-memory counters. */
export function __peekDualWriteTelemetryForTests(
  module: DualWriteModule,
): Readonly<ModuleCounters> {
  return { ...counters[module] };
}
