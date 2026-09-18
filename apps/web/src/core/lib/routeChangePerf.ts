/**
 * Route-change RUM instrumentation.
 *
 * Captures `ROUTE_CHANGE` events for top-level pathname transitions —
 * the missing baseline for [Initiative 0006](../../../../docs/initiatives/0006-frontend-routing-and-code-split.md)
 * Phase 4 target `route_change_p95_latency_ms ≤ 600 ms (with prefetch)`.
 *
 * Mirrors the `beginX` / `endX` shape of [`hubPerf.ts`](./hubPerf.ts) and
 * reuses [`longTaskMonitor`](./longTaskMonitor.ts) to attribute main-thread
 * stalls to the right route-change window.
 *
 * ## Flow
 *
 *   beginRouteChange("/finyk", "/fizruk")   ← from `RouteChangeTracker` when
 *                                              `useLocation().pathname` flips
 *   …React commits new tree, paints first frame…
 *   endRouteChange("/fizruk")               ← from the same tracker, scheduled
 *                                              via 2×rAF so we measure
 *                                              post-paint TTI rather than
 *                                              pre-paint commit
 *
 * Only one measurement is in flight at any time — back-to-back navigations
 * (user taps three nav items quickly) overwrite the slot, and only the
 * latest `endRouteChange` emits an event. This matches the user-perceived
 * "the last tap is the one I care about" expectation and keeps the event
 * stream honest (no inflated counts from churn).
 */

import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { trackEvent } from "../observability/analytics";
import { getLongTasksSince } from "./longTaskMonitor";

interface PendingRouteChange {
  from: string;
  to: string;
  startedAt: number;
}

let pending: PendingRouteChange | null = null;

/**
 * Begin a route-change measurement window. Records `performance.now()` and
 * the from/to pathnames. Idempotent overwrites — if the user navigates
 * again before the previous window closed, the latest `from`/`to`/start wins.
 */
export function beginRouteChange(from: string, to: string): void {
  if (typeof window === "undefined") return;
  pending = { from, to, startedAt: performance.now() };
}

/**
 * Finalise a route-change measurement. Emits `ROUTE_CHANGE` only if the
 * pending entry matches `to` — defensive against stale `end` calls that
 * fire after another navigation already overwrote the slot.
 *
 * No-op when no pending entry exists (initial mount, or end called twice).
 */
export function endRouteChange(to: string): void {
  if (typeof window === "undefined") return;
  const entry = pending;
  if (!entry || entry.to !== to) return;
  pending = null;
  const durationMs = Math.round(performance.now() - entry.startedAt);
  const longTasks = getLongTasksSince(entry.startedAt);
  const longTaskMs = Math.round(
    longTasks.reduce((sum, task) => sum + task.duration, 0),
  );
  trackEvent(ANALYTICS_EVENTS.ROUTE_CHANGE, {
    from: entry.from,
    to: entry.to,
    durationMs,
    longTaskMs,
    longTaskCount: longTasks.length,
  });
}

/**
 * Test-only reset hook. Clears the pending slot so each test starts from
 * a clean state without leaking begin-without-end measurements across cases.
 */
export function __resetForTests(): void {
  pending = null;
}
