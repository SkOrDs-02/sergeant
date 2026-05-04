/**
 * Console observability counters.
 *
 * Lightweight in-process counters surfaced via `getMetricsSnapshot()`
 * for diagnostic endpoints / tests. The console process is single
 * instance per Railway service, so a process-local counter is
 * sufficient — nothing to aggregate across pods.
 *
 * If/when console moves to multi-instance, swap this file for
 * `prom-client` without touching call-sites (the public API stays:
 * `incrementCounter("name")` / `getMetricsSnapshot()`).
 */

const counters: Record<string, number> = Object.create(null);

/** Increment a named counter by 1 (default) or `delta`. */
export function incrementCounter(name: string, delta = 1): void {
  counters[name] = (counters[name] ?? 0) + delta;
}

/** Read a single counter (returns 0 if never incremented). */
export function getCounter(name: string): number {
  return counters[name] ?? 0;
}

/** Snapshot all counters — for diagnostic endpoints / tests. */
export function getMetricsSnapshot(): Readonly<Record<string, number>> {
  return { ...counters };
}

/** Reset all counters — test-only. */
export function resetMetricsForTesting(): void {
  for (const key of Object.keys(counters)) {
    delete counters[key];
  }
}

// ---------------------------------------------------------------------------
// Counter names — keep these as exported constants so call-sites are
// typo-proof and renames stay grep-safe.
// ---------------------------------------------------------------------------

/**
 * Incremented every time the OpenClaw per-call USD cap (M18) rejects
 * an Anthropic request before dispatch. See
 * `apps/console/src/openclaw/policy.ts` for the cap logic.
 */
export const OPENCLAW_PER_CALL_CAP_HIT_TOTAL =
  "openclaw.per_call_cap_hit_total";
