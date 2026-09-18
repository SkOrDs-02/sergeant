import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PATH_BASED_MODULE_IDS } from "./appPaths";

/**
 * One-time legacy-hash-URL compat shim (initiative 0006 §Phase 3).
 *
 * Before Phase 2 the four primary modules (nutrition, finyk, fizruk,
 * routine) lived under the `/?module=<id>#<page>` URL contract. PWA
 * installs from that era, share-cards, push notifications, browser
 * bookmarks and the in-OS «Home Screen» icons all baked the hash
 * shape into stable user-visible URLs. After Phase 2 the canonical
 * shape is `/<module>/<page>`.
 *
 * The four module-level routers (`useNutritionRoute`, `useFinykRoute`,
 * `useFizrukRoute`, `useRoutineRoute`) each handle the **in-module**
 * legacy form (`/fizruk#workouts` → `/fizruk/workouts`). This
 * component handles the **root-level** legacy form where the entire
 * route lived in the hash (`https://app.example/#fizruk/workouts`
 * → `/fizruk/workouts`). It runs only when the current pathname is
 * the root (`/`) and the hash is non-empty AND its first segment
 * matches a known path-based module id (see `PATH_BASED_MODULE_IDS`).
 * Anything else is left alone so legacy non-module hashes (e.g.
 * `/#welcome` from an older onboarding link) keep their existing
 * behaviour.
 *
 * UX-stutter: the redirect is a single `navigate(..., { replace: true })`
 * call inside a mount effect. The user sees the splash/loader for a
 * frame before the router transitions to the canonical URL. Phase 4
 * (`<ScrollRestoration />` + `prefetch="hover"`) will smooth this
 * over by preloading the destination chunk; until then the splash is
 * the same screen the user would see for any cold load.
 *
 * One-shot: the ref guard ensures we never run the redirect twice
 * even if React StrictMode double-mounts the component. After the
 * first run the hook is a no-op for the lifetime of this tab.
 */
export function HashRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    if (typeof window === "undefined") return;
    // Only act on root-level legacy hashes. In-module hashes
    // (`/fizruk#workouts`, `/finyk#budgets`, etc.) are handled by the
    // module's own redirect-on-mount shim — running both would
    // double-navigate and lose query params.
    if (location.pathname !== "/") return;
    const target = parseRootLegacyHash(window.location.hash);
    if (!target) return;
    navigate(target, { replace: true });
  }, [location.pathname, navigate]);

  return null;
}

/**
 * Parses the root-level legacy hash form, e.g.
 *   `#fizruk/workouts`           → `/fizruk/workouts`
 *   `#/fizruk/exercise/12`       → `/fizruk/exercise/12`
 *   `#finyk/budgets?cat=smoking` → `/finyk/budgets?cat=smoking`
 *
 * Returns `null` for empty hashes, malformed input, or hashes whose
 * first segment is not a known path-based module id. The
 * `PATH_BASED_MODULE_IDS` guard keeps the shim narrowly scoped to
 * the legacy URL surface we're migrating from — other hashes
 * (`/#welcome`, `/#section-2` on a marketing page) keep their
 * existing semantics.
 */
export function parseRootLegacyHash(rawHash: string): string | null {
  if (!rawHash) return null;
  const trimmed = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  // `#/fizruk/workouts` and `#fizruk/workouts` both mean the same
  // thing — strip a leading slash so the first non-empty segment is
  // always the module id.
  const normalized = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  if (!normalized) return null;
  // Split off any query string (`#finyk/budgets?cat=smoking`) and
  // preserve it on the redirected URL — share-cards from the legacy
  // contract use that param to scroll to a specific entry.
  const queryIndex = normalized.indexOf("?");
  const pathPart =
    queryIndex === -1 ? normalized : normalized.slice(0, queryIndex);
  const queryPart = queryIndex === -1 ? "" : normalized.slice(queryIndex);
  const firstSegment = pathPart.split("/", 1)[0] ?? "";
  if (!firstSegment) return null;
  if (!PATH_BASED_MODULE_IDS.has(firstSegment)) return null;
  return `/${pathPart}${queryPart}`;
}
