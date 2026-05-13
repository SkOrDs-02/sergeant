# Огляд фронтенду (Sergeant-2)

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Короткий знімок поточного фронтенду монорепо: веб (Vite PWA), мобільний (Expo), спільні пакети та модулі продукту. Детальніший статус поверхонь — [platforms.md](./platforms.md). Навмисні винятки `react-hooks/exhaustive-deps` у web — [apps-web-exhaustive-deps.md](./apps-web-exhaustive-deps.md).

## Монорепо

- **Менеджер пакетів**: pnpm (`packageManager` у кореневому `package.json`)
- **Оркестрація**: Turbo (`turbo run dev`, `build`, `lint`, `test`, `typecheck`)
- **Корисні скрипти**: `pnpm dev:web`, `pnpm build:web`, `pnpm test:a11y` (Playwright + axe для веб)

## Основні фронтенд-додатки

### 1. Веб — `apps/web`

| Шар     | Технології                                                               |
| ------- | ------------------------------------------------------------------------ |
| Збірка  | Vite 6, `@vitejs/plugin-react`                                           |
| UI      | React 18, Tailwind CSS 3                                                 |
| Роутинг | react-router-dom v7                                                      |
| Дані    | TanStack React Query, workspace `@sergeant/api-client`                   |
| Auth    | better-auth (клієнт поруч із сервером)                                   |
| PWA     | vite-plugin-pwa + Workbox                                                |
| Sync    | SQLite-WASM (OPFS/kvvfs) + `syncEngine/` — v2 op-log outbox sync         |
| Інше    | Sentry, dnd-kit, react-virtuoso, react-markdown, ZXing, body-highlighter |

**Структура за змістом** (entry: `apps/web/src/core/App.tsx`):

- **Hub-оболонка**: таби, хедер, модалки, онбординг, PWA (install/update), офлайн-банер, sync status
- **Ліниві модулі**: Finyk, Fizruk, Nutrition, Routine; окремо Auth, Profile, DesignShowcase
- **Pricing/Waitlist**: `core/pricing/PricingPage.tsx`, `core/PricingPage.test.tsx`; waitlist форма — `core/pricing/WaitlistForm.tsx`
- **Observability**: `core/observability/` — PostHog pageview tracker, analytics, posthog init, sanitizeUrl
- **Sync engine**: `core/syncEngine/` — `SyncEngineWriterRuntime`, singleton boot; `core/cloudSync/` — тільки `useSyncStatus` (v1 engine знятий, ADR-0047)
- **DB шар**: `core/db/sqlite.ts` — lazy SQLite-WASM з VFS priority OPFS-SAH → kvvfs → memory
- **Спільні шари**: `@shared/*` (UI, hooks), `core/` (auth, onboarding)
- **Chat actions**: `core/lib/chatActions/` — domain handlers (`finykActions`, `fizrukActions`, `routineActions`, `nutritionActions`, `serverActions`, `crossActions`)

### 2. Мобільний — `apps/mobile`

- Expo ~52, expo-router, React Native 0.76
- Стилі: NativeWind (Tailwind-подібний підхід)
- Ті самі доменні пакети + React Query (з persist для офлайну)
- Better Auth через `@better-auth/expo`
- Sync v2: MMKV-backed outbox, push scheduler через `@sergeant/api-client`
- Модуль Харчування: сканер штрихкодів (`expo-camera` + `/api/barcode`), список покупок на спільному ключі сховища з web
- E2E: Detox (скрипти в `apps/mobile/package.json`)

### 3. Mobile shell — `apps/mobile-shell`

- Capacitor-оболонка, що пакує `@sergeant/web` у нативні Android/iOS
- Веб збирається з `VITE_TARGET=capacitor` (`pnpm --filter @sergeant/web build:capacitor`)

## Спільний дизайн і домени

- **`packages/design-tokens`**: спільні токени + Tailwind preset для веб і мобайлу
- **Доменні пакети**: `finyk-domain`, `fizruk-domain`, `nutrition-domain`, `routine-domain`, `shared`, `insights`
- **`packages/api-client`**: єдиний клієнт API для веб і мобайлу; включає `SyncEnginePushScheduler`, `SyncEngineFlushOnReconnect` для v2 sync
- **`packages/db-schema`**: Drizzle схеми для Postgres + SQLite-WASM; `sync_op_outbox` + per-domain tables

## Якість і дизайн-система

- ESLint + jsx-a11y; кастомний `packages/eslint-plugin-sergeant-design`
- Веб: Vitest + Playwright (у т.ч. a11y)

## Примітки для редизайну / UI work

Це **не Next.js**, а **Vite SPA + PWA** з модульним Hub і **окремий Expo** клієнт. Візуальна ідентичність зав'язана на **design-tokens + Tailwind** (utility-first). Найбільший ефект від змін токенів/preset і ключових Hub- та модульних layout-компонентів на обох платформах.

### Ризики та напрями покращення

- Різні мінорні версії React між веб і моб — вирівнювати при нагоді
- Частина `core` у `.jsx` — поступова міграція на TS підвищує консистентність
- PWA + великі ліниві модулі — контролювати бандл (`pnpm build:analyze` у `@sergeant/web`)
- Sync cutover: finyk і nutrition reads ще частково на legacy paths до увімкнення `feature.*.sqlite_v2.read_sqlite` флагів у prod
