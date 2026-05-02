# @sergeant/web

Канонічна продакшн-апка Sergeant — React 18 SPA (PWA), збирається Vite, деплоїться на Vercel.

## Стек

| Шар     | Технологія                                                 |
| ------- | ---------------------------------------------------------- |
| Збірка  | Vite 6, `@vitejs/plugin-react`                             |
| UI      | React 18, Tailwind CSS 3, `@sergeant/design-tokens` preset |
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
└── main.jsx        # Точка входу
middleware.ts       # Vercel Edge Middleware: проксіює /api/* на Railway
```

## Команди

```bash
pnpm dev:web              # Vite dev → http://localhost:5173 (проксіює /api → :3000)
pnpm --filter @sergeant/web build          # production build
pnpm --filter @sergeant/web build:capacitor # збірка для Capacitor shell
pnpm --filter @sergeant/web test           # Vitest
pnpm --filter @sergeant/web test:a11y      # Playwright + axe
pnpm --filter @sergeant/web test:coverage  # Vitest з покриттям
pnpm --filter @sergeant/web typecheck      # TypeScript
```

## Деплой

Vercel автодеплоїть при push у `main`. Edge Middleware проксіює `/api/*` на `BACKEND_URL` (Railway).

Деталі: [`docs/integrations/railway-vercel.md`](../../docs/integrations/railway-vercel.md).

## Глибше

- [`docs/architecture/frontend-overview.md`](../../docs/architecture/frontend-overview.md)
- [`docs/architecture/platforms.md`](../../docs/architecture/platforms.md)
- [`docs/tech-debt/frontend.md`](../../docs/tech-debt/frontend.md)
