import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  finykRoutePath,
  parseFinykSegments,
  parseLegacyFinykHash,
  type FinykPage,
} from "../lib/finykRouter";

/**
 * Path-based router for the Finyk module (initiative 0006 §Phase 2.b
 * migration of `useHashRouter` → react-router). Page id lives in the URL
 * pathname (`/finyk/budgets`) so deep-links from other modules
 * (e.g. Hub recommendations) can target a specific Finyk page directly.
 *
 * Public shape kept stable for `FinykApp.tsx`: returns `[page, navigate]`
 * so the call-site swap is a one-line import change.
 *
 * Accepted legacy shapes (one-time redirect on mount):
 *   - `/finyk#overview`             → `/finyk`
 *   - `/finyk#budgets?cat=smoking`  → `/finyk/budgets?cat=smoking`
 *   - `/finyk#/budgets`             → `/finyk/budgets`
 *   - `/finyk#payments`             → `/finyk/budgets` (legacy alias)
 *
 * Unknown ids fall back to `defaultPage` (default `"overview"`).
 */
export function useFinykRoute(
  defaultPage: FinykPage = "overview",
): [FinykPage, (p: FinykPage | string) => void] {
  const location = useLocation();
  const navigate = useNavigate();

  const page = useMemo(() => {
    const segments = pathnameToSegments(location.pathname);
    if (segments.length === 0) return defaultPage;
    return parseFinykSegments(segments).page;
  }, [location.pathname, defaultPage]);

  // Hash compat: when a legacy URL (`/finyk#budgets`, `/finyk#budgets?cat=…`,
  // `/finyk#/budgets`, `/finyk#payments`) lands on this hook, rewrite to the
  // equivalent path-based URL (hoisting the legacy in-hash query params to
  // the regular search-params) and clear the hash. One-shot per mount —
  // afterwards all navigation is path-based.
  const compatRedirected = useRef(false);
  useEffect(() => {
    if (compatRedirected.current) return;
    compatRedirected.current = true;
    const legacy = parseLegacyFinykHash();
    if (!legacy) return;
    const target = legacy.search
      ? `${finykRoutePath(legacy.page)}?${legacy.search}`
      : finykRoutePath(legacy.page);
    // Strip the hash so `/finyk#budgets` doesn't keep firing on every
    // hashchange. `replace: true` because this is bookkeeping, not a
    // user-visible navigation step.
    navigate(target, { replace: true });
  }, [navigate]);

  const navigateToPage = useCallback(
    (p: FinykPage | string) => {
      // Accept either a typed `FinykPage` (preferred) or a raw string. The
      // string branch lets `NAV_IDS[idx]` swipe-navigation in `FinykApp`
      // pass values through without an extra cast — `parseFinykSegments`
      // validates and falls back to `overview` for unknown ids.
      const parsed = parseFinykSegments([p]);
      const target = finykRoutePath(parsed.page);
      if (location.pathname === target) return;
      navigate(target, { replace: false });
    },
    [location.pathname, navigate],
  );

  return [page, navigateToPage];
}

/**
 * Reads a single query param from the URL search-string
 * (`/finyk/budgets?cat=smoking` → `useFinykQueryParam("cat") === "smoking"`).
 * Used by deep-links from Hub insights so an "Відкрити" tap can scroll the
 * Budgets page to the exact limit the recommendation is about.
 *
 * The legacy hash form (`/finyk#budgets?cat=smoking`) is hoisted to the URL
 * search-params by the redirect-on-mount shim in `useFinykRoute`, so by the
 * time this hook reads the value the param lives in the canonical place.
 */
export function useFinykQueryParam(name: string): string | null {
  const [searchParams] = useSearchParams();
  return searchParams.get(name);
}

/**
 * Splits the pathname into finyk route segments. The route is mounted as
 * `/finyk/*` in `apps/web/src/core/app/router.tsx`, so:
 *   `/finyk`           → `[]`
 *   `/finyk/budgets`   → `["budgets"]`
 *
 * Anything outside `/finyk` returns `[]` (the hook treats it as the default
 * `overview` tab — this branch only fires during transient navigations, the
 * `<App />` shell unmounts FinykApp before the next render in practice).
 */
function pathnameToSegments(pathname: string): string[] {
  if (!pathname.startsWith("/finyk")) return [];
  const tail = pathname.slice("/finyk".length);
  if (tail === "" || tail === "/") return [];
  if (!tail.startsWith("/")) return [];
  return tail.slice(1).split("/").filter(Boolean);
}
