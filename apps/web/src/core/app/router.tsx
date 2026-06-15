import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./RootLayout";
import { Providers } from "./Providers";
import { PageLoader } from "./PageLoader";

/**
 * Root router config for `apps/web` (initiative 0006 — frontend routing).
 *
 * Phase 5: `RootLayout + Outlet` pattern — fixes the React Router 7
 * location-context propagation bug. Each child route renders a DIFFERENT
 * component, so React Router properly unmounts/mounts on navigation
 * and `useLocation()` always returns the current pathname.
 *
 * Architecture:
 *   RootRoute (providers)
 *    └── RootLayout (shared state + global effects + <Outlet />)
 *    ├── (index)     → HubPage      (hub home / landing at `/`)
 *    ├── /finyk/*    → FinykRoute   (lazy chunk)
 *    ├── /fizruk/*   → FizrukRoute  (lazy chunk)
 *    ├── /nutrition/* → NutritionRoute (lazy chunk)
 *    ├── /routine/*  → RoutineRoute (lazy chunk)
 *    ├── /insights/* → InsightsRoute (lazy chunk)
 *    ├── /settings/* → SettingsRoute (lazy chunk)
 *    ├── /onboarding/* → OnboardingRoute (lazy chunk)
 *    └── *           → HubPage      (standalone routes + 404)
 *
 * Module routes are matched first (React Router 7 trie resolver gives
 * priority to specific paths). The index route owns the bare `/` (a
 * splat does NOT match the empty remainder — without the index entry
 * the root URL renders an empty Outlet). The catch-all `*` handles
 * everything else: `/sign-in`, `/welcome`, `/pricing`, `/design`,
 * `/chat`, `/status`, unknown paths → 404.
 *
 * Auth contract: auth guard lives at component level (each page checks
 * `useAuth().status`), not at router level. See `AuthContext.tsx`.
 */
export function RootRoute() {
  return (
    <Providers>
      <RootLayout />
    </Providers>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootRoute />,
    // Initial hydration with lazy children renders this instead of an
    // empty tree (and silences the React Router "No HydrateFallback"
    // console warning in production).
    HydrateFallback: PageLoader,
    children: [
      // Per-module lazy routes — each renders a DIFFERENT component,
      // fixing the mixed-shape match-object bug (see Phase 2 history above).
      {
        path: "finyk/*",
        lazy: () =>
          import("../../modules/finyk/route").then((m) => ({
            Component: m.Component,
          })),
      },
      {
        path: "fizruk/*",
        lazy: () =>
          import("../../modules/fizruk/route").then((m) => ({
            Component: m.Component,
          })),
      },
      {
        path: "nutrition/*",
        lazy: () =>
          import("../../modules/nutrition/route").then((m) => ({
            Component: m.Component,
          })),
      },
      {
        path: "routine/*",
        lazy: () =>
          import("../../modules/routine/route").then((m) => ({
            Component: m.Component,
          })),
      },
      // Core surfaces that used to fall through the catch-all HubPage:
      // insights (reports), settings, and onboarding (welcome). Each now
      // owns a top-level path-based lazy chunk, same pattern as the four
      // domain modules above — a different Component per route keeps the
      // React Router 7 location-context contract intact.
      {
        path: "insights/*",
        lazy: () =>
          import("../insights/route").then((m) => ({
            Component: m.Component,
          })),
      },
      {
        path: "settings/*",
        lazy: () =>
          import("../settings/route").then((m) => ({
            Component: m.Component,
          })),
      },
      {
        path: "onboarding/*",
        lazy: () =>
          import("../onboarding/route").then((m) => ({
            Component: m.Component,
          })),
      },
      // Index route: the Hub root `/`. React Router 7 splat (`*`) does
      // NOT match the empty remainder at exactly `/`, so without this
      // entry the root URL renders an empty <Outlet /> — a blank page
      // for every direct visit to the domain root (landing, hub home,
      // PWA start_url). Same HubPage chunk as the catch-all below.
      {
        index: true,
        lazy: () => import("./HubPage").then((m) => ({ Component: m.HubPage })),
      },
      // Catch-all: standalone routes + 404.
      // Uses `Component` (not `element`) to force fresh JSX per match.
      {
        path: "*",
        lazy: () => import("./HubPage").then((m) => ({ Component: m.HubPage })),
      },
    ],
  },
]);
