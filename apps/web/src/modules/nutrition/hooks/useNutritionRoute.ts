import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildNutritionPath,
  nutritionRoutePath,
  parseLegacyNutritionHash,
  parseNutritionSegments,
  type NutritionPage,
  type PantrySubTab,
  type MenuSubTab,
} from "../lib/nutritionRouter";

/**
 * Public shape kept stable for `NutritionApp.tsx` callers — the legacy
 * hook (`useNutritionHashRoute`) returned the same field names so that
 * initiative 0006 §Phase 2 nutrition migration is a drop-in source-level
 * swap. Behaviour: setters now navigate via `react-router` instead of
 * mutating `window.location.hash`. State is derived from the URL each
 * render — no separate `useState`-shadow.
 */
export interface UseNutritionRouteResult {
  activePage: NutritionPage;
  setActivePage: (page: NutritionPage) => void;
  setActivePageAndHash: (page: NutritionPage, subTab?: string) => void;
  /** Current sub-tab parsed from path (e.g. `/nutrition/pantry/shopping`). */
  pantrySubTab: PantrySubTab;
  menuSubTab: MenuSubTab;
  setPantrySubTab: (sub: PantrySubTab) => void;
  setMenuSubTab: (sub: MenuSubTab) => void;
}

/**
 * Splits the pathname into nutrition route segments. The route is mounted
 * as `/nutrition/*` in `apps/web/src/core/app/router.tsx`, so:
 *   `/nutrition`           → `[]`
 *   `/nutrition/log`       → `["log"]`
 *   `/nutrition/pantry/shopping` → `["pantry", "shopping"]`
 *
 * Anything outside `/nutrition` returns `[]` (the hook treats it as the
 * default `start` tab — this branch only fires during transient
 * navigations, the `<App />` shell unmounts NutritionApp before the next
 * render in practice).
 */
function pathnameToSegments(pathname: string): string[] {
  if (!pathname.startsWith("/nutrition")) return [];
  const tail = pathname.slice("/nutrition".length);
  if (tail === "" || tail === "/") return [];
  if (!tail.startsWith("/")) return [];
  return tail.slice(1).split("/").filter(Boolean);
}

export function useNutritionRoute(): UseNutritionRouteResult {
  const location = useLocation();
  const navigate = useNavigate();

  const parsed = useMemo(
    () => parseNutritionSegments(pathnameToSegments(location.pathname)),
    [location.pathname],
  );

  const activePage = parsed.page;
  const pantrySubTab: PantrySubTab =
    parsed.page === "pantry" && parsed.subTab
      ? (parsed.subTab as PantrySubTab)
      : "items";
  const menuSubTab: MenuSubTab =
    parsed.page === "menu" && parsed.subTab
      ? (parsed.subTab as MenuSubTab)
      : "plan";

  // Hash compat: when a legacy URL (`/nutrition#log`, `/nutrition#pantry/shopping`,
  // or even `/?module=nutrition#log`) lands on this hook, rewrite to the
  // equivalent path-based URL and clear the hash. One-shot per mount —
  // afterwards all navigation is path-based.
  const compatRedirected = useRef(false);
  useEffect(() => {
    if (compatRedirected.current) return;
    compatRedirected.current = true;
    const legacy = parseLegacyNutritionHash();
    if (!legacy) return;
    const target = nutritionRoutePath(legacy.page, legacy.subTab);
    // Strip the hash so `/nutrition#log` doesn't keep firing on every
    // hashchange. `replace: true` because this is bookkeeping, not a
    // user-visible navigation step.
    navigate(target, { replace: true });
  }, [navigate]);

  // Path-based navigation. `replace: false` everywhere — sub-tab
  // switches need a back-button entry, same as the previous hash
  // behaviour (`window.location.hash = ...` always pushes a history
  // entry).
  const navigateToPage = useCallback(
    (page: NutritionPage, subTab?: string) => {
      const target = nutritionRoutePath(page, subTab);
      if (location.pathname === target) return;
      navigate(target, { replace: false });
    },
    [location.pathname, navigate],
  );

  // `setActivePage` historically did NOT update the URL — only
  // `setActivePageAndHash` did. Preserve that asymmetry: callers that
  // want a URL-bearing transition must use the explicit name.
  // Internally we still emit a navigate so deep-linking works, since
  // `setActivePage` was, in practice, only used as a follow-up to a
  // navigation that already happened (e.g. legacy redirect handling).
  const setActivePage = useCallback(
    (page: NutritionPage) => {
      navigateToPage(page);
    },
    [navigateToPage],
  );

  const setActivePageAndHash = useCallback(
    (page: NutritionPage, subTab?: string) => {
      navigateToPage(page, subTab);
    },
    [navigateToPage],
  );

  const setPantrySubTab = useCallback(
    (sub: PantrySubTab) => {
      const suffix = buildNutritionPath(
        "pantry",
        sub === "items" ? undefined : sub,
      );
      const target = suffix ? `/nutrition/${suffix}` : "/nutrition";
      if (location.pathname === target) return;
      navigate(target, { replace: false });
    },
    [location.pathname, navigate],
  );

  const setMenuSubTab = useCallback(
    (sub: MenuSubTab) => {
      const suffix = buildNutritionPath(
        "menu",
        sub === "plan" ? undefined : sub,
      );
      const target = suffix ? `/nutrition/${suffix}` : "/nutrition";
      if (location.pathname === target) return;
      navigate(target, { replace: false });
    },
    [location.pathname, navigate],
  );

  return {
    activePage,
    setActivePage,
    setActivePageAndHash,
    pantrySubTab,
    menuSubTab,
    setPantrySubTab,
    setMenuSubTab,
  };
}
