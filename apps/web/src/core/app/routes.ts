/**
 * Barrel that derives `KNOWN_PATHS` — the 404-guard allowlist — from the
 * `STANDALONE_ROUTE_PATHS` set defined in `StandaloneRoutes.tsx`.
 *
 * Why a separate module?
 *
 *   `StandaloneRoutes.tsx` imports path constants from `appPaths.ts`.
 *   `appPaths.ts` must not import from `StandaloneRoutes.tsx` (that would
 *   create a circular dependency). Putting the derived set here breaks the
 *   cycle: consumers that need `KNOWN_PATHS` import from `routes.ts` rather
 *   than from `appPaths.ts`.
 *
 * Single source of truth:
 *
 *   `KNOWN_PATHS` is now auto-generated — adding a new entry to
 *   `STANDALONE_ROUTES` in `StandaloneRoutes.tsx` automatically makes it
 *   appear in `KNOWN_PATHS`. Manual edits to a hand-maintained list are no
 *   longer required (closes A7 audit item from
 *   `docs/planning/pr-plan-web-2026-05.md`).
 *
 * Import guidance:
 *   - Runtime code that tests a pathname against the 404 allowlist:
 *     import { KNOWN_PATHS } from "./routes"
 *   - Code that only needs URL constants (SIGN_IN_PATH etc.) without the
 *     full StandaloneRoutes dependency graph:
 *     import { SIGN_IN_PATH, ... } from "./appPaths"
 */

import { STANDALONE_ROUTE_PATHS } from "./StandaloneRoutes";

/**
 * All URL paths handled by the App shell. Anything outside this set AND
 * not owned by a path-based module (`isPathBasedModulePath`) receives a
 * 404 instead of silently falling through to the dashboard.
 *
 * Derived automatically from `STANDALONE_ROUTE_PATHS` — no manual
 * maintenance required. The Hub root `/` is included because the
 * LandingPage entry in `STANDALONE_ROUTES` owns it (returning `null` for
 * warm local-first / authed sessions so the Hub home keeps rendering).
 */
export const KNOWN_PATHS: ReadonlySet<string> = new Set(STANDALONE_ROUTE_PATHS);
