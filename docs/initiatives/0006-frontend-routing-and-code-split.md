# 0006 — Frontend routing migration + route-based code-split

> **Status:** Proposed
> **Priority:** P1 (Sprint 2)
> **Owner:** `@Skords-01`
> **ETA:** 2 weeks
> **Sources:** Design Review 2026-05-03 §6, [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md)

## TL;DR

`apps/web` сьогодні стоїть на **самописному hash-router-і** (`useHashRouter` у кожному модулі) + `manualChunks` у `vite.config.js`. Bundle ділиться на vendor-чанки, але кожен модуль все одно завантажується відразу — у `App.tsx` всі `lazyImport`-и матеріалізуються після першого hub-екрану. Це блокує Performance budget (≤820 KB initial), а bundle-gate доводиться раз у раз перенастроювати.

План — мігрувати на `react-router@7` з file-based / object-config routes, ввести **route-based code-split** через `React.lazy` per top-level route, і прибрати `useHashRouter` з модулів. Hash-URL зберігаємо як **fallback** (compat для PWA install / deep-links), але внутрішня навігація — звичайні URL.

## Чому зараз

- Current hash-router НЕ підтримує: nested routes, route-loaders, scroll-restore, prefetch на hover, нормальні deep-links у share-/push-нотифікаціях.
- Bundle gate ≤820 KB ([`scripts/bundle-size-guard.ts`](../../scripts/bundle-size-guard.ts)) тримається тільки тому, що ми переписуємо `manualChunks` під кожний реліз — це brittle.
- 165 модулів у `apps/web`. Багато з них (Fizruk Workouts, Nutrition Recipes, Insights) рідко відкривають у одній сесії — їх можна не завантажувати взагалі. Тільки lazy-load доменна папка.
- `App.tsx` зараз — провайдер-вертоліт + ручна switch-стейт-машина «який модуль зараз активний» (велика частина логіки в `core/app/`). Це **не** навігація, це fragile FSM.
- Без route-loader-ів prefetch RQ-даних відбувається тільки після того, як модуль уже у frame; UX-stutter на перших переходах.

## Скоуп

**In:**

1. Залежність `react-router@7` (data-router API), повна object-config tree.
2. Top-level routes (точкове розбиття):
   - `/` — Hub
   - `/finyk/*` — Finyk
   - `/fizruk/*` — Fizruk
   - `/nutrition/*` — Nutrition
   - `/routine/*` — Routine
   - `/insights/*` — Insights
   - `/settings/*` — Settings
   - `/onboarding/*` — Onboarding
