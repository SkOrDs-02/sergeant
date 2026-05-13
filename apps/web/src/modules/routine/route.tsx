import App from "../../core/App";

/**
 * Top-level route entry for the **Routine** domain
 * (initiative 0006 — frontend routing, Phase 2.d).
 *
 * Why this file exists despite re-using `<App />` as the element: data-router
 * configs expect tree-shaped {@link import("react-router-dom").RouteObject}
 * entries, and the migration plan ([initiative 0006 §Phase 2](../../../../../docs/initiatives/0006-frontend-routing-and-code-split.md))
 * wants **per-module owned route definitions** (`apps/web/src/modules/<mod>/route.tsx`)
 * so that future PRs can replace `element: <App />` with a domain-local layout
 * (`element: <RoutineLayout />`) without touching the central `router.tsx`.
 *
 * For now we keep the `<App />` element so the existing provider tree
 * (`ToastProvider`, `AuthProvider`, `ApiClientProvider`, …) and the FSM in
 * `useHubNavigation` mount once and identically for both Hub URLs (`/`,
 * `/?module=routine`) and the new path-based ones (`/routine`,
 * `/routine/stats`). `useHubNavigation` reads `useLocation().pathname` and,
 * when it sees `/routine[/...]`, sets `activeModule = "routine"` — so
 * `<App />` renders `<ActiveModuleView>` → `<RoutineApp />` exactly as it
 * did under the legacy `?module=routine` URL contract. Inside `<RoutineApp />`
 * the new `useRoutineRoute()` hook reads the pathname segments to derive
 * the main-tab id (`calendar` / `stats`) — replacing the raw
 * `window.location.hash` deep-link shim that previously seeded the
 * `useLocalStorageState`-backed tab.
 *
 * Lazy import: this module file is loaded eagerly by `router.tsx`'s
 * `lazy: () => import("...")` only when the user actually navigates to a
 * `/routine/*` path. Because `<App />` itself stays in the main bundle
 * (it owns the Hub), there is no chunk split happening through this entry
 * **yet** — the actual `RoutineApp` chunk is still produced by the
 * `lazyDefault(() => import("../../modules/routine/RoutineApp"))` call in
 * `ActiveModuleView.tsx`. Phase 5 of 0006 will move the lazy boundary into
 * this file (replace `element: <App />` with a `<Lazy>` wrapper around
 * `RoutineApp`) once the provider tree is lifted into a sibling
 * `<RootLayout>` route.
 */
export const route = {
  Component: App,
};
