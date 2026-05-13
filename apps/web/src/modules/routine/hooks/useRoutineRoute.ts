import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  parseLegacyRoutineHash,
  parseRoutineSegments,
  routineRoutePath,
  type RoutinePage,
} from "../lib/routineRouter";

/**
 * Path-based router for the Routine module (initiative 0006 §Phase 2.d
 * migration of the raw `window.location.hash` deep-link shim → react-router).
 *
 * Page id lives in the URL pathname (`/routine`, `/routine/stats`) so deep
 * links from other modules (e.g. Fizruk «Запланувати тренування» → calendar)
 * can target a specific Routine tab directly. The hash deep-link
 * (`/routine#calendar`, `/routine#stats`) is rewritten on mount via the
 * one-time compat shim and afterwards the URL is path-based.
 *
 * Returns `{ page, navigate }` — the call site in `useRoutineAppState.ts`
 * still keeps a `useLocalStorageState`-backed "last-active tab" memory; this
 * hook overrides that memory whenever the pathname points at a specific
 * tab, so bookmarking `/routine/stats` lands on stats regardless of what
 * the user picked last time.
 */
export interface UseRoutineRouteResult {
  page: RoutinePage;
  navigate: (next: RoutinePage) => void;
}

export function useRoutineRoute(
  defaultPage: RoutinePage = "calendar",
): UseRoutineRouteResult {
  const location = useLocation();
  const navigateRR = useNavigate();

  const page = useMemo<RoutinePage>(() => {
    const segments = pathnameToSegments(location.pathname);
    if (segments.length === 0) return defaultPage;
    return parseRoutineSegments(segments).page;
  }, [location.pathname, defaultPage]);

  // Hash compat: when a legacy URL (`/routine#calendar`, `/routine#stats`,
  // `/?module=routine#stats`) lands here, rewrite to the equivalent
  // path-based URL and clear the hash. One-shot per mount — afterwards all
  // navigation is path-based.
  const compatRedirected = useRef(false);
  useEffect(() => {
    if (compatRedirected.current) return;
    compatRedirected.current = true;
    const legacy = parseLegacyRoutineHash();
    if (!legacy) return;
    const target = routineRoutePath(legacy.page);
    navigateRR(target, { replace: true });
  }, [navigateRR]);

  const navigate = useCallback(
    (next: RoutinePage) => {
      const target = routineRoutePath(next);
      if (location.pathname === target) return;
      navigateRR(target, { replace: false });
    },
    [location.pathname, navigateRR],
  );

  return { page, navigate };
}

/**
 * Splits the pathname into routine route segments. The route is mounted as
 * `/routine/*` in `apps/web/src/core/app/router.tsx`, so:
 *   `/routine`        → `[]`
 *   `/routine/stats`  → `["stats"]`
 *
 * Anything outside `/routine` returns `[]` (the hook treats it as the
 * default `calendar` tab — this branch only fires during transient
 * navigations, the `<App />` shell unmounts RoutineApp before the next
 * render in practice).
 */
function pathnameToSegments(pathname: string): string[] {
  if (!pathname.startsWith("/routine")) return [];
  const tail = pathname.slice("/routine".length);
  if (tail === "" || tail === "/") return [];
  if (!tail.startsWith("/")) return [];
  return tail.slice(1).split("/").filter(Boolean);
}
