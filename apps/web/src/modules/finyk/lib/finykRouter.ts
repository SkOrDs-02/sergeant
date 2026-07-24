// Five top-level pages — order mirrors `NAV_ITEMS` in `components/finykNav.tsx`
// (overview · transactions · budgets · analytics · assets). `payments` is a
// legacy synonym for `budgets` (kept to keep older Hub recommendations and
// share-cards working through the Phase-3 hash-redirect shim).
export type FinykPage =
  | "overview"
  | "transactions"
  | "budgets"
  | "analytics"
  | "assets";

const VALID_FINYK_PAGES: readonly FinykPage[] = [
  "overview",
  "transactions",
  "budgets",
  "analytics",
  "assets",
];

const LEGACY_REDIRECTS: Record<string, FinykPage> = {
  payments: "budgets",
};

export interface ParsedFinykRoute {
  page: FinykPage;
  redirectFrom?: string;
}

/**
 * Parse the finyk route segments (page only; finyk has no sub-tabs) from any
 * source — react-router pathname (`/finyk/budgets` → `["budgets"]`), legacy
 * hash (`#budgets` → `["budgets"]`, `#/budgets` → `["budgets"]`), or
 * programmatic input. Centralises the legacy-redirect dictionary so the
 * path-router (`useFinykRoute`) and the one-time hash-compat shim share the
 * same rules.
 *
 * Returns `{ page: "overview" }` for empty / unknown / malformed inputs.
 */
export function parseFinykSegments(
  segments: readonly string[],
): ParsedFinykRoute {
  const page = segments[0];
  if (!page) return { page: "overview" };
  const redirect = LEGACY_REDIRECTS[page];
  if (redirect) return { page: redirect, redirectFrom: page };
  if (!VALID_FINYK_PAGES.includes(page as FinykPage)) {
    return { page: "overview" };
  }
  return { page: page as FinykPage };
}

/**
 * Build the route suffix **inside** the `/finyk` namespace (e.g. `"budgets"`,
 * `""`). Callers prepend `/finyk/` (or use `finykRoutePath`) and feed the
 * result to `navigate()`.
 *
 * `overview` is the default landing tab — encoded as the empty suffix so the
 * URL stays `/finyk` rather than the redundant `/finyk/overview`.
 */
export function buildFinykPath(next: FinykPage | null | undefined): string {
  const page = next || "overview";
  if (page === "overview") return "";
  return page;
}

/** Absolute path for navigation: `/finyk`, `/finyk/budgets`, … */
export function finykRoutePath(next: FinykPage | null | undefined): string {
  const suffix = buildFinykPath(next);
  return suffix ? `/finyk/${suffix}` : "/finyk";
}

/**
 * Legacy hash-URL parser. Kept ONLY for the one-time redirect-on-mount compat
 * shim (`useFinykRoute`) — when a user lands on `/finyk#budgets` (PWA install
 * / share-card / push notification / Hub recommendation from before
 * initiative 0006 §Phase 2), the shim reads the hash here and rewrites the
 * URL to `/finyk/budgets`. New navigation is path-based; do NOT call this
 * from new code.
 *
 * Also captures the legacy `?cat=…` query param that lived inside the hash
 * (`#budgets?cat=smoking`) so the migration shim can hoist it to the regular
 * URL search-params (`/finyk/budgets?cat=smoking`).
 *
 * Returns `null` (not an `overview`-fallback) when no hash exists, so the
 * caller can distinguish "no legacy hash to migrate" from "hash matched but
 * landed on the default tab".
 */
export function parseLegacyFinykHash():
  | (ParsedFinykRoute & { search?: string })
  | null {
  if (typeof window === "undefined") return null;
  const raw = (window.location.hash || "").replace(/^#\/?/, "").trim();
  if (!raw) return null;
  // `#budgets?cat=smoking` → page="budgets", search="cat=smoking"
  const [head, search] = raw.split("?", 2);
  const segments = (head ?? "").split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const parsed = parseFinykSegments(segments);
  return search ? { ...parsed, search } : parsed;
}
