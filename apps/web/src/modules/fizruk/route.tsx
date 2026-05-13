import App from "../../core/App";

/**
 * Top-level route entry for the **Fizruk** domain
 * (initiative 0006 — frontend routing, Phase 2.c).
 *
 * Why this file exists despite re-using `<App />` as the element: data-router
 * configs expect tree-shaped {@link import("react-router-dom").RouteObject}
 * entries, and the migration plan ([initiative 0006 §Phase 2](../../../../../docs/initiatives/0006-frontend-routing-and-code-split.md))
 * wants **per-module owned route definitions** (`apps/web/src/modules/<mod>/route.tsx`)
 * so that future PRs can replace `element: <App />` with a domain-local layout
 * (`element: <FizrukLayout />`) without touching the central `router.tsx`.
 *
 * For now we keep the `<App />` element so the existing provider tree
 * (`ToastProvider`, `AuthProvider`, `ApiClientProvider`, …) and the FSM in
 * `useHubNavigation` mount once and identically for both Hub URLs (`/`,
 * `/?module=fizruk`) and the new path-based ones (`/fizruk`,
 * `/fizruk/workouts`, `/fizruk/exercise/<id>`). `useHubNavigation` reads
 * `useLocation().pathname` and, when it sees `/fizruk[/...]`, sets
 * `activeModule = "fizruk"` — so `<App />` renders `<ActiveModuleView>` →
 * `<FizrukApp />` exactly as it did under the legacy `?module=fizruk` URL
 * contract. Inside `<FizrukApp />` the new `useFizrukRoute()` hook reads
 * the pathname segments to derive the page id (`dashboard` / `atlas` /
 * `workouts` / `progress` / `measurements` / `programs` / `body` /
 * `exercise/<id>`) — replacing the `useHashRoute<FizrukPage>` callsite.
 *
 * Lazy import: this module file is loaded eagerly by `router.tsx`'s
 * `lazy: () => import("...")` only when the user actually navigates to a
 * `/fizruk/*` path. Because `<App />` itself stays in the main bundle
 * (it owns the Hub), there is no chunk split happening through this entry
 * **yet** — the actual `FizrukApp` chunk is still produced by the
 * `lazyDefault(() => import("../../modules/fizruk/FizrukApp"))` call in
 * `ActiveModuleView.tsx`. Phase 5 of 0006 will move the lazy boundary into
 * this file (replace `element: <App />` with a `<Lazy>` wrapper around
 * `FizrukApp`) once the provider tree is lifted into a sibling
 * `<RootLayout>` route.
 */
export const route = {
  Component: App,
};
