/**
 * @status Active
 * @owner @Skords-01
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { beginRouteChange, endRouteChange } from "../lib/routeChangePerf";

/**
 * Side-effect-only component that emits `ROUTE_CHANGE` analytics events
 * on every top-level pathname transition. Mounts once inside `<Providers>`
 * next to [`PageviewTracker`](./PageviewTracker.tsx) so the two share the
 * same RouterProvider context and lifecycle.
 *
 * Mirrors the `useEffect([location.pathname])` shape of `PageviewTracker`
 * — guards against React 18 StrictMode double-mount, suppresses the
 * initial-mount fire (that's not a route change), and schedules the
 * `end` call after 2×rAF so the measurement spans React commit + first
 * paint of the new route.
 *
 * Why a separate component instead of folding into `PageviewTracker`:
 *   1. `$pageview` events drop on every pathname flip; `ROUTE_CHANGE` adds
 *      a measured duration window — different shapes, different sampling
 *      policies in the future.
 *   2. Test isolation — `PageviewTracker` tests assert PostHog `$pageview`
 *      semantics; `RouteChangeTracker` tests assert begin/end timing.
 *   3. Easy to lift behind an experiment flag later without touching the
 *      pageview pipeline.
 */
export function RouteChangeTracker(): null {
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const path = location.pathname;
    const prev = prevPathRef.current;
    prevPathRef.current = path;

    // Initial mount is not a route change — record baseline and bail.
    if (prev === null) return undefined;
    // StrictMode double-mount echo — same pathname twice in a row.
    if (prev === path) return undefined;

    beginRouteChange(prev, path);

    // Schedule `end` after the next two animation frames so we measure
    // commit + first paint of the new route, not just commit time.
    let secondRafId = 0;
    const firstRafId = window.requestAnimationFrame(() => {
      secondRafId = window.requestAnimationFrame(() => {
        endRouteChange(path);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstRafId);
      if (secondRafId) window.cancelAnimationFrame(secondRafId);
    };
  }, [location.pathname]);

  return null;
}
