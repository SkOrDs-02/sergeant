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
 * Phase 2 history (revisited 2026-05-16): попередня версія цього файлу
 * додавала окремі lazy routes для кожного модуля
 * (`/nutrition/*`, `/finyk/*`, `/fizruk/*`, `/routine/*`) перед catch-all-ом.
 * Кожен з них резолвив через `lazy()` до `{Component: App}` — тобто рендерив
 * РІВНО ТОЙ САМИЙ `<App />` компонент, як і catch-all. Це створювало
 * непомітну, але руйнівну патологію у React Router 7-му:
 *
 *   • При in-app `navigate("/sign-in")` з module-pathname (`/fizruk`,
 *     `/finyk/transactions` тощо) router міняв matched route з module-id (2)
 *     на catch-all-id (4). Component той самий → React reconciler reuse-ить
 *     `<App />` instance. Але route-level lazy-resolve у попередньому маршруті
 *     встиг конвертувати `{Component: App}` у внутрішній `element: <App />`
 *     (підтверджено через `router.state.matches[0].route` —
 *     `hasComponent: false, hasLazy: false, hasElement: true`). Через цей
 *     mixed-shape match-обʼєкт **`location`-context оновлюється у data-router-і,
 *     але не propagate-иться у дереві під element-only routes** — `useLocation()`
 *     у будь-якого consumer-а (`StandaloneRoutes`, `useHubNavigation`,
 *     `useFizrukRoute`, `useFinykRoute`, `HubBottomNav` через `onChange`)
 *     повертає stale pathname. URL у адресній стрічці змінюється, контент
 *     залишається старим. Сторінки модулів і `/sign-in` тоді «не відкриваються».
 *
 *   • Code-splitting через ці lazy-обгортки нічого не давав — справжній
 *     модульний chunk-split іде через `lazyDefault(() => import(
 *     "../../modules/<id>/<X>App"))` у `ActiveModuleView.tsx`. Дублююча
 *     route-level lazy-layer-а додавала тільки race-condition без виграшу.
 *
 * Тому повертаємо до Phase-1 shape — один catch-all → `<App />` для будь-якого
 * pathname. `useHubNavigation` усе ще читає pathname і коректно встановлює
 * `activeModule` для `/fizruk[/...]`, `/finyk[/...]` etc. (його логіка
 * `parsePathnameModule` не змінюється — модульні URL-и працюють як раніше,
 * просто без зайвої route-level lazy-обгортки). `StandaloneRoutes` так само
 * матчить `/sign-in`, `/welcome`, `/pricing` тощо.
 *
 * Phase 5 (cleanup, перенесено) — після того як провайдери будуть підняті
 * у спільний parent-route (`element: <RootLayout />` з `<Outlet />`),
 * модульні маршрути можуть повернутися як справжні nested routes з
 * `<Outlet>`-композицією. Поки що цього робити не варто — той самий
 * `<App />` має лишатися mount-ом для авторизованого і неавторизованого
 * стану (sign-in, welcome, app), і RouterProvider-у достатньо одного entry.
 *
 * Auth contract: немає guard-компонента на рівні роутера — це навмисно.
 * Підняти `<AuthProvider>` вище за router і обгорнути всі маршрути в один
 * `<ProtectedRoute>` зараз неможливо: той самий `<App />` є mount-ом для
 * авторизованого і неавторизованого стану (sign-in, welcome, app). Тому
 * захист реалізований на рівні компонент: кожна сторінка, яка рендерить
 * чутливий UI, зобов'язана викликати `const { status } = useAuth()` і
 * повернути редирект/заглушку при `status !== "authenticated"`.
 * Джерело правди: `apps/web/src/core/auth/AuthContext.tsx`.
 */
export const router = createBrowserRouter([
  {
    path: "*",
    element: <App />,
  },
]);
