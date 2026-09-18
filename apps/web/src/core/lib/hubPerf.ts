/**
 * Hub tab-switch RUM instrumentation.
 *
 * Measures perceived TTI for the four hub tabs — `dashboard` is eager
 * (no Suspense), but `reports`, `settings`, `profile` each mount a
 * code-split chunk through `<SuspenseWithMinDelay>`. Cold-mount cost
 * was 10+ s in prod ([live audit 2026-05-20](../../../docs/initiatives/0017-hub-tabs-mount-perf.md));
 * Sprint 0 of [Initiative 0017](../../../docs/initiatives/0017-hub-tabs-mount-perf.md)
 * captures this number so the optimisation PRs that follow have a
 * baseline to beat.
 *
 * ## Flow
 *
 *   beginHubTabSwitch("reports")   ← from `HubMainContent` when `hubView`
 *                                    flips to a tracked tab
 *   …Suspense fallback shown…
 *   …chunk loads…
 *   …React commits new tree…
 *   endHubTabSwitch("reports")     ← from `<TabReadyProbe>` which mounts
 *                                    only once the Suspense boundary
 *                                    resolves, after a 2-RAF defer so we
 *                                    measure post-paint TTI rather than
 *                                    pre-paint commit
 *
 * `endHubTabSwitch` computes `ttiMs` + slices long-tasks since
 * `beginHubTabSwitch` from [`longTaskMonitor`](./longTaskMonitor.ts) and
 * fires a single `HUB_TAB_SWITCH_PERF` analytics event via the
 * canonical `trackEvent` sink (PostHog + localStorage ring-buffer).
 *
 * ## Edge cases
 *
 * - **Repeated taps on the same tab**: `hubView` does not change, so
 *   the `useEffect` in `HubMainContent` does not re-fire. No double-counts.
 * - **Re-mount mid-flight** (probe mounts → unmounts → mounts again
 *   before `end` fires): the pending entry is keyed per-tab, so
 *   `endHubTabSwitch` flushes once and clears state. Subsequent probe
 *   mounts find no pending entry and silently no-op.
 * - **Tab switched away before `end` fires**: `beginHubTabSwitch` for
 *   the new tab overwrites the slot — we never report partial
 *   measurements. Slot leak is bounded to one per tab.
 * - **SSR / non-browser**: every public function early-returns on
 *   `typeof window === "undefined"`. Trees that import this module
 *   during server-side rendering pay zero runtime cost.
 */

import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { trackEvent } from "../observability/analytics";
import { getLongTasksSince } from "./longTaskMonitor";
import { isPagePrefetched, type PageKey } from "./useRoutePrefetch";

/**
 * Hub tabs we instrument. `dashboard` is excluded — it's the eager
 * default view, no chunk to wait on, no meaningful TTI signal beyond
 * route-load itself (which is covered by [`useAppEffects`](../app/useAppEffects.ts)
 * `prefetchHubNavigationPages`).
 */
export type TrackedHubTab = "reports" | "settings" | "profile";

interface PendingSwitch {
  startedAt: number;
  cacheHit: boolean;
}

const TRACKED_TABS: ReadonlySet<TrackedHubTab> = new Set([
  "reports",
  "settings",
  "profile",
]);

const pending = new Map<TrackedHubTab, PendingSwitch>();

/**
 * Begin a tab-switch measurement window. Records `performance.now()`
 * as the start and sniffs whether the target chunk was already in the
 * route-prefetch cache (cacheHit) so the analytics payload can
 * separate cold-from-cache from cold-from-network.
 *
 * Repeated calls for the same tab silently overwrite the slot — the
 * latest begin wins. This matches the user-perceived flow when they
 * tap a tab, see the skeleton, then tap a different tab before it
 * finishes loading.
 */
export function beginHubTabSwitch(tab: TrackedHubTab): void {
  if (typeof window === "undefined") return;
  if (!TRACKED_TABS.has(tab)) return;
  const startedAt = performance.now();
  // `isPagePrefetched` covers the four hub-navigable pages including
  // `reports` and `settings`; `profile` is also a `PageKey`. The cast
  // is safe because `TrackedHubTab` is a strict subset of `PageKey`.
  const cacheHit = isPagePrefetched(tab as PageKey);
  pending.set(tab, { startedAt, cacheHit });
}

/**
 * Finalise a tab-switch measurement. Computes `ttiMs` since the matching
 * `beginHubTabSwitch` and emits `HUB_TAB_SWITCH_PERF` with the long-task
 * delta observed during the window.
 *
 * No-op if there's no pending entry for `tab` — defensive against probe
 * mounts during initial load when no begin call has fired yet.
 */
export function endHubTabSwitch(tab: TrackedHubTab): void {
  if (typeof window === "undefined") return;
  const entry = pending.get(tab);
  if (!entry) return;
  pending.delete(tab);
  const ttiMs = Math.round(performance.now() - entry.startedAt);
  const longTasks = getLongTasksSince(entry.startedAt);
  const longTaskMs = Math.round(
    longTasks.reduce((sum, task) => sum + task.duration, 0),
  );
  trackEvent(ANALYTICS_EVENTS.HUB_TAB_SWITCH_PERF, {
    tab,
    ttiMs,
    longTaskMs,
    longTaskCount: longTasks.length,
    cacheHit: entry.cacheHit,
  });
}

/**
 * Test-only reset hook. Empties pending measurements so each test
 * starts from a clean state without leaking begin-without-end slots
 * across cases.
 */
export function __resetForTests(): void {
  pending.clear();
}
