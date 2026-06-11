// URL path constants for the App shell.
//
// This module owns only the string constants (SIGN_IN_PATH, CHAT_PATH, etc.)
// and path-based-module helpers. `KNOWN_PATHS` — the 404-guard allowlist —
// is derived automatically in `routes.ts` from `STANDALONE_ROUTE_PATHS` so
// that adding a new route to `StandaloneRoutes.tsx` automatically updates the
// allowlist without a parallel edit here.

// Auth lives at `/sign-in` rather than as an in-page overlay. This keeps
// the FTUX splash (`/`) as the true cold-start surface — the old
// `showAuth` boolean meant that a first-time visitor who tapped
// "Вже маю акаунт" bounced into the auth form with no URL change, so
// the back button, deep links, and shared URLs all misbehaved. Having
// a named route also lets us link straight to sign-in from emails,
// push-notification landing pages, etc.
export const SIGN_IN_PATH = "/sign-in";

// Common external spellings of the auth entry (`/login`, `/signin`,
// `/auth`). Live-deploy audit 2026-06-11 showed these landing on the
// 404 page; `StandaloneRoutes.tsx` redirects each to `SIGN_IN_PATH`
// so muscle-memory URLs and stale external links keep working.
export const SIGN_IN_ALIAS_PATHS: ReadonlyArray<string> = [
  "/login",
  "/signin",
  "/auth",
];

// Assistant capability catalogue (`/help`, Settings link, `?` button in
// chat input all converge here). URL-addressable so it survives reload
// and can be deep-linked from notifications / docs.
export const ASSISTANT_PATH = "/assistant";

// Dedicated AI chat route. Replaces the fullscreen modal that used to
// slam over the dashboard. Reads `?q=` and `?autoSend=1` so launcher
// hand-offs (`InlineAiRail`'s "Open in chat" escalation, `ai-handoff`
// fallback, capability `Try in chat` CTA) and external deep links
// share one URL shape.
export const CHAT_PATH = "/chat";

// URL-addressable cold-start splash. Having a real route (not just a
// modal overlay on `/`) means the splash can be deep-linked, shows the
// right title in history/back navigation, and — crucially — renders the
// populated-hub peek behind itself instead of hovering over an empty
// dashboard.
export const WELCOME_PATH = "/welcome";

export const RESET_PASSWORD_PATH = "/reset-password";
export const PROFILE_PATH = "/profile";
export const DESIGN_PATH = "/design";
export const PRICING_PATH = "/pricing";
export const LEGAL_PRIVACY_PATH = "/legal/privacy";
export const LEGAL_TERMS_PATH = "/legal/terms";
export const LEGAL_COOKIES_PATH = "/legal/cookies";
export const LEGAL_OFFER_PATH = "/legal/offer";

// Anonymous public status page (`/status`). Renders the per-component
// view from `/api/status`. No auth — same intent as `/pricing` (public
// trust surface, must be reachable without a session).
export const STATUS_PATH = "/status";

/**
 * Modules that have graduated from `/?module=<id>` to a top-level
 * `/<id>/...` path-based URL contract (initiative 0006 §Phase 2).
 *
 * Single source of truth: both `useHubNavigation` (router-side
 * pathname → activeModule mapping + URL emission) and
 * `renderStandaloneRoute` (404 fallback exemption) read from this
 * set. When a new module migrates, add it here once; both consumers
 * pick it up automatically.
 *
 * Order: nutrition (PR #2104), finyk (PR #2108), fizruk (PR #2541),
 * routine (Phase 2.d). All four Phase 2 modules now path-based.
 */
export const PATH_BASED_MODULE_IDS: ReadonlySet<string> = new Set([
  "nutrition",
  "finyk",
  "fizruk",
  "routine",
]);

/**
 * Returns true when `pathname` is owned by a path-based module
 * (`/<id>` or `/<id>/...`). Used by `renderStandaloneRoute` to skip
 * the unknown-paths 404 for module-owned URLs — without this, the
 * App shell renders `<NotFoundPage />` for `/finyk` / `/nutrition`
 * before `useHubNavigation` gets a chance to set `activeModule`.
 *
 * Boundary: `/finykfoo` is **not** a finyk path (would otherwise
 * alias `/finykprofile` → finyk). The check splits on `/` to require
 * an exact first-segment match, mirroring `parsePathnameModule()` in
 * `useHubNavigation.ts`.
 */
export function isPathBasedModulePath(pathname: string): boolean {
  if (typeof pathname !== "string" || pathname.length < 2) return false;
  if (!pathname.startsWith("/")) return false;
  const firstSegment = pathname.slice(1).split("/", 1)[0] ?? "";
  if (!firstSegment) return false;
  return PATH_BASED_MODULE_IDS.has(firstSegment);
}
