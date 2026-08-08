import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBrowserLocation } from "../../../core/hooks/useBrowserLocation";
import {
  fizrukRoutePath,
  parseFizrukSegments,
  parseLegacyFizrukHash,
  type FizrukPage,
} from "../lib/fizrukRouter";
import { safeReadStringSS, safeWriteSS } from "@shared/lib/storage/storage";

/**
 * Defect #1 (page-audit follow-up): the contextual back arrow in
 * `FizrukHeader` and the in-page «Перейти до журналу» / «До журналу» CTAs
 * all resolve to a hardcoded `navigate("workouts")` call (see
 * `FizrukApp.contextualBackTarget`) — no matter whether the user actually
 * arrived from Progress, the journal, or an active workout session.
 *
 * Tracking the last non-`exercise` fizruk pathname here — and substituting
 * it in for a bare `workouts` target while currently on the exercise page
 * — makes «Назад» return to the real origin without any of those
 * call-sites needing to change. `sessionStorage` (not `localStorage`) is
 * deliberate: tab-scoped, survives a refresh within the tab (Hard Rule /
 * defect requirement), and degrades honestly to the pre-existing
 * `workouts` default once the tab/session is gone — e.g. a fresh
 * direct deep-link to `/fizruk/exercise/<id>` in a new tab, which is
 * exactly the "sensible default" the defect asks for.
 */
const EXERCISE_RETURN_SESSION_KEY = "fizruk_exercise_return_path";

/**
 * Path-based router for the Fizruk module (initiative 0006 §Phase 2.c —
 * migration of `useHashRoute<FizrukPage>` → react-router). Page id (plus
 * optional `exercise/<id>` tail segment) lives in the URL pathname so
 * deep-links from other modules (PWA action handlers, Hub recommendations,
 * push notifications) can target a specific Fizruk page directly.
 *
 * Public shape mirrors `useHashRoute<FizrukPage>` (`{ page, segments,
 * navigate }`) so the call-site swap in `FizrukApp.tsx` is a one-line
 * import change. Behaviour difference: `navigate` writes the pathname via
 * `react-router` instead of mutating `window.location.hash`.
 *
 * Accepted legacy shapes (one-time redirect on mount):
 *   - `/fizruk#workouts`            → `/fizruk/workouts`
 *   - `/fizruk#exercise/abc-123`    → `/fizruk/exercise/abc-123`
 *   - `/fizruk#/workouts`           → `/fizruk/workouts`
 *   - `/?module=fizruk#workouts`    → `/fizruk/workouts` (works because
 *     `useHubNavigation` re-runs once the path updates).
 *
 * Unknown ids fall back to `defaultPage` (default `"dashboard"`).
 */
export interface UseFizrukRouteResult {
  page: FizrukPage;
  /** Extra path segment after `<page>/` — used by `exercise/<id>`. */
  segments: readonly string[];
  navigate: (next: FizrukPage | string) => void;
}

/**
 * Splits the pathname into fizruk route segments. The route is mounted as
 * `/fizruk/*` in `apps/web/src/core/app/router.tsx`, so:
 *   `/fizruk`                      → `[]`
 *   `/fizruk/workouts`             → `["workouts"]`
 *   `/fizruk/exercise/abc-123`     → `["exercise", "abc-123"]`
 *
 * Anything outside `/fizruk` returns `[]` (the hook treats it as the
 * default `dashboard` tab — this branch only fires during transient
 * navigations, the `<App />` shell unmounts FizrukApp before the next
 * render in practice).
 */
function pathnameToSegments(pathname: string): string[] {
  if (!pathname.startsWith("/fizruk")) return [];
  const tail = pathname.slice("/fizruk".length);
  if (tail === "" || tail === "/") return [];
  if (!tail.startsWith("/")) return [];
  return tail.slice(1).split("/").filter(Boolean);
}

export function useFizrukRoute(
  defaultPage: FizrukPage = "dashboard",
): UseFizrukRouteResult {
  const routerLocation = useLocation();
  const location = useBrowserLocation(routerLocation);
  const navigateRR = useNavigate();

  const parsed = useMemo(() => {
    const segs = pathnameToSegments(location.pathname);
    if (segs.length === 0) return { page: defaultPage, segment: undefined };
    return parseFizrukSegments(segs);
  }, [location.pathname, defaultPage]);

  const page = parsed.page;
  const segments = useMemo<readonly string[]>(
    () => (parsed.segment ? [parsed.segment] : []),
    [parsed.segment],
  );

  // Hash compat: when a legacy URL (`/fizruk#workouts`,
  // `/fizruk#exercise/abc-123`, `/?module=fizruk#workouts`) lands on this
  // hook, rewrite to the equivalent path-based URL and clear the hash.
  // One-shot per mount — afterwards all navigation is path-based.
  const compatRedirected = useRef(false);
  useEffect(() => {
    if (compatRedirected.current) return;
    compatRedirected.current = true;
    const legacy = parseLegacyFizrukHash();
    if (!legacy) return;
    const target = fizrukRoutePath(legacy.page, legacy.segment);
    navigateRR(target, { replace: true });
  }, [navigateRR]);

  // Defect #1: remember the last non-exercise page so `navigate("workouts")`
  // issued *while on the exercise page* can return there instead of the
  // hardcoded journal fallback. Only writes when we're NOT on the exercise
  // page, so the value survives the transition into `exercise/<id>` and
  // stays available for `navigate()` below to read.
  useEffect(() => {
    if (page === "exercise") return;
    safeWriteSS(EXERCISE_RETURN_SESSION_KEY, location.pathname);
  }, [location.pathname, page]);

  const navigate = useCallback(
    (next: FizrukPage | string) => {
      // Accept either a typed `FizrukPage` (`navigate("workouts")`) or a
      // `<page>/<segment>` string (`navigate("exercise/abc-123")`) — the
      // legacy `useHashRoute` hook supported both, so the call-sites in
      // `FizrukApp.tsx` / `FizrukRouter.tsx` rely on the same shape.
      const raw = String(next || "").trim();
      const parts = raw.split("/").filter(Boolean);
      const result = parseFizrukSegments(parts);

      // Defect #1: on the exercise page, a bare `workouts` target (no
      // segment) is always a "back"-shaped call — the header's contextual
      // back arrow, the invalid-id/not-found CTAs, and the «Перейти до
      // журналу» footer CTA all resolve to exactly this. Redirect to the
      // remembered source page instead, when we have one. Deep-links with
      // no recorded source (fresh tab, no prior fizruk navigation this
      // session) fall through to the normal `workouts` target below — the
      // honest default the defect asks for.
      if (
        page === "exercise" &&
        result.page === "workouts" &&
        !result.segment
      ) {
        const remembered = safeReadStringSS(EXERCISE_RETURN_SESSION_KEY);
        if (remembered && remembered !== location.pathname) {
          navigateRR(remembered, { replace: false });
          return;
        }
      }

      const target = fizrukRoutePath(result.page, result.segment);
      if (location.pathname === target) return;
      navigateRR(target, { replace: false });
    },
    [location.pathname, navigateRR, page],
  );

  return { page, segments, navigate };
}
