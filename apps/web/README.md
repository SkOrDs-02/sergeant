# @sergeant/web

Канонічна продакшн-апка Sergeant — React 18 SPA (PWA), збирається Vite, деплоїться на Vercel.

## Стек

| Шар     | Технологія                                                 |
| ------- | ---------------------------------------------------------- |
| Збірка  | Vite 8, `@vitejs/plugin-react`                             |
| UI      | React 18, Tailwind CSS 4, `@sergeant/design-tokens` preset |
| Роутинг | react-router-dom v7                                        |
| Дані    | TanStack React Query, `@sergeant/api-client`               |
| Auth    | Better Auth (клієнт + cookie-сесії)                        |
| PWA     | vite-plugin-pwa + Workbox, Service Worker (`src/sw.ts`)    |
| Тести   | Vitest + MSW + React Testing Library, Playwright (a11y)    |

## Структура

```
src/
├── core/           # Hub-оболонка: auth, HubChat, dashboard, settings, sync, onboarding
├── modules/        # finyk/ fizruk/ routine/ nutrition/ — pages/components/hooks/lib
├── shared/         # UI-кіт, спільні хуки, утиліти (cn, date, storage, queryKeys)
├── sw.ts           # Service Worker (офлайн-кеш, Web Push)
└── main.tsx        # Точка входу
middleware.ts       # Vercel Edge Middleware: проксіює /api/* на Coolify-бекенд
```

## Команди

Усі скрипти `package.json`; з кореня — `pnpm --filter @sergeant/web <script>`. Повний pre-PR гейт — `pnpm check` у корені.

```bash
pnpm --filter @sergeant/web dev              # Vite dev-сервер → http://localhost:5173 (проксі `/api` → :3000); з кореня — `pnpm dev:web`
pnpm --filter @sergeant/web build            # production-збірка у `dist/`
pnpm --filter @sergeant/web build:capacitor  # збірка під Capacitor-shell (`VITE_TARGET=capacitor`)
pnpm --filter @sergeant/web build:analyze    # збірка з візуалізатором бандла (`ANALYZE=1`)
pnpm --filter @sergeant/web preview          # превʼю production-збірки
pnpm --filter @sergeant/web preview:lhci     # превʼю на 127.0.0.1:4173 для Lighthouse CI
pnpm --filter @sergeant/web lighthouse       # локальний прогон Lighthouse CI (`lighthouserc.json`)
pnpm --filter @sergeant/web lint             # ESLint
pnpm --filter @sergeant/web typecheck        # TypeScript (app + service worker)
pnpm --filter @sergeant/web test             # Vitest
pnpm --filter @sergeant/web test:watch       # Vitest у watch-режимі
pnpm --filter @sergeant/web test:coverage    # Vitest з покриттям
pnpm --filter @sergeant/web test:a11y        # Playwright + axe (a11y)
pnpm --filter @sergeant/web test:visual      # Playwright visual-regression (`playwright.visual.config.ts`)
pnpm --filter @sergeant/web e2e:auth         # Playwright smoke `@auth`
pnpm --filter @sergeant/web e2e              # Playwright smoke `@critical`
pnpm --filter @sergeant/web e2e:mobile       # Playwright mobile-аудит (44px touch targets, overflow) — блокуючий PR-гейт
pnpm --filter @sergeant/web e2e:ledger       # Playwright ledger-сценарії (`playwright.ledger.config.ts`)
pnpm --filter @sergeant/web e2e:profiles     # Playwright по браузерних профілях (`playwright.profiles.config.ts`)
pnpm --filter @sergeant/web e2e:seed-rich    # Playwright-сідер насиченого акаунта аудиту (`@seed`, profiles-конфіг)
pnpm --filter @sergeant/web size             # size-limit — бюджет JS/CSS (brotli)
pnpm --filter @sergeant/web mutation:time    # Stryker mutation-тести для time-утиліт
pnpm --filter @sergeant/web storybook        # Storybook на :6006
pnpm --filter @sergeant/web build-storybook  # статична збірка Storybook
pnpm --filter @sergeant/web size:eager       # бюджет eager-бандла (`scripts/ci/check-eager-bundle.mjs`)
```

## Деплой

Vercel автодеплоїть при push у `main`. Edge Middleware проксіює `/api/*` на `BACKEND_URL` (Coolify-бекенд, [ADR-0074](../../docs/04-governance/adr/0074-hosting-hetzner-coolify.md)).

Деталі: [`docs/02-engineering/integrations/railway-vercel.md`](../../docs/02-engineering/integrations/railway-vercel.md).

## Глибше

- [`docs/02-engineering/architecture/frontend-overview.md`](../../docs/02-engineering/architecture/frontend-overview.md)
- [`docs/02-engineering/architecture/platforms.md`](../../docs/02-engineering/architecture/platforms.md)
- [`docs/90-work/tech-debt/frontend.md`](../../docs/90-work/tech-debt/frontend.md)
