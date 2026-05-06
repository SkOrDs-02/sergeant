import App from "../../core/App";

/**
 * Top-level route entry for the **Finyk** domain
 * (initiative 0006 — frontend routing, Phase 2.b).
 *
 * Why this file exists despite re-using `<App />` as the element: data-router
 * configs expect tree-shaped {@link import("react-router-dom").RouteObject}
 * entries, and the migration plan ([initiative 0006 §Phase 2](../../../../../docs/initiatives/0006-frontend-routing-and-code-split.md))
 * wants **per-module owned route definitions** (`apps/web/src/modules/<mod>/route.tsx`)
 * so that future PRs can replace `element: <App />` with a domain-local layout
 * (`element: <FinykLayout />`) without touching the central `router.tsx`.
 *
 * For now we keep the `<App />` element so the existing provider tree
 * (`ToastProvider`, `AuthProvider`, `ApiClientProvider`, …) and the FSM in
 * `useHubNavigation` mount once and identically for both Hub URLs (`/`,
 * `/?module=finyk`) and the new path-based ones (`/finyk`, `/finyk/budgets`,
 * `/finyk/budgets?cat=smoking`). `useHubNavigation` reads
 * `useLocation().pathname` and, when it sees `/finyk[/...]`, sets
 * `activeModule = "finyk"` — so `<App />` renders `<ActiveModuleView>` →
 * `<FinykApp />` exactly as it did under the legacy `?module=finyk` URL
 * contract. Inside `<FinykApp />` the new `useFinykRoute()` hook reads the
 * pathname segments to derive the page id (`overview` / `transactions` /
 * `budgets` / `analytics` / `assets`) — replacing the `useHashRouter`
 * `window.location.hash` reads we used pre-Phase-2.b.
 *
 * Lazy import: this module file is loaded eagerly by `router.tsx`'s
 * `lazy: () => import("...")` only when the user actually navigates to a
 * `/finyk/*` path. Because `<App />` itself stays in the main bundle
 * (it owns the Hub), there is no chunk split happening through this entry
 * **yet** — the actual `FinykApp` chunk is still produced by the
 * `lazyDefault(() => import("../../modules/finyk/FinykApp"))` call in
 * `ActiveModuleView.tsx`. Phase 5 of 0006 will move the lazy boundary into
 * this file (replace `element: <App />` with a `<Lazy>` wrapper around
 * `FinykApp`) once the provider tree is lifted into a sibling
 * `<RootLayout>` route.
 */
export const route = {
  Component: App,
};
