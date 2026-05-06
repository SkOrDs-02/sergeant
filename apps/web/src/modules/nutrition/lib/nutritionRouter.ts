// Five-tab structure after UX audit: start / pantry / log / menu
// (merge of plan+recipes). Shopping now lives as an internal tab inside
// pantry, so `shop` redirects to `pantry`. Legacy `plan` and `recipes`
// both redirect to `menu`.
export type NutritionPage = "start" | "pantry" | "log" | "menu";

const VALID_NUTRITION_PAGES: readonly NutritionPage[] = [
  "start",
  "pantry",
  "log",
  "menu",
];

const LEGACY_REDIRECTS: Record<string, NutritionPage> = {
  products: "pantry",
  plan: "menu",
  recipes: "menu",
  shop: "pantry",
};

/** Valid sub-tab ids per page. Only pages that have sub-tabs are listed. */
export type PantrySubTab = "items" | "shopping";
export type MenuSubTab = "plan" | "recipes";

const VALID_PANTRY_SUBS: readonly string[] = ["items", "shopping"];
const VALID_MENU_SUBS: readonly string[] = ["plan", "recipes"];

export interface ParsedNutritionRoute {
  page: NutritionPage;
  /** Sub-tab segment parsed from `<page>/<sub>`. `undefined` when absent. */
  subTab?: string;
  redirectFrom?: string;
}

/**
 * Parse the nutrition route segments (page + optional sub-tab) from any
 * source — react-router pathname (`/nutrition/log` →
 * `["log"]`), legacy hash (`#pantry/shopping` → `["pantry", "shopping"]`),
 * or programmatic input. Centralises the redirect dictionary so the
 * path-router (`useNutritionRoute`) and the one-time hash-compat shim
 * share the same rules.
 *
 * Returns `{ page: "start" }` for empty / unknown / malformed inputs.
 */
export function parseNutritionSegments(
  segments: readonly string[],
): ParsedNutritionRoute {
  const page = segments[0];
  const sub = segments[1];
  if (!page) return { page: "start" };
  const redirect = LEGACY_REDIRECTS[page];
  if (redirect) return { page: redirect, redirectFrom: page };
  if (!VALID_NUTRITION_PAGES.includes(page as NutritionPage)) {
    return { page: "start" };
  }
  let validSub: string | undefined;
  if (page === "pantry" && sub && VALID_PANTRY_SUBS.includes(sub)) {
    validSub = sub;
  } else if (page === "menu" && sub && VALID_MENU_SUBS.includes(sub)) {
    validSub = sub;
  }
  return { page: page as NutritionPage, subTab: validSub };
}

/**
 * Build the route suffix **inside** the `/nutrition` namespace
 * (e.g. `"log"`, `"pantry/shopping"`, `""`). Callers prepend
 * `/nutrition/` (or use `nutritionRoutePath`) and feed the result to
 * `navigate()`.
 *
 * `start` is the default landing tab — encoded as the empty suffix so
 * the URL stays `/nutrition` rather than the redundant `/nutrition/start`.
 */
export function buildNutritionPath(
  next: NutritionPage | null | undefined,
  subTab?: string,
): string {
  const page = next || "start";
  if (page === "start") return "";
  if (subTab) return `${page}/${subTab}`;
  return page;
}

/** Absolute path for navigation: `/nutrition`, `/nutrition/log`, … */
export function nutritionRoutePath(
  next: NutritionPage | null | undefined,
  subTab?: string,
): string {
  const suffix = buildNutritionPath(next, subTab);
  return suffix ? `/nutrition/${suffix}` : "/nutrition";
}

/**
 * Legacy hash-URL parser. Kept ONLY for the one-time redirect-on-mount
 * compat shim (`useNutritionRoute`) — when a user lands on
 * `/nutrition#log` (PWA install / share-card / push notification from
 * before initiative 0006 §Phase 2), the shim reads the hash here and
 * rewrites the URL to `/nutrition/log`. New navigation is path-based;
 * do NOT call this from new code.
 *
 * Returns `null` (not a `start`-fallback) when no hash exists, so the
 * caller can distinguish "no legacy hash to migrate" from "hash matched
 * but landed on the default tab".
 */
export function parseLegacyNutritionHash(): ParsedNutritionRoute | null {
  if (typeof window === "undefined") return null;
  const raw = (window.location.hash || "").replace(/^#/, "").trim();
  if (!raw || raw.startsWith("/")) return null;
  const segments = raw.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return parseNutritionSegments(segments);
}
