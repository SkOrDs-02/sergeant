import { createBrowserRouter } from "react-router-dom";
import App from "../App";

/**
 * Root router config for `apps/web` (initiative 0006 — frontend routing).
 *
 * Phase 1 (this file): мігруємо з `<BrowserRouter>` (declarative routes
 * у `<App />`) на data-router API (`createBrowserRouter` +
 * `<RouterProvider />`). Це **NOOP-міграція** — поточний `App.tsx`
 * містить вбудовану FSM (`useHubNavigation` + `?module=<id>` + hash),
 * яка обробляє всі поточні URL-патерни. Один catch-all маршрут
 * `path: "*"` матчить кожен path → `<App />` стає mount-ом для всього,
 * як і було при `<BrowserRouter>`.
 *
 * Чому окремий файл, а не inline у `main.tsx`: data-router API очікує
 * config-tree (масив `RouteObject`-ів). Інкрементальні фази 0006 будуть
 * додавати top-level routes (`/finyk/*`, `/fizruk/*`, …) **до**
 * catch-all-у — більш специфічні маршрути матчаться першими у
 * v7 trie-резолвері, тому новий `/finyk/*` "перехоплюватиме" свій
 * шлях, а решта (`/`, `/welcome`, `/sign-in`, …) лишається в `<App />`,
 * допоки відповідна фаза не випиляє цей шлях у власну гілку.
 *
 * Що з провайдерами (`ToastProvider`, `AuthProvider`, …): вони лишаються
 * **всередині** `<App />` поки що. Це означає, що при майбутньому додаванні
 * sibling-маршрутів (фаза 2) їх треба буде підняти у спільний parent-route
 * (`element: <RootLayout />` з `<Outlet />`), щоб контекст не
 * перемонтовувався при міжмаршрутних переходах. Зараз — `path: "*"` дає
 * один елемент, що матчиться завжди, тож провайдери mount-яться рівно
 * один раз при cold-start.
 */
export const router = createBrowserRouter([
  {
    path: "*",
    element: <App />,
  },
]);
