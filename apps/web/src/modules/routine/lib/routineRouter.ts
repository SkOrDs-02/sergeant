// Two top-level pages — calendar (default) and stats. Same shape as the
// existing `RoutineMainTab` from `context/RoutineCalendarContext.tsx`,
// re-exported here so consumers can pick either type symbol.
//
// Initiative 0006 §Phase 2.d — migrate routine from `useLocalStorageState`
// + raw `window.location.hash` deep-link shim to react-router. Pathname is
// now the canonical source of truth (`/routine` → calendar, `/routine/stats`
// → stats); localStorage is kept as a "last-active tab" memory but is no
// longer the URL-shaping authority.
export type RoutinePage = "calendar" | "stats";

const VALID_ROUTINE_PAGES: readonly RoutinePage[] = ["calendar", "stats"];

export interface ParsedRoutineRoute {
  page: RoutinePage;
}

/**
 * Parse the routine route segments (page only; routine has no sub-tabs).
 * Centralises the rules so the path-router (`useRoutineRoute`) and the
 * one-time hash-compat shim share the same parsing.
 *
 * Returns `{ page: "calendar" }` for empty / unknown / malformed inputs.
 */
export function parseRoutineSegments(
  segments: readonly string[],
): ParsedRoutineRoute {
  const page = segments[0];
  if (!page) return { page: "calendar" };
  if (!VALID_ROUTINE_PAGES.includes(page as RoutinePage)) {
    return { page: "calendar" };
  }
  return { page: page as RoutinePage };
}

/**
 * Build the route suffix **inside** the `/routine` namespace (`"stats"`,
 * `""`). Callers prepend `/routine/` (or use `routineRoutePath`).
 *
 * `calendar` is the default landing tab — encoded as the empty suffix so
 * the URL stays `/routine` rather than the redundant `/routine/calendar`.
 */
export function buildRoutinePath(next: RoutinePage | null | undefined): string {
  const page = next || "calendar";
  if (page === "calendar") return "";
  return page;
}

/** Absolute path for navigation: `/routine`, `/routine/stats`. */
export function routineRoutePath(next: RoutinePage | null | undefined): string {
  const suffix = buildRoutinePath(next);
  return suffix ? `/routine/${suffix}` : "/routine";
}

/**
 * Legacy hash-URL parser. Kept ONLY for the one-time redirect-on-mount
 * compat shim (`useRoutineRoute`) — when a user lands on `/routine#stats`
 * (PWA install / share-card / push notification / Fizruk «Запланувати
 * тренування» link from before initiative 0006 §Phase 2.d), the shim reads
 * the hash here and rewrites the URL to `/routine/stats`. New navigation
 * is path-based; do NOT call this from new code.
 *
 * Returns `null` (not a `calendar`-fallback) when no hash exists, so the
 * caller can distinguish "no legacy hash to migrate" from "hash matched
 * but landed on the default tab".
 */
export function parseLegacyRoutineHash(): ParsedRoutineRoute | null {
  if (typeof window === "undefined") return null;
  const raw = (window.location.hash || "").replace(/^#\/?/, "").trim();
  if (!raw) return null;
  const segments = raw.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return parseRoutineSegments(segments);
}