3. Per-route `React.lazy()` import → окремий chunk per top-level domain.
4. Route-loaders (`loader: () => queryClient.ensureQueryData(...)`) для prefetch критичних даних до render-у.
5. Hash-URL compat: `<HashRedirect />` middleware, що якщо є `#finyk/...` — конвертує у `/finyk/...` без втрати state.
6. Scroll restoration з [react-router scrollRestoration](https://reactrouter.com/en/main/components/scroll-restoration).
7. Видалити `useHashRouter` із модулів (всі use-call-sites).
8. Bundle gate перенастроїти на per-route budget: `initial ≤ 350 KB`, `per-route ≤ 250 KB`.

**Out:**

- Server-side rendering / streaming — non-goal. PWA local-first мисcia не потребує SSR.
- React Server Components — окремий разовий епік (потенційно P3).
- Route transitions / view transitions API — окрема ініціатива (UX-only).
- Mobile RN routing — відмінні навігаційні стек-моделі (React Navigation), не входить.

## План змін

### Фаза 1 — `react-router` setup + Hub-route (1 PR)

**PR `feat-react-router-setup`:**

- `pnpm add -F @sergeant/web react-router@^7`.
- `apps/web/src/core/app/router.tsx` — root config:
  ```ts
  export const router = createBrowserRouter([
    { path: "/", element: <Hub />, errorElement: <ErrorBoundary />, children: [] },
  ]);
  ```
- В `App.tsx` замінити custom shell на `<RouterProvider router={router} />`.
- Маршрут `/` лишається з тим же контентом (Hub) — це NOOP-міграція для ліквідації регресій.
- ESLint rule `no-hash-router-in-modules` (preview, warn-only): warning якщо у `apps/web/src/modules/**` зустрічається `import { useHashRouter }`.

### Фаза 2 — top-level routes per domain (4 PRs, по одному модулю)

**PR `feat-route-finyk`, `feat-route-fizruk`, `feat-route-nutrition`, `feat-route-routine`:**

- Для кожного модуля (по одному PR):
  - Створити `apps/web/src/modules/<mod>/route.tsx` з `Lazy<>` wrapper.
  - У `router.tsx` додати:
    ```ts
    {
      path: "/finyk/*",
      lazy: () => import("@/modules/finyk/route").then((m) => m.route),
    }
    ```
  - У модулі видалити власний `useHashRouter`, замінити на `useNavigate / useParams / useLocation`.
  - Додати `loader` для prefetch критичного RQ-key (наприклад `useFinykOverviewQuery`).
  - Перевірити, що bundle-size guard падає на ≤350 KB initial.
- ESLint rule `no-hash-router-in-modules` піднімається до error для всіх модулів, що мігрували.

### Фаза 3 — hash-URL compat shim (1 PR)

**PR `feat-hash-url-compat-shim`:**

- `apps/web/src/core/app/HashRedirect.tsx` — компонент, що читає `window.location.hash`, якщо непорожній, робить `navigate(`/` + hash.slice(1), { replace: true })`.
- Підключити у root route. Один-time redirect; UX-stutter маскується splash screen-ом.
- Додати e2e-test (Playwright critical-flows) — старий PWA-link `https://app/#fizruk/workouts` → новий `/fizruk/workouts`.

### Фаза 4 — scroll restoration + prefetch on hover (1 PR)

**PR `feat-router-prefetch-and-scroll`:**

- Додати `<ScrollRestoration />` у root.
- Додати `<NavLink prefetch="hover">` у Hub-навігацію (вмикає prefetch chunk-ів через `link rel="modulepreload"`).
- Метрика: `route_change_p95_latency_ms` (через PostHog).

### Фаза 5 — bundle-gate перенастройка + cleanup (1 PR)

**PR `chore-bundle-budget-per-route`:**

- В `scripts/bundle-size-guard.ts` додати per-route budgets.
- Видалити `manualChunks` правила, які стали зайвими (більшість vendor-розбиття тепер route-driven).
- Прибрати з `App.tsx` залишки manual FSM «який модуль активний».
- Підняти ESLint rule `no-hash-router-in-modules` до error глобально (модуль за модулем уже мігрував у фазі 2).
- Видалити `apps/web/src/shared/hooks/useHashRouter.ts`.

## Критерії DONE

- [ ] `react-router@^7` встановлений, `<RouterProvider />` у root.
- [ ] Усі 8 top-level routes (Hub, Finyk, Fizruk, Nutrition, Routine, Insights, Settings, Onboarding) — окремі lazy-chunks.
- [ ] Initial bundle ≤ 350 KB (gzip).
- [ ] Per-route bundle ≤ 250 KB (gzip) — для більшості; крупніші документуються.
- [ ] `useHashRouter` повністю видалено з `apps/web/src/**`.
- [ ] Hash-URL compat shim тестується e2e (1 Playwright test).
- [ ] Route-loaders використовуються щонайменше у 4 модулях (prefetch RQ-data).
- [ ] PostHog подія `route_change` логується для метрики p95.
- [ ] Bundle-size guard оновлено — per-route budgets.
- [ ] ESLint rule `no-hash-router-in-modules` — error level.

## Ризики та митиґація

| Ризик                                                         | Мітигація                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| PWA install з hash-URL у deep-link — користувачі мають пам'ять | Hash-URL compat shim (фаза 3); broadcast push «оновіть закладки» не потрібен, redirect автоматичний.              |
| Існуючий код у модулях зав'язаний на `useHashRouter`           | Міграція робиться **по одному модулю на PR** (фаза 2 — 4 PRs). Кожен PR змінює тільки свій модуль.                |
| Bundle початково росте через runtime react-router             | Замір до/після у `chore-bundle-budget-per-route`. Якщо +20 KB і більше — переглянути імпорти.                     |
| Route-loader робить waterfall (loader → render → another fetch) | Loader prefetch-ить тільки **критичні** queries; неістотні лишаються RQ-фоновими.                                  |
| Service-worker precache інвалідується через зміну URL патернів | `apps/web/src/sw.ts` precache `/*.html` лишається; новий route resolution на client-side не змінює precache patterns. |

## Метрики

| Метрика                                  | Baseline (2026-05-03)         | Target                |
| ---------------------------------------- | ----------------------------- | --------------------- |
| Initial bundle (gzip)                    | ~ 800 KB (≤ 820 KB ceil)      | ≤ 350 KB              |
| Per-route bundle (avg)                   | n/a (single bundle)           | ≤ 250 KB              |
| Time-to-Hub (p75 у PostHog)              | ?                             | -30%                  |
| Route-change p95 latency                 | n/a (instant; no chunk load)  | ≤ 600 ms (with prefetch) |
| `useHashRouter` call-sites               | ~15+                          | 0                     |
| LCP (Web Vitals) на Hub                  | ?                             | Зниження ≥ 200 ms     |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR із змінами у `apps/web/src/core/app/**` потребує review від CODEOWNERS.

## Посилання

- Design Review 2026-05-03 — §6 Frontend UX-arch
- [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) — запис «hash-router у вебі»
- [react-router v7 docs](https://reactrouter.com/en/main)
- [`apps/web/src/shared/hooks/useHashRouter.ts`](../../apps/web/src/shared/hooks/useHashRouter.ts)
- [`apps/web/src/core/app/`](../../apps/web/src/core/app/)
- [`scripts/bundle-size-guard.ts`](../../scripts/bundle-size-guard.ts)
- [`vite.config.js`](../../vite.config.js)

## Outcome

_Заповнюється після завершення._
