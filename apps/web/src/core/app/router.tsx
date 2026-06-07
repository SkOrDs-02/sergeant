import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./RootLayout";

/**
 * Root router config for `apps/web` (initiative 0006 — frontend routing).
 *
 * Phase 5: `RootLayout + Outlet` pattern — fixes the React Router 7
 * location-context propagation bug. Each child route renders a DIFFERENT
 * component, so React Router properly unmounts/mounts on navigation
 * and `useLocation()` always returns the current pathname.
 *
 * Architecture:
 *   RootLayout (providers + shared state + global effects + <Outlet />)
 *    ├── /finyk/*    → FinykRoute   (lazy chunk)
 *    ├── /fizruk/*   → FizrukRoute  (lazy chunk)
 *    ├── /nutrition/* → NutritionRoute (lazy chunk)
 *    ├── /routine/*  → RoutineRoute (lazy chunk)
 *    └── *           → HubPage      (hub home + standalone routes + 404)
 *
 * Module routes are matched first (React Router 7 trie resolver gives
 * priority to specific paths). The catch-all `*` handles everything
 * else: `/`, `/sign-in`, `/welcome`, `/pricing`, `/design`, `/chat`,
 * `/status`, unknown paths → 404.
 *
 * Auth contract: auth guard lives at component level (each page checks
 * `useAuth().status`), not at router level. See `AuthContext.tsx`.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
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
      // Catch-all: hub home + standalone routes + 404.
      // Uses `Component` (not `element`) to force fresh JSX per match.
      {
        path: "*",
        lazy: () =>
          import("./HubPage").then((m) => ({ Component: m.HubPage })),
      },
    ],
  },
]);
