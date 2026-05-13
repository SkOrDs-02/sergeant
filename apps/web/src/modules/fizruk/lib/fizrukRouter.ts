// Eight top-level pages mirror `FIZRUK_NAV` in `shell/fizrukNav.ts`. Order
// loosely follows the bottom-nav surface order (dashboard / atlas / workouts
// / programs / body — with body branching to progress/measurements and
// workouts branching to exercise/<id>).
export type FizrukPage =
  | "dashboard"
  | "atlas"
  | "workouts"
  | "progress"
  | "measurements"
  | "programs"
  | "body"
  | "exercise";

const VALID_FIZRUK_PAGES: readonly FizrukPage[] = [
  "dashboard",
  "atlas",
  "workouts",
  "progress",
  "measurements",
  "programs",
  "body",
  "exercise",
];

export interface ParsedFizrukRoute {
  page: FizrukPage;
  /** Tail segment after `<page>/` — used by `exercise/<id>`. */
  segment?: string;
  redirectFrom?: string;
}

/**
 * Parse the fizruk route segments (page + optional exercise id) from any
 * source — react-router pathname (`/fizruk/workouts` → `["workouts"]`,
 * `/fizruk/exercise/abc-123` → `["exercise", "abc-123"]`), legacy hash
 * (`#workouts` → `["workouts"]`, `#exercise/abc-123` → `["exercise",
 * "abc-123"]`), or programmatic input. Centralises the validation rules so
 * the path-router (`useFizrukRoute`) and the one-time hash-compat shim
 * share them.
 *
 * Returns `{ page: "dashboard" }` for empty / unknown / malformed inputs.
 */
export function parseFizrukSegments(
  segments: readonly string[],
): ParsedFizrukRoute {
  const page = segments[0];
  if (!page) return { page: "dashboard" };
  if (!VALID_FIZRUK_PAGES.includes(page as FizrukPage)) {
    return { page: "dashboard" };
  }
  const tail = segments[1];
  if (page === "exercise" && tail) {
    return { page: "exercise", segment: tail };
  }
  return { page: page as FizrukPage };
}

/**
 * Build the route suffix **inside** the `/fizruk` namespace
 * (e.g. `"workouts"`, `"exercise/abc-123"`, `""`). Callers prepend
 * `/fizruk/` (or use `fizrukRoutePath`) and feed the result to
 * `navigate()`.
 *
 * `dashboard` is the default landing tab — encoded as the empty suffix so
 * the URL stays `/fizruk` rather than the redundant `/fizruk/dashboard`.
 */
export function buildFizrukPath(
  next: FizrukPage | null | undefined,
  segment?: string,
): string {
  const page = next || "dashboard";
  if (page === "dashboard") return "";
  if (segment) return `${page}/${segment}`;
  return page;
}

/** Absolute path for navigation: `/fizruk`, `/fizruk/workouts`, … */
export function fizrukRoutePath(
  next: FizrukPage | null | undefined,
  segment?: string,
): string {
  const suffix = buildFizrukPath(next, segment);
  return suffix ? `/fizruk/${suffix}` : "/fizruk";
}

/**
 * Legacy hash-URL parser. Kept ONLY for the one-time redirect-on-mount
 * compat shim (`useFizrukRoute`) — when a user lands on `/fizruk#workouts`
 * or `/?module=fizruk#exercise/abc-123` (PWA install / share-card / push
 * notification / Hub recommendation from before initiative 0006 §Phase 2),
 * the shim reads the hash here and rewrites the URL to the canonical
 * `/fizruk/...` form. New navigation is path-based; do NOT call this from
 * new code.
 *
 * Returns `null` (not a `dashboard`-fallback) when no hash exists, so the
 * caller can distinguish "no legacy hash to migrate" from "hash matched
 * but landed on the default tab".
 */
export function parseLegacyFizrukHash(): ParsedFizrukRoute | null {
  if (typeof window === "undefined") return null;
  const raw = (window.location.hash || "").replace(/^#\/?/, "").trim();
  if (!raw) return null;
  const segments = raw.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return parseFizrukSegments(segments);
}
