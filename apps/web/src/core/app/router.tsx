import { createBrowserRouter } from "react-router-dom";
import App from "../App";

/**
 * Root router config for `apps/web` (initiative 0006 — frontend routing).
 *
 * Phase 1 (Phase 1 commit): мігровано з `<BrowserRouter>` на data-router API
 * (`createBrowserRouter` + `<RouterProvider />`). Один catch-all маршрут
 * `path: "*"` матчить кожен path → `<App />` стає mount-ом для всього,
 * як і було при `<BrowserRouter>`. Поточний `App.tsx` містить вбудовану FSM
 * (`useHubNavigation` + `?module=<id>` + hash), яка обробляє legacy URL.
 *
 * Phase 2 (поетапно, по PR на модуль): додаємо top-level routes
 * (`/nutrition/*`, `/finyk/*`, …) **перед** catch-all-ом. v7 trie-резолвер
 * віддає пріоритет більш специфічним маршрутам, тому `/nutrition/...`
 * матчиться першим, а решта (`/`, `/welcome`, `/sign-in`, …) лишається в
 * catch-all → `<App />`. На цьому етапі element обох гілок — той самий
 * `<App />`, бо Hub FSM (`useHubNavigation`) тепер читає `pathname` і
 * виставляє `activeModule = "nutrition"` коли URL = `/nutrition[/...]`.
 * Це означає, що провайдери (`ToastProvider`, `AuthProvider`, …) у `<App />`
 * mount-яться рівно один раз і не перемонтовуються при переходах
 * `/` → `/nutrition` → `/finyk` (RouteProvider бачить той самий element-ref
 * у RouteObject-ах і утримує DOM-mount).
 *
 * Phase 5 (cleanup): провайдери будуть підняті у спільний parent-route
 * (`element: <RootLayout />` з `<Outlet />`), а `apps/web/src/modules/<mod>/route.tsx`
 * замінять `element: <App />` на `<Lazy>`-обгортку конкретного `<XxxApp />`.
 * Тоді chunk-розщеплення піде через сам route (а не через `lazyDefault` у
 * `ActiveModuleView`), і `<App />` перестане бути shell-ом для модульних шляхів.
 *
 * Чому окремий файл, а не inline у `main.tsx`: data-router API очікує
 * config-tree (масив `RouteObject`-ів). Зберігаємо config-tree у власному
 * файлі, щоб per-domain `route.tsx`-и могли посилатись на ту саму
 * RouteObject-shape без циклів.
 */
export const router = createBrowserRouter([
  {
    path: "/nutrition/*",
    lazy: async () => {
      const m = await import("../../modules/nutrition/route");
      return m.route;
    },
  },
  {
    path: "/finyk/*",
    lazy: async () => {
      const m = await import("../../modules/finyk/route");
      return m.route;
    },
  },
  {
    path: "*",
    element: <App />,
  },
]);
