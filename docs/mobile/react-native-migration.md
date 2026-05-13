# Міграція на React Native (Expo)

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

> Source-of-truth трекер по перенесенню Sergeant із PWA-клієнта (`apps/web`,
> Vite + React + Tailwind + Workbox) на нативний iOS/Android клієнт
> (`apps/mobile`, Expo + React Native + Expo Router). Документ живий —
> оновлюємо по мірі робіт. Шорткат для апдейту прогресу — playbook
> [`sync-rn-migration-progress.md`](../playbooks/sync-rn-migration-progress.md).

## 1. Мета міграції

- Один нативний клієнт для iOS і Android, встановлюваний через App Store
  / Play Store (наразі «встановлення» доступне лише як PWA через
  Add-to-Home-Screen).
- Рідний UX на мобільних: haptics, native tab-bar, native gesture stack,
  push-нотифікації через APNs/FCM без обмежень Safari Web Push,
  background-таски (нагадування, sync), камера без `getUserMedia`-капризів
  iOS, native barcode-scanner.
- Максимальний реюз коду з `apps/web` через спільні workspace-пакети
  (`@sergeant/shared`, `@sergeant/api-client`, `@sergeant/finyk-domain`,
  `@sergeant/fizruk-domain`, `@sergeant/routine-domain`,
  `@sergeant/nutrition-domain`, `@sergeant/insights`, `@sergeant/config`).
- Нуль регресій для існуючих web-користувачів на час міграції:
  `apps/web` (PWA) залишається повноцінним до моменту, поки `apps/mobile`
  не покриє 100% функціоналу.

## 2. Поточний стан

### 2.0 Snapshot прогресу

Один рядок на фазу. Деталі по фазах — у §2.4 («Останні приземлення»),
повний план — у §4. Per-module статуси портів — у §5.x.

| Фаза | Назва                                    | Статус         | Останні landed PR-и                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Скафолд `apps/mobile`                    | ✅ Done        | [#401](https://github.com/Skords-01/Sergeant/pull/401)                                                                                                                                                                                                                                                                                                                                                                                            |
| 1    | UI-основа (NativeWind + MMKV + UI-8)     | ✅ Done        | [#403](https://github.com/Skords-01/Sergeant/pull/403)–[#427](https://github.com/Skords-01/Sergeant/pull/427)                                                                                                                                                                                                                                                                                                                                     |
| 2    | Hub-ядро                                 | 🔵 In progress | [#480](https://github.com/Skords-01/Sergeant/pull/480), [#482](https://github.com/Skords-01/Sergeant/pull/482), [#483](https://github.com/Skords-01/Sergeant/pull/483); HubChat / HubSearch — TODO                                                                                                                                                                                                                                                |
| 3    | CloudSync v1 → Sync v2 (op-log + outbox) | 🔵 In progress | v1 client cut-over ([#2010](https://github.com/Skords-01/Sergeant/pull/2010)) + mobile engine drop ([`20793ad`](https://github.com/Skords-01/Sergeant/commit/20793adb)) + сервер `module_data` / v1 handlers видалено ([`75dcdd5`](https://github.com/Skords-01/Sergeant/commit/75dcdd5c)). Mobile writer-wiring трекає [plan 2026-05-06](../superpowers/plans/2026-05-06-sync-engine-writer-wiring.md). Деталі — Q13 + storage-roadmap Stage 5–7 |
| 4    | Модуль Фінік + Detox E2E                 | 🔵 In progress | усі 5 сторінок портовано, Detox iOS зелений; Android CI follow-up                                                                                                                                                                                                                                                                                                                                                                                 |
| 5    | Модуль Рутина                            | 🔵 In progress | весь функціонал портовано; чекає stabilization на real device                                                                                                                                                                                                                                                                                                                                                                                     |
| 6    | Модуль Фізрук                            | 🔵 In progress | усі основні сторінки портовано; залишився `WorkoutTemplates` drawer                                                                                                                                                                                                                                                                                                                                                                               |
| 7    | Модуль Харчування                        | 🔵 In progress | shell + Dashboard / Log / Water / Pantry / Shopping / Recipe + barcode + photo-аналіз                                                                                                                                                                                                                                                                                                                                                             |
| 8    | AI-шар (HubChat / Coach / Digest)        | ⏸ Not started  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 9    | Hub-пошук + звіти                        | ⏸ Not started  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 10   | Deep links + shortcuts                   | 🔵 In progress | `useDeepLinks` + Android intent filters + Android shortcuts / iOS quick actions                                                                                                                                                                                                                                                                                                                                                                   |
| 11   | EAS prod + App Store / Play Store        | ⏸ Blocked      | чекає Apple Developer + Google Play Console (Q2)                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12   | Monitoring + Analytics                   | 🔵 In progress | `@sentry/react-native` ([#469](https://github.com/Skords-01/Sergeant/pull/469)) + PostHog observability wired                                                                                                                                                                                                                                                                                                                                     |
| 13   | Sunset-план для `apps/web`               | ⏸ Not started  | див. Q1                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Рішення по **Q1–Q14** зафіксовані у §13 (історично — у
[PR #402](https://github.com/Skords-01/Sergeant/pull/402); Q11–Q14 додано пізніше).

### 2.1 Фаза 0 — скафолд `apps/mobile`. **Done.**

Підняли окремий workspace `apps/mobile`:

- Expo 52 (`"expo": "~52.0.0"`), React Native 0.76, New Architecture
  (`newArchEnabled: true`).
- `expo-router` v4 з file-based navigation:
  - `app/(auth)/{sign-in,sign-up}.tsx` — модальна auth-група.
  - `app/(tabs)/{index,finyk,fizruk,routine,nutrition}.tsx` — основна
    таб-навігація з auth-guard через `useUser()` (redirect на sign-in).
  - `+not-found.tsx` — fallback.
- Інтеграція з Better Auth Expo: `@better-auth/expo`, токен у
  `expo-secure-store`, bearer-заголовок `Authorization: Bearer <token>`.
- Push: `expo-notifications` + `PushRegistrar`-компонент, який після
  логіну отримує native APNs/FCM-токен і реєструє його через
  `POST /api/v1/push/register` (див. [`docs/mobile/overview.md`](./overview.md)).
- Monorepo-resolver у `metro.config.js` (watchFolders + nodeModulesPaths +
  `unstable_enablePackageExports`), щоб RN бачив `@sergeant/*` пакети
  напряму з TS-сорсів.
- Динамічний `app.config.ts` (читає `EXPO_PUBLIC_API_BASE_URL`,
  `EAS_PROJECT_ID`). `eas.json` з дефолтним build-profile.
- Провайдери у `app/_layout.tsx`:
  `GestureHandlerRootView → SafeAreaProvider → QueryProvider → ApiClientProvider`. `QueryProvider` дзеркалить `apps/web/src/main.tsx`.

### 2.2 Backend-передумови. **Done.**

Сервер уже готовий до нативного клієнта (виконано в попередніх сесіях,
без пов'язаних мобільних змін):

- API v1 (`/api/v1/*`) — уніфікований префікс.
- Bearer-auth плагін Better Auth (токен у `set-auth-token` header на
  sign-in, далі йде в `Authorization`), cookies не обов'язкові.
- `POST /api/v1/push/register` з валідацією platform/token
  (`apps/server/src/migrations/006_push_devices.sql`).
- Scheme `sergeant://` і `exp://` / `localhost:8081` у
  `trustedOrigins` Better Auth.
- Daily AI-quota (`apps/server/src/modules/chat/aiQuota.ts`, таблиця
  `ai_usage_daily`) — спільна з web.

### 2.3 Контракти і документи, що вже існують

- [`apps/mobile/README.md`](../../apps/mobile/README.md) — запуск,
  архітектура, deep links, push, Dev Client on-device build
  (PR [#408](https://github.com/Skords-01/Sergeant/pull/408) /
  [#410](https://github.com/Skords-01/Sergeant/pull/410)).
- [`docs/mobile/overview.md`](./overview.md) +
  [`apps/mobile/docs/mobile.md`](../../apps/mobile/docs/mobile.md) —
  API-контракт для мобілки: auth, deep links, push register,
  troubleshooting.
- [`docs/architecture/api-v1.md`](../architecture/api-v1.md) — опис
  `/api/v1/*` ендпоінтів.
- [`docs/design/brandbook.md`](../design/brandbook.md) — вся візуальна
  ідентичність + секція «Native Patterns (iOS / Android)»
  (PR [#409](https://github.com/Skords-01/Sergeant/pull/409)).
- `packages/api-client/` — HTTP-клієнт і React-хуки (`useUser`,
  `usePushRegister`, …), працюють в обох середовищах.
- `packages/shared/`, `packages/finyk-domain/`, `packages/fizruk-domain/`,
  `packages/routine-domain/`, `packages/nutrition-domain/`,
  `packages/insights/` — чиста доменна логіка без DOM-залежностей
  (schemas, utils, аналітичні ядра, реюз web + mobile). `storageKeys`
  тепер у `@sergeant/shared` (R1); finyk / fizruk / routine / nutrition
  домени винесено окремими пакетами (R3 / R4 / Phase 5 PR 2 / Phase 7);
  `@sergeant/insights` тримає pure Hub-search + recommendation rules (R2).
- `packages/design-tokens/` — Tailwind-preset + raw tokens, спільні для
  `apps/web` і `apps/mobile` (R6).

### 2.4 Останні приземлення в `apps/mobile`

Курований список після Фази 1. Повна історія — у git log,
тут — те, що корисно знати при онбордингу.

**UI-примітиви** (`apps/mobile/src/components/ui/*`) — 8 базових:
`Button` ([#407](https://github.com/Skords-01/Sergeant/pull/407)), `Card`
([#413](https://github.com/Skords-01/Sergeant/pull/413), + jest-expo setup),
`Input` / `Textarea` ([#417](https://github.com/Skords-01/Sergeant/pull/417)),
`Banner` ([#419](https://github.com/Skords-01/Sergeant/pull/419)),
`Toast` + `useToast` ([#421](https://github.com/Skords-01/Sergeant/pull/421)),
`Skeleton` / `SkeletonText` ([#423](https://github.com/Skords-01/Sergeant/pull/423)),
`Sheet` ([#426](https://github.com/Skords-01/Sergeant/pull/426)),
`ConfirmDialog` ([#427](https://github.com/Skords-01/Sergeant/pull/427)).
Усі покриті `@testing-library/react-native`, без рантайм-deps поверх
NativeWind + RN-core. Поверх — додаткові примітиви в тому ж каталозі
(`Badge`, `Tabs`, `EmptyState`, `Tooltip`, `ProgressIndicator`,
`SwipeToAction`, `OfflineBanner`, `PullToRefresh`, `StreakFlame`,
`AnimatedCheckbox`, …), які виросли по ходу портів.

**Hub-core** (`apps/mobile/src/core/*`):

- `ErrorBoundary` + `ModuleErrorBoundary`
  ([#434](https://github.com/Skords-01/Sergeant/pull/434)) — порт web
  1:1 по class-component API, shared `Card` + `Button` у fallback,
  `console.error`-stub з TODO на Sentry.
- `SyncStatusIndicator` ([#441](https://github.com/Skords-01/Sergeant/pull/441))
  - `SyncStatusOverlay` ([#477](https://github.com/Skords-01/Sergeant/pull/477))
    — read-only UI-споживач `useSyncStatus`, 4 стани, pulse з
    reduced-motion.
- HubSettings: shell + 6 секцій (`Routine` / `Experimental`
  [#443](https://github.com/Skords-01/Sergeant/pull/443),
  `General` [#444](https://github.com/Skords-01/Sergeant/pull/444),
  `Notifications` [#445](https://github.com/Skords-01/Sergeant/pull/445),
  `Finyk` / `Fizruk` / `AIDigest`
  [#456](https://github.com/Skords-01/Sergeant/pull/456)) +
  `AccountSection` (sign-out + DEV push-тест перенесено сюди з
  `(tabs)/index.tsx`).
- HubDashboard серія: PR-1 status-row + drag-reorder + shared
  `@sergeant/shared/lib/dashboard`
  ([#480](https://github.com/Skords-01/Sergeant/pull/480));
  PR-2 hero-шар (`TodayFocusCard` / `FirstActionHeroCard` /
  `SoftAuthPromptCard` + `useDashboardFocus` + shared
  `@sergeant/shared/lib/{vibePicks,firstRealEntry,recommendations,dashboardFocus,kvStore}`)
  ([#483](https://github.com/Skords-01/Sergeant/pull/483)); PR-3
  quick-stats preview + `HubInsightsPanel` + `WeeklyDigestFooter`
  ([#482](https://github.com/Skords-01/Sergeant/pull/482)).
- `OnboardingWizard` ([#492](https://github.com/Skords-01/Sergeant/pull/492))
  — pure-домен `@sergeant/shared/lib/onboarding` з injected `KVStore`,
  thin web-адаптер `apps/web/src/core/onboarding/onboardingGate.ts`,
  mobile splash-Modal + wire у `app/(tabs)/_layout.tsx` через
  first-launch прапорець.

**Sync (`apps/mobile/src/sync/*`)** — Phase 3:

- **CloudSync v1 — викошений.** Сервер віддає `410 Gone`
  ([ADR-0047](../adr/0047-cloudsync-v1-410-gone.md)), `module_data` колонку
  та v1-handlers видалено ([`75dcdd5`](https://github.com/Skords-01/Sergeant/commit/75dcdd5c));
  web-клієнт стабнув ентрі-пойнт у фінальному cut-over-і ([#2010](https://github.com/Skords-01/Sergeant/pull/2010));
  mobile-engine видалено ([`20793ad`](https://github.com/Skords-01/Sergeant/commit/20793adb)).
  Старі PR-и v1-інфри ([#420](https://github.com/Skords-01/Sergeant/pull/420),
  [#429](https://github.com/Skords-01/Sergeant/pull/429),
  [#478](https://github.com/Skords-01/Sergeant/pull/478)) — історичний
  контекст.
- **Поточний стан `apps/mobile/src/sync/`** — тонкий шар стабів
  (`useCloudSync` / `useSyncStatus` / `useSyncedStorage` / `enqueueChange`)
  з тією ж public-shape, що тримає 17+ module-store call-sites зеленими
  на час перехідного періоду. Видалення цього каталогу заплановано
  у Stage 7 storage-roadmap-у. React Query теплий-старт через
  `PersistQueryClientProvider` + MMKV-персистер залишається повноцінним.
  Ключі префіксуються `mobile:` у `@sergeant/shared/storageKeys`.
- **Sync v2 op-log на mobile.** Per-module dual-write адаптери
  (`apps/mobile/src/modules/{routine,fizruk,nutrition,finyk}/lib/dualWrite`)
  пишуть у локальний SQLite-outbox через `@sergeant/db-schema`
  (`syncOpOutbox*`); writer-loop / scheduler / reconnect-flush живуть
  у `@sergeant/api-client` (`syncV2 pushLoop`, `syncEnginePushScheduler`,
  `syncEngineFlushOnReconnect`). Mobile writer-runtime тепер
  **змонтований у boot-pipeline**:
  `apps/mobile/src/core/syncEngine/{syncEngineWriter,singleton,netInfoEventTarget}.ts`
  - виклик `bootSyncEngineWriter({ captureException: captureError })` у
    `apps/mobile/app/_layout.tsx` після того, як storage-encryption
    bootstrap зняв splash-screen-gate (`setStorageReady(true)`). Reconnect-
    flush слухає NetInfo через тонкий `createNetInfoEventTarget` адаптер
    (`kind: 'online'` — `document.visibilityState` у RN відсутній).
    `useSyncStatus` бридж-ить `runtime.getStatus()` (pending / rejected /
    dead_letter counts) на існуючий `SyncStatusIndicator`/`SyncStatusOverlay`.
    Документація патерну й web-counterpart-у —
    [`docs/superpowers/plans/2026-05-06-sync-engine-writer-wiring.md`](../superpowers/plans/2026-05-06-sync-engine-writer-wiring.md)
  - storage-roadmap §Stage 5. ESLint `sergeant-design/no-raw-tracked-storage`
    залишається активним guard-ом проти повернення raw
    `enqueueChange`-патернів.

**Модулі — детальні статуси у §5.x.** Ключові точки нижче.

- **Фінік** (`apps/mobile/src/modules/finyk/*`): усі 5 сторінок
  (Overview / Transactions / Budgets / Analytics / Assets) портовано
  ([#448](https://github.com/Skords-01/Sergeant/pull/448),
  [#451](https://github.com/Skords-01/Sergeant/pull/451),
  [#453](https://github.com/Skords-01/Sergeant/pull/453),
  [#460](https://github.com/Skords-01/Sergeant/pull/460),
  [#467](https://github.com/Skords-01/Sergeant/pull/467),
  [#474](https://github.com/Skords-01/Sergeant/pull/474),
  [#477](https://github.com/Skords-01/Sergeant/pull/477)). Detox iOS-сьюти
  smoke (`finyk-manual-expense.e2e.ts`, `finyk-transactions.e2e.ts`,
  `routine-smoke.e2e.ts`, `hub-ux-smoke.e2e.ts`) + full sign-in→module
  →sign-out (`routine-full.e2e.ts`, `fizruk-full.e2e.ts`,
  `finyk-full.e2e.ts`, `nutrition-full.e2e.ts`) під
  `EXPO_PUBLIC_E2E_REAL_AUTH=1` (mock-fetch interceptor у
  `apps/mobile/src/auth/e2eAuthMock.ts`). Android CI: smoke-build
  зелений, full-сьюти follow-up.
- **Рутина** (`apps/mobile/src/modules/routine/*`): весь функціонал
  портовано — shell + 3-tab nav, pure-домен у
  `@sergeant/routine-domain`, habits-редактор з drag-reorder, heatmap,
  reminders через `expo-notifications`
  ([#449](https://github.com/Skords-01/Sergeant/pull/449),
  [#455](https://github.com/Skords-01/Sergeant/pull/455),
  [#459](https://github.com/Skords-01/Sergeant/pull/459),
  [#463](https://github.com/Skords-01/Sergeant/pull/463),
  [#466](https://github.com/Skords-01/Sergeant/pull/466),
  [#472](https://github.com/Skords-01/Sergeant/pull/472),
  [#475](https://github.com/Skords-01/Sergeant/pull/475)).
- **Фізрук** (`apps/mobile/src/modules/fizruk/*`): shell
  ([#450](https://github.com/Skords-01/Sergeant/pull/450)),
  active-workout таймер + `RestTimerOverlay`
  ([#452](https://github.com/Skords-01/Sergeant/pull/452)), `BodyAtlas`
  ([#457](https://github.com/Skords-01/Sergeant/pull/457)), `Progress`
  ([#462](https://github.com/Skords-01/Sergeant/pull/462)),
  `PlanCalendar` + recovery-forecast
  ([#464](https://github.com/Skords-01/Sergeant/pull/464)),
  `Measurements` ([#470](https://github.com/Skords-01/Sergeant/pull/470)),
  `Programs` ([#473](https://github.com/Skords-01/Sergeant/pull/473)),
  `Body` ([#497](https://github.com/Skords-01/Sergeant/pull/497)),
  `Workouts` ([#494](https://github.com/Skords-01/Sergeant/pull/494)),
  `Dashboard` ([#493](https://github.com/Skords-01/Sergeant/pull/493)),
  `Exercise` detail
  ([#500](https://github.com/Skords-01/Sergeant/pull/500)). Залишився
  `WorkoutTemplates` drawer; фото-прогрес тіла свідомо виключено
  ([#468](https://github.com/Skords-01/Sergeant/pull/468)).
- **Харчування** (`apps/mobile/src/modules/nutrition/*`) — Phase 7
  активна: `NutritionApp` shell + bottom-nav, сторінки `Dashboard`,
  `Log`, `Water`, `Pantry`, `Shopping`, `RecipeDetail`, `RecipeForm`,
  `SavedRecipesList`. Barcode-сканер (`expo-camera` `CameraView`) →
  `useBarcodeProductLookup` → `/api/barcode`. Фото-їжа через
  `expo-image-picker` + `expo-image-manipulator` →
  `POST /api/nutrition/analyze-photo` / `refine-photo`. AI-розбір
  списку покупок через `apiClient.nutrition.parsePantry`. AI-генерація
  shopping-list з рецептів / плану як на web — ще ні.

### 2.5 Аудит міграційного плану (прохід по `apps/web/src`)

Пройдено по всьому `apps/web/src` у пошуку web-специфіки, яку план не
міг помітити. Повна аудит-матриця — секція [§7](#7-web-only-api--rn-заміни-чеклист).
Підсумково:

- **§7** розширена рядками про `navigator.vibrate`, `@dnd-kit/`\*,
  `react-virtuoso`, `react-markdown`, Blob-експорти, `<input type="file">`,
  `FileReader`, `window.visualViewport`, `useDialogFocusTrap`,
  `document.visibilityState`, `useDarkMode`, `useSWUpdate` /
  `useIosInstallBanner`.
- **§11** — додано **R7** (haptics-адаптер), **R8**
  (export / backup-адаптер), **R9** (visual-keyboard hook платформний).
- **§10** — конкретні iOS usage-descriptions та Android
  runtime-permissions.
- **§12** (Ризики) — нотатка про Hermes / `Intl.*` та OTA-стратегію
  `expo-updates`.

## 3. Цільова архітектура

```
sergeant/
├── apps/
│   ├── web/          ← PWA (Vite, React, Tailwind, Workbox)         [поточний клієнт]
│   ├── mobile/       ← Expo / React Native / Expo Router             [цільовий клієнт]
│   ├── mobile-shell/ ← Capacitor 7 wrapper над `apps/web` для Android/iOS Store
│   │                   (паралельний реліз-шлях до повного RN-порту; Q14)
│   └── server/       ← Express, Better Auth, Postgres, Anthropic     [спільний]
└── packages/
    ├── api-client/        ← HTTP + React Query хуки (web + mobile)
    ├── shared/            ← domain types, schemas (Zod), pure utils, storageKeys,
    │                        haptic / fileDownload / fileImport / visualKeyboardInset контракти,
    │                        HubDashboard + onboarding pure-домен
    ├── db-schema/         ← Drizzle SQLite + Postgres схеми, sync op-log таблиці
    │                        (web `@sqlite.org/sqlite-wasm` + mobile `expo-sqlite` + server PG;
    │                        Q11/Q12, storage-roadmap Stage 2/4)
    ├── finyk-domain/      ← чиста доменна логіка фінансів (R3)
    ├── fizruk-domain/     ← чиста доменна логіка Фізрука (R4 + Phase 6 domains)
    ├── routine-domain/    ← чиста доменна логіка Рутини (Phase 5 PR 2)
    ├── nutrition-domain/  ← чиста доменна логіка Харчування (Phase 7)
    ├── insights/          ← Hub-search scorер + recommendation rules (R2)
    ├── design-tokens/     ← Tailwind preset + raw tokens (web + mobile) (R6)
    ├── eslint-plugin-sergeant-design/ ← кастомні правила (no-raw-tracked-storage, …)
    └── config/            ← ESLint, TS, Prettier базові конфіги
```

Ключові принципи:

1. **Без зламу контрактів `@sergeant/*`.** Якщо мобільна імплементація
   потребує іншої API-форми (наприклад, інший shape storage),
   розширюємо пакет абстракцією/стратегією, а не робимо mobile-only форк.
2. **Нуль DOM-залежностей у спільних пакетах.** Якщо зустрічаємо
   `window.*` / `localStorage` / `document` у `packages/*` — це баг
   для мобілки, закриваємо окремим PR. Наразі перевірено:
   `packages/shared/src/{utils,lib,hooks}`, `packages/finyk-domain/src/*`,
   `packages/fizruk-domain/src/*`, `packages/routine-domain/src/*`,
   `packages/nutrition-domain/src/*` та `packages/insights/src/*` —
   чисті (всі DOM-залежні шіми живуть у `apps/web` і реєструють
   адаптери на shared-контракти — haptic / R7, fileDownload / R8,
   visualKeyboardInset / R9, KVStore для HubDashboard hero-шару);
   `packages/api-client` залежить лише від `fetch` (є в RN).
3. **Дві точки входу — один бекенд.** Увесь state-синк через
   `/api/v1/*` + sync v2 op-log (`/v2/sync/{push,pull}` + SSE).
   Локальна персистенція — комбінована: hot keys (UI prefs) у
   `localStorage`/MMKV, доменні дані — у локальному SQLite через
   `@sergeant/db-schema` (web — sqlite-wasm на OPFS, mobile —
   `expo-sqlite`). Для модулів routine/fizruk/nutrition/finyk SQLite
   уже cut-over для read-path за фіче-флагом
   `feature.<m>.sqlite_v2.read_sqlite` (Q11/Q12/Q13). Деталі — §6,
   первинний source-of-truth — [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md).

## 4. Фазований план

Кожна фаза — окремий PR (або серія малих PR-ів), зелене CI, нуль
регресій на web. Порядок може перетасовуватись по ходу, залежності
позначені.

| #   | Фаза                                       | Статус         | Залежить від                 | Опис                                                                                                                                                                                                                         |
| --- | ------------------------------------------ | -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Скафолд `apps/mobile`                      | ✅ Done        | —                            | Expo + Expo Router + Better Auth + metro monorepo (§2.1).                                                                                                                                                                    |
| 1   | UI-основа RN (NativeWind + MMKV + Dev Cli) | ✅ Done        | 0                            | NativeWind (Q5), MMKV (Q3), `@sergeant/design-tokens` (R6), Dev Client через EAS (Q4) + 8 базових UI-примітивів. Деталі — §2.4.                                                                                              |
| 2   | Hub-ядро                                   | 🔵 In progress | 1                            | BRANDBOOK native-patterns (Q9). `ErrorBoundary` + `SyncStatusIndicator` + 6 HubSettings-секцій + HubDashboard (3 PR-серія) + `OnboardingWizard`. Далі: HubChat / HubSearch / HubReports.                                     |
| 3   | CloudSync + офлайн-черга                   | 🔵 In progress | 1                            | RN-аналог `core/cloudSync/useCloudSync.ts`: MMKV + NetInfo + React Query persist; LWW-резолвер незмінний (на сервері). `useSyncedStorage` + ESLint-правило проти raw-tracked storage.                                        |
| 4   | Порт модуля Фінік + перші Detox E2E        | 🔵 In progress | 1, 3                         | Усі 5 сторінок портовано. Detox iOS зелений, Android CI follow-up.                                                                                                                                                           |
| 5   | Порт модуля Рутина                         | 🔵 In progress | 1, 3                         | Весь функціонал портовано. Stabilization + інтеграційні тести на real device через Expo Dev Client.                                                                                                                          |
| 6   | Порт модуля Фізрук                         | 🔵 In progress | 1, 3                         | Усі сторінки портовано. Залишився `WorkoutTemplates` drawer.                                                                                                                                                                 |
| 7   | Порт модуля Харчування                     | 🔵 In progress | 1, 3, 6                      | shell + 8 сторінок + barcode-сканер + photo-аналіз; чекає AI-генерація shopping-list.                                                                                                                                        |
| 8   | AI-шар (HubChat / Coach / Digest)          | ⏸ Not started  | 2, 4–7                       | RN-сумісний стримінг (fetch ReadableStream у RN 0.76 ОК). Speech → `expo-speech-recognition` або server-side fallback (Whisper).                                                                                             |
| 9   | Hub-пошук + звіти                          | ⏸ Not started  | 2, 4–7                       | `HubSearch` + `HubReports`. Pure-агрегатори вже у `@sergeant/insights`.                                                                                                                                                      |
| 10  | Deep links + shortcuts                     | 🔵 In progress | 4–7                          | `useDeepLinks` + Android intent-filters + Android shortcuts / iOS quick actions. Universal links (`https://…`) — TODO до публікації.                                                                                         |
| 11  | EAS prod + App Store / Play Store          | ⏸ Blocked      | 4–7 (MVP), Developer-акаунти | EAS prod-профайл, App Store Connect + Google Play Console setup, signing, privacy labels, перший TestFlight / Internal Testing. **Блокер:** Apple Developer Program + Google Play Console (Q2).                              |
| 12  | Monitoring + Analytics                     | 🔵 In progress | 11 (для prod-DSN)            | `@sentry/react-native` (`apps/mobile/src/lib/observability.ts`, [#469](https://github.com/Skords-01/Sergeant/pull/469)) + PostHog (`apps/mobile/src/observability/*`). Далі: реальний DSN, breadcrumbs, performance tracing. |
| 13  | Sunset-план для `apps/web`                 | ⏸ Not started  | 11                           | Чи залишаємо PWA назавжди (реюз через `react-native-web`), чи консервуємо. Див. Q1.                                                                                                                                          |

## 5. Мапування фіч web → mobile

Per module — які файли `apps/web` переносяться і в що саме.

### 5.1 `core/` (Hub)

| web                                                      | mobile ціль                                             | нотатки                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `core/App.tsx` (router, shell)                           | `apps/mobile/app/_layout.tsx` + `(tabs)/_layout.tsx`    | expo-router замість `react-router-dom`.                                        |
| `core/auth/AuthContext.tsx`                              | викид — джерело правди стає `useUser()` з api-client    | Для мобілки контекст не потрібен; `authClient` уже в `src/auth/authClient.ts`. |
| `core/auth/AuthPage.tsx`                                 | `apps/mobile/app/(auth)/{sign-in,sign-up}.tsx`          | Уже є scaffold; підключити validation з `@sergeant/shared/schemas`.            |
| `core/HubDashboard.tsx`                                  | `apps/mobile/src/core/dashboard/HubDashboard.tsx`       | RN-компоненти, FlashList для стрічок. Статус — Done (3 PR-серія).              |
| `core/OnboardingWizard.tsx`                              | `apps/mobile/src/core/onboarding/OnboardingWizard.tsx`  | Done — splash-Modal на mobile, shared `@sergeant/shared/lib/onboarding`.       |
| `core/hub/HubSearch.tsx`                                 | TODO (`apps/mobile/src/core/hub/`)                      | Pure-скорінг уже у `@sergeant/insights/search` (R2); LS-recents — web-wrapper. |
| `core/hub/HubReports.tsx`                                | TODO                                                    | Реюз агрегаторів з `@sergeant/insights`.                                       |
| `core/HubChat.tsx` + `core/lib/hubChat*.ts`              | TODO (`apps/mobile/src/core/hub/chat/*`)                | Speech → `expo-speech-recognition`; streaming через ReadableStream.            |
| `core/insights/WeeklyDigestCard.tsx` + `useWeeklyDigest` | `apps/mobile/src/core/dashboard/WeeklyDigestCard.tsx`   | Mobile-варіант присутній. Серверний ендпоінт незмінний.                        |
| `core/insights/TodayFocusCard.tsx`, `CoachInsightCard`   | `apps/mobile/src/core/dashboard/{TodayFocusCard,…}.tsx` | Done.                                                                          |
| `core/ModuleErrorBoundary.tsx`                           | `apps/mobile/src/core/ModuleErrorBoundary.tsx`          | Done.                                                                          |
| `core/cloudSync/useCloudSync.ts`                         | `apps/mobile/src/sync/*`                                | MMKV + NetInfo + React Query persister. Done.                                  |
| `core/observability/sentry.ts`                           | `apps/mobile/src/lib/observability.ts`                  | `@sentry/react-native`. Scaffold landed.                                       |
| `core/observability/webVitals.ts`                        | — (викидаємо на мобілці)                                | На native — Sentry Performance + expo-perf.                                    |
| `core/auth/authClient.ts`                                | `apps/mobile/src/auth/authClient.ts`                    | Done.                                                                          |

### 5.2 `modules/finyk` — ✅ Усі 5 сторінок портовано

- `FinykApp.tsx` — RN-root екран модуля у
  `apps/mobile/src/modules/finyk/FinykApp.tsx`.
- `Overview` / `Transactions` / `Budgets` / `Analytics` / `Assets` —
  native screens у stack-навігаторі всередині табу Finyk
  (`apps/mobile/app/(tabs)/finyk/*`).
- `victory-native` графіки (Q7) для всіх трендів; `react-native-svg`
  для Analytics donut.
- `ManualExpenseSheet` / `EditTransactionSheet` — поверх
  `components/ui/Sheet`.
- `TxRow`, `TxListItem` — без DOM, View / Text / Pressable.
- `SwipeToAction` — на `react-native-gesture-handler` + Reanimated.
- Pure-домен — у `@sergeant/finyk-domain` (R3): `constants`, `utils`,
  `domain/*`, `lib/*`, `storageKeys`, `backup`, `assets`. Web імпортує
  з пакета напряму (без шімів).
- Detox iOS-сьют `finyk-manual-expense.e2e.ts`. Android CI workflow +
  `finyk-transactions.e2e.ts` period-filter сьют — in-flight.

### 5.3 `modules/fizruk` — ✅ Майже всі сторінки портовано

- `FizrukApp.tsx` + 9 route-сторінок у stack-навігаторі
  (`apps/mobile/app/(tabs)/fizruk/*`): `index` (Dashboard), `workouts`,
  `exercise`, `programs`, `progress`, `measurements`, `body`, `atlas`,
  `plan`. Route-каталог — `src/modules/fizruk/shell/fizrukRoute.ts`
  (масив `FIZRUK_PAGES`, `fizrukRouteFor`).
- `BodyAtlas` (web `body-highlighter`) → ручна `react-native-svg`
  модель з тап-обробкою по path-ах.
- `data/*`, `domain/*`, `lib/*` — pure, у
  `@sergeant/fizruk-domain` (R4). Phase-6 розширення:
  `domain/{progress,plan,measurements,programs,body,workouts,dashboard}/*`.
- `useActiveFizrukWorkout` — wall-clock-derived таймер, MMKV-персист,
  `expo-keep-awake` lazy-active, drift-resistant. `RestTimerOverlay` —
  bottom-sheet прогрес-бар з `Animated.timing` + reduce-motion.
- `Dashboard`: hero-картка (active-workout / today-session /
  empty-nudge) + KPI row (streak / weekly volume / 30-day weight Δ)
  - quick-links grid + secondary section (recent workouts + top PRs).
- `Workouts` — журнал згрупований по датах + каталог вправ з
  `primaryGroup` фільтром + active-set editor для weight / reps / RPE.
- `Exercise` detail — title + primary-muscle chips + new-PR banner +
  victory-native 12-тижневі тренди (1RM / volume або cardio
  pace / distance) + load-calculator (Сила / Гіпертрофія / Витривалість)
  - історія сетів.
- `useRecovery` + `useExerciseCatalog` + `useDailyLog` — на mobile
  (MMKV + cloud-sync); Atlas / Body підключені до реальних даних
  відновлення.
- **`WorkoutTemplates` drawer** — у scope Phase 6, але ще не реалізовано
  на mobile. Mobile-хук `useWorkoutTemplates` уже існує (MMKV +
  CloudSync, mirror web LS-shape під ключем `STORAGE_KEYS.FIZRUK_TEMPLATES`),
  залишилось перенести UI з `apps/web/src/modules/fizruk/components/WorkoutTemplatesSection.tsx`
  - узгодити тип `WorkoutTemplateGroup` з web-shape. Templates SQLite
    cut-over — окрема follow-up серія, ще не у Stage 4 storage-roadmap.
- **Не мігруємо:** фото-прогрес тіла (виключено з плану,
  [#468](https://github.com/Skords-01/Sergeant/pull/468)).

### 5.4 `modules/routine` — ✅ Весь функціонал портовано

- `RoutineApp.tsx` + 3-tab bottom-nav (`calendar` / `stats` / `settings`)
  з MMKV-persist активного табу через `STORAGE_KEYS.ROUTINE_MAIN_TAB`.
- Календар — monthly / yearly режими, heatmap-сторінка
  (`react-native-svg`, 52×7 сітка) + `domain/heatmap/*`.
- Habits-редактор — список + форма + weekday-picker + ↑/↓ reorder
  - two-tap delete; `validateHabitDraft` / `habitToDraft` у
    `@sergeant/routine-domain`.
- **Habit drag-reorder** ([#475](https://github.com/Skords-01/Sergeant/pull/475)).
  Long-press через `Gesture.Pan().activateAfterLongPress(300)`
  - `Reanimated.LinearTransition` + haptic feedback на старт / drop.
    Reduce-motion колапсує lift / snap-back до `duration: 0`. ↑/↓
    залишаються як accessibility-fallback. Реалізація —
    `apps/mobile/src/modules/routine/pages/Habits/DraggableHabitList.tsx`.
- `useRoutineReminders` → `expo-notifications` (pure weekday / trigger
  helpers у `routine-domain/domain/reminders/*`, lazy-permission hook
  з MMKV-persisted schedule map).
- CloudSync wiring (`enqueueChange` на всі мутації routine-store +
  no-op early returns).
- Далі: stabilization + інтеграційні тести на real device через
  Expo Dev Client.

### 5.5 `modules/nutrition` — 🔵 Phase 7 in progress

- `NutritionApp.tsx` + bottom-nav, сторінки в
  `apps/mobile/src/modules/nutrition/pages/*`: `Dashboard`, `Log`,
  `Water`, `Pantry`, `Shopping`, `RecipeDetail`, `RecipeForm`,
  `SavedRecipesList`.
- **Barcode (Done):** `expo-camera` `CameraView` + `onBarcodeScanned`
  - `barcodeScannerSettings` (EAN / UPC) у
    `NutritionBarcodeScanScreen.tsx`. Lookup через
    `useBarcodeProductLookup` → `/api/barcode` (контракт як на web).
    Deep link `app/(tabs)/nutrition/scan.tsx`, інтеграція з
    `AddMealSheet` через `nutritionScanBridge`.
- **Photo-аналіз (Done):** `expo-image-picker` (галерея + камера) +
  `expo-image-manipulator` + `expo-file-system` (base64) →
  `POST /api/nutrition/analyze-photo` / `refine-photo` з
  `AddMealSheet` (порція + відповіді на питання) → `source: "photo"`,
  `macroSource: "photoAI"`.
- **Pantry / Shopping (Done):** `useNutritionPantries` + `Pantry.tsx`,
  `useShoppingList` + `Shopping.tsx`. Доменні мутації — з
  `@sergeant/nutrition-domain` (`mergeItems` / `parseLoosePantryText`
  / `groupItemsByCategory`). AI-розбір списку через
  `apiClient.nutrition.parsePantry`.
- **TODO:** AI-генерація shopping-list з рецептів / плану як на web
  (наразі тільки розбір власноруч-введеного списку).

## 6. Cross-cutting concerns

### 6.1 Локальне сховище і sync

Web — `localStorage` для UI prefs / hot keys, `@sqlite.org/sqlite-wasm`
(OPFS-SAH worker) для доменних даних (Q12). На мобілці —
`react-native-mmkv` (Q3) для UI prefs + `expo-sqlite` v15 через
`drizzle-orm/expo-sqlite` для доменних даних (Q11). Sync —
op-log v2 через `/v2/sync/{push,pull}` + SSE pull (Q13), не
старий `module_data` LWW push/pull.

- **Малі значення** (токени) → `expo-secure-store`.
- **UI prefs / hot keys** — MMKV + adapter у
  `apps/mobile/src/lib/storage.ts` зі shape web-API.
- **Доменні дані** (routine / fizruk / nutrition / finyk) — локальний
  SQLite через `@sergeant/db-schema` (TEXT-uuid, JSON-as-TEXT, `_lite`
  суфікс на індексах). Per-module cut-over reads виконано за фіче-флагом
  `feature.<m>.sqlite_v2.read_sqlite` (storage-roadmap Stage 4); templates
  / saved recipes / weekPlan ще на legacy LS/MMKV-слоті.
- **Офлайн-черга** — `syncOpOutbox*` у локальному SQLite через
  `@sergeant/db-schema`, не MMKV. Writer-loop орхеструє
  `syncV2 pushLoop` + `syncEnginePushScheduler`
  (`@sergeant/api-client`); NetInfo-flush — через
  `syncEngineFlushOnReconnect`. Mobile writer-runtime у boot-pipeline
  ще не змонтований (див. §2.4 + writer-wiring plan).
- **CRDT.** Streaks-лічильники — PN-counter (op `increment`); решта —
  per-row apply-fns на сервері з ідемпотентністю по `idempotency-key`
  (Q13).
- **React Query persister** —
  `@tanstack/query-sync-storage-persister` + MMKV для теплого старту
  React Query (UI shape, не доменні дані).

Ключі сховища префіксуються `mobile:` у
`@sergeant/shared/storageKeys`, щоб уникнути колізій із shared
тестами та web-сесією.

### 6.2 Стилі й тема

- **NativeWind** (Q5) — класова Tailwind-like API, ближче до web.
  Дає 80% реюзу класів.
- Tokens — спільний preset з `@sergeant/design-tokens` (R6).
  Mobile `tailwind.config.js` підключає `nativewind/preset` плюс
  той самий `@sergeant/design-tokens/tailwind-preset`.
- Дизайн-патерни — секція «Native Patterns (iOS / Android)» у
  [`docs/design/brandbook.md`](../design/brandbook.md) (PR
  [#409](https://github.com/Skords-01/Sergeant/pull/409)).

### 6.3 Навігація

- Web: `react-router-dom` v7.
- Mobile: `expo-router` v4 (file-based, зверху React Navigation).
- Deep-links — таблиця у [`docs/mobile/overview.md`](./overview.md)
  § «Deep links».

**Phase 10 — In progress.** Pure-хелпер
`apps/mobile/src/lib/deepLinks.ts` парсить / будує всі `sergeant://…`
схеми як discriminated-union `SergeantDeepLink` і повертає `Href` для
expo-router. Runtime — `useDeepLinks()` (`src/lib/useDeepLinks.ts`):
монтує cold-start (`Linking.getInitialURL()` → `router.replace`) і
warm-start (`Linking.addEventListener("url")` → `router.push`),
дедупує однаковий URL, пропускає `sergeant://auth/callback` через
себе (цим листенером володіє `@better-auth/expo/client`). Виклик —
у `RootShell` у `app/_layout.tsx` після того, як `Stack` змонтований.
Android `intentFilters` для scheme `sergeant` — у `app.config.ts`;
universal links (`https://sergeant.2dmanager.com.ua` + `applinks:` на
iOS) — TODO до публікації `.well-known/assetlinks.json` на
прод-домен. Скафолди роутів (`routine/habit/[id]`,
`fizruk/workout/[id]`, `fizruk/workout/new`, `finyk/tx/[id]`,
`nutrition/scan`, `nutrition/recipe/[id]`, `auth/callback`) рендерять
`DeepLinkPlaceholder` (`Скоро` + primary-CTA + повернення на хаб),
доки відповідні фази не підтягнуть реальні екрани.

**Android shortcuts + iOS quick actions (PR-B).** Три статичні шорткати
(«Витрата» → `sergeant://finance/tx/new`, «Сьогодні» →
`sergeant://routine`, «Тренування» → `sergeant://workout/new`). На
Android — локальний config-плагін
`apps/mobile/plugins/withAndroidShortcuts.ts` (генерує
`android/app/src/main/res/xml/shortcuts.xml`, зливає лейбли у
`res/values/strings.xml`, реєструє `<meta-data>` у `MainActivity`).
На iOS — `ios.infoPlist.UIApplicationShortcutItems` напряму у
згенерований `Info.plist`. Тап шортката фаєрить `sergeant://…` через
`useDeepLinks` pipeline — нового runtime-коду немає. Pure
`buildShortcutsXml` / `shortcutStringKeys` мають unit-тести.

### 6.4 Push-нотифікації

- Web: Web Push + VAPID, `usePushNotifications`, service worker.
- Mobile: `expo-notifications` → native APNs / FCM; `PushRegistrar`
  уже реєструє токен через `POST /api/v1/push/register`.
- Scheduled reminders (routine, fizruk):
  - web: `setTimeout` + service worker.
  - mobile: `Notifications.scheduleNotificationAsync` (native, працює
    у фоні без запущеного процесу).
- Payload — платформо-агностичний (один `PushPayload` shape, сервер
  мапить у APNs / FCM / web-push). Деталі — у
  [`docs/mobile/overview.md` § Push](./overview.md#push-notifications).

### 6.5 Голосовий ввід і speech (Q6)

- Web: Web Speech API (`SpeechRecognition` в Chrome).
- Mobile: вирішено — `expo-speech-recognition` як primary,
  server-side Whisper як fallback (`POST /api/v1/speech/transcribe`)
  для пристроїв без on-device STT або для невдалих фолбеків.
- `speechParsers` — pure, переносимо as-is.

### 6.6 Камера / штрихкод / фото-аналіз

- **Штрихкод (Done):** `expo-camera` / `CameraView` (§5.5).
- **Фото-їжа (Done):** `expo-image-picker` + `expo-image-manipulator`
  - `expo-file-system` (§5.5).
- **Покупки / комора (Done):** §5.5.

### 6.7 Графіки (Q7)

- Вирішено: `victory-native` + `react-native-svg`. Реюзаний у Фінік
  (`BudgetTrendChart`, `CategoryChart`, `NetworthChart`, donut),
  Фізрук (`Progress` KPIs, weight / body-fat тренди, exercise 1RM /
  volume тренди).
- Обгортка-адаптер у `apps/mobile/src/modules/<m>/components/charts/`,
  щоб пізніше можна було безболісно замінити.

### 6.8 Body Atlas

`body-highlighter` (web-only) → ручна SVG-модель у
`react-native-svg` з тап-обробкою по path-ах. Done у Phase 6
([#457](https://github.com/Skords-01/Sergeant/pull/457)).

### 6.9 Безпека й ключі

- Токени: `expo-secure-store` (вже підключено).
- API base URL: `EXPO_PUBLIC_API_BASE_URL` (build-time).
- Не зберігати API-секрети на клієнті. AI-виклики йдуть лише через
  `apps/server`.

### 6.10 Background tasks

- Web-PWA виконує deferred-роботи через service worker.
- Mobile: `expo-background-fetch` / `expo-task-manager` для
  синк-пулу. Поки не в MVP.

## 7. Web-only API → RN заміни (чеклист)

| web API                                                     | зустрічається в                                                                                                          | RN-заміна                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `localStorage` / `sessionStorage`                           | всюди, через `shared/lib/storage.ts`                                                                                     | MMKV-адаптер (`apps/mobile/src/lib/storage.ts`) + `expo-secure-store` для токенів.                                  |
| `window.navigator.onLine`                                   | `shared/hooks/useOnlineStatus.ts`                                                                                        | `@react-native-community/netinfo`.                                                                                  |
| `document.visibilityState`                                  | `shared/lib/createModuleStorage.ts`, `core/observability/webVitals.ts`, `core/stories/hooks/useStoriesAutoplay.ts`       | `AppState` з `react-native` (`change` event, `active` / `background` / `inactive`).                                 |
| `Notification`, `navigator.serviceWorker`                   | `shared/hooks/usePushNotifications.ts`                                                                                   | `expo-notifications`.                                                                                               |
| `SpeechRecognition`, `speechSynthesis`                      | `core/hooks/useSpeech.ts`, `HubChat`, `VoiceMicButton`                                                                   | §6.5.                                                                                                               |
| `getUserMedia`, `MediaStream`                               | `nutrition/components/BarcodeScanner.tsx`                                                                                | `expo-camera`.                                                                                                      |
| `@zxing/browser` + `@zxing/library`                         | те саме                                                                                                                  | `expo-camera` barcode scanner.                                                                                      |
| `BarcodeDetector`                                           | те саме                                                                                                                  | те саме.                                                                                                            |
| `vite-plugin-pwa` / Workbox                                 | `apps/web` build                                                                                                         | **не мігруємо**, залишається тільки на web.                                                                         |
| `react-router-dom`                                          | `apps/web/src/core/App.tsx`                                                                                              | `expo-router`.                                                                                                      |
| Tailwind class-names                                        | скрізь                                                                                                                   | NativeWind (Q5).                                                                                                    |
| `body-highlighter`                                          | `fizruk/components/BodyAtlas.tsx`                                                                                        | §6.8.                                                                                                               |
| `navigator.vibrate`                                         | `shared/lib/haptic.ts`                                                                                                   | `expo-haptics` через адаптер з тією ж сигнатурою (**R7**).                                                          |
| `@dnd-kit/*` drag-and-drop                                  | `core/HubDashboard.tsx` (reorder), routine habits                                                                        | `react-native-gesture-handler` + `react-native-reanimated` (власна логіка). Done у §5.4 / `DraggableDashboard`.     |
| `react-virtuoso`                                            | довгі стрічки в фінік / фізрук                                                                                           | `@shopify/flash-list` (drop-in FlatList замінник).                                                                  |
| `react-markdown`                                            | `core/components/AssistantMessageBody.tsx` (HubChat)                                                                     | `react-native-markdown-display` або `@react-native/markdown-display`.                                               |
| `Blob` + `URL.createObjectURL` + `a.download` (JSON backup) | `routine/components/RoutineBackupSection.tsx`, `fizruk/pages/Progress.tsx`, `nutrition/hooks/useNutritionCloudBackup.ts` | `expo-file-system` (запис у cache) + `expo-sharing` (share sheet). Обгорнути як `exportJson` (**R8**).              |
| `<input type="file">` для фото                              | `nutrition/NutritionApp.tsx`                                                                                             | `expo-image-picker` + `expo-image-manipulator` (resize / compression).                                              |
| `FileReader` → base64                                       | `nutrition/lib/fileToBase64.ts`                                                                                          | `FileSystem.readAsStringAsync({ encoding: EncodingType.Base64 })`.                                                  |
| `window.visualViewport` + resize inset                      | `shared/hooks/useVisualKeyboardInset.ts`                                                                                 | RN `Keyboard` events + `KeyboardAvoidingView`, або `react-native-keyboard-controller` (**R9**).                     |
| `document.activeElement` + Tab / Escape trap                | `shared/hooks/useDialogFocusTrap.ts`                                                                                     | Викидаємо на мобілці — RN `Modal` + `BackHandler` (Android) покривають UX. iOS свайп-back з `react-native-screens`. |
| `useDarkMode` через `matchMedia` + `localStorage`           | `shared/hooks/useDarkMode.ts`                                                                                            | `useColorScheme()` з `react-native` + MMKV-override через спільний storage-адаптер.                                 |
| SW-update / iOS install banner / PWA action                 | `core/app/useSWUpdate.ts`, `core/app/useIosInstallBanner.ts`, `shared/hooks/usePwaAction.ts`                             | **Викидаємо**. OTA — `expo-updates`; «встановити додаток» — стор-сторінка замість banner-а.                         |
| `@sentry/react`                                             | `core/observability/sentry.ts`                                                                                           | `@sentry/react-native` (§5.1, Phase 12).                                                                            |
| `@axe-core/playwright`                                      | `apps/web/tests/a11y`                                                                                                    | **Не мігруємо**. На RN a11y — Detox + `accessibilityLabel` / `accessibilityRole` асерти.                            |
| `Intl.DateTimeFormat` / `toLocaleString`                    | всюди для дат / валют                                                                                                    | Expo 52 / Hermes тягне повний Intl (since RN 0.73). Smoke-тест української локалі — у Phase 2.                      |

## 8. Тестування

- `packages/*` — той самий Jest / Vitest, зелене CI = зелено для обох
  клієнтів.
- `apps/mobile` — Jest (`jest-expo`) + `@testing-library/react-native`
  для unit / component.
- E2E — **Detox** (Q8). Smoke-сьюти —
  `finyk-manual-expense.e2e.ts`, `finyk-transactions.e2e.ts`,
  `routine-smoke.e2e.ts`, `hub-ux-smoke.e2e.ts` (auth-bypass через
  `EXPO_PUBLIC_E2E=1` у `app/(tabs)/_layout.tsx`). Full sign-in→module
  →sign-out (✅) — `routine-full.e2e.ts`, `fizruk-full.e2e.ts`,
  `finyk-full.e2e.ts`, `nutrition-full.e2e.ts`. Last two групи
  ганяють real Better Auth client через mock-fetch interceptor
  (`apps/mobile/src/auth/e2eAuthMock.ts`) під прапором
  `EXPO_PUBLIC_E2E_REAL_AUTH=1` — синтетичний тестовий обліковий запис
  (`e2e-detox@sergeant.test` / `detox-pass-2026`, переоверридується
  через `EXPO_PUBLIC_E2E_USER_EMAIL` / `_PASSWORD`). Деталі — у
  `apps/mobile/e2e/README.md`.
- Ручне smoke-тестування — Expo Dev Client на фізичному пристрої
  (iOS + Android) перед кожним merge у master після Phase 4.

## 9. CI/CD

- Наявний CI (`turbo run lint | typecheck | test`) уже покриває
  `@sergeant/mobile` (`lint` + `typecheck` скрипти у `package.json` є).
- Перевірка `app.config.ts` — скрипт `check-build-config` уже існує.
- **Detox E2E — дві паралельні лінії** (див.
  [`apps/mobile/e2e/README.md`](../../apps/mobile/e2e/README.md)):
  - `.github/workflows/detox-ios.yml` — `macos-14`, iPhone 15
    simulator, `expo prebuild → pod install → pnpm e2e:build:ios →
pnpm e2e:test:ios`. Тригер: `pull_request` + `push` на `main`
    (mobile-scoped paths) + `workflow_dispatch`.
  - `.github/workflows/detox-android.yml` — `ubuntu-latest` + KVM,
    AVD `Pixel_5_API_34` через `reactivecircus/android-emulator-runner`,
    `expo prebuild → pnpm e2e:build:android → pnpm e2e:test:android`
    з кешами pnpm store / gradle / AVD snapshot. Той самий suite-сет,
    що й iOS.
  - Обидва workflows завантажують `apps/mobile/.detox-artifacts` на
    failure (логи + скріншоти).
- EAS builds — окремий workflow (fire-on-tag, не на кожному PR).
- Preview-builds через **EAS Update** для internal testing без
  повного rebuild.

## 10. App Store / Play Store

### 10.1 iOS `Info.plist` usage descriptions (прив'язані до модулів)

- `NSCameraUsageDescription` — nutrition barcode + photo.
- `NSPhotoLibraryUsageDescription` — nutrition photo-аналіз (галерея).
- `NSPhotoLibraryAddUsageDescription` — якщо зберігаємо WeeklyDigest PDF.
- `NSMicrophoneUsageDescription` — voice input (HubChat).
- `NSSpeechRecognitionUsageDescription` — `expo-speech-recognition`.
- `NSUserNotificationsUsageDescription` /
  `NSRemindersUsageDescription` — routine reminders (опційно, якщо
  пишемо в Reminders.app).
- `NSFaceIDUsageDescription` — якщо додаватимемо app-lock на
  фінансовий модуль (потенційно, не MVP).
- `NSLocalNetworkUsageDescription` — якщо буде само-детект-превью
  (dev-only, віддалено).

### 10.2 Android runtime permissions

- `CAMERA` — nutrition barcode, photo capture.
- `READ_MEDIA_IMAGES` (API 33+) / `READ_EXTERNAL_STORAGE` (<33) —
  photo gallery pick.
- `RECORD_AUDIO` — voice input.
- `POST_NOTIFICATIONS` (API 33+) — reminders + sync-push.
- `SCHEDULE_EXACT_ALARM` (API 33+) — routine reminders.
- `USE_BIOMETRIC` — якщо додаватимемо app-lock.

### 10.3 Store-асети

- iOS: Apple Developer account, App Store Connect app record, privacy
  manifest (`PrivacyInfo.xcprivacy`), App Tracking Transparency
  (ймовірно NO — ми не треки), push-сертифікати APNs.
- Android: Google Play Console, internal testing track, Data Safety
  form, notification channel declarations.
- Legal: Privacy Policy URL, Terms of Use.
- Billing: Stripe billing-контракт ([`48458c9`](https://github.com/Skords-01/Sergeant/commit/48458c9a))
  додає категорію «Purchases / Financial Info» у Apple privacy labels та
  Google Data Safety (тип «Payment info: Purchase history»). Перед першою
  публікацією — узгодити з App Store Review Guidelines §3.1: цифрові
  підписки потребують StoreKit (iOS) / Google Play Billing (Android), а не
  Stripe Checkout. Stripe залишаємо лише для не-IAP сценаріїв (фіз. товари /
  послуги поза app-ом). Деталі IAP-стратегії — окремий документ перед
  Phase 11.
- Assets: іконка, splash, screenshots (5.5″ / 6.5″ iOS, Android
  phone / tablet).

## 11. Технічний борг, який мігрує разом з RN

Під час порту ми змушені винести pure-частини з `apps/web/src` у пакети.
План рефакторингів-супутників (один R-пункт = один PR перед відповідною
фазою, щоб mobile-PR був малий і тільки про UI):

| ID  | Зміст                                                                                                                                                                                                                                  | Статус  | PR                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| R1  | `storageKeys.ts` → `@sergeant/shared`.                                                                                                                                                                                                 | ✅ Done | [#405](https://github.com/Skords-01/Sergeant/pull/405)                                                          |
| R2  | `hubSearchEngine.ts` (pure-скорінг) + типи / реєстр рекомендацій + finance-правила → новий DOM-free пакет `@sergeant/insights`. LS-обгортки лишаються в `apps/web`.                                                                    | ✅ Done | [#414](https://github.com/Skords-01/Sergeant/pull/414)                                                          |
| R3  | `modules/finyk/lib/*`, `domain/*`, `constants.ts`, `utils.ts` → `@sergeant/finyk-domain`. Web-шіми у `apps/web/src/modules/finyk/{domain,lib}/*` видалено, імпорти переведено напряму.                                                 | ✅ Done | [#415](https://github.com/Skords-01/Sergeant/pull/415)                                                          |
| R4  | `modules/fizruk/data/*` (exercise library) + pure `domain/*` і `lib/*` → `@sergeant/fizruk-domain`. У `apps/web` лишилася тонка `localStorage`-обгортка.                                                                               | ✅ Done | [#418](https://github.com/Skords-01/Sergeant/pull/418)                                                          |
| R5  | Усі domain- і HTTP-schemas централізовано у `packages/shared/src/schemas/`. `apps/mobile/src` `zod` не використовує. Залишок `zod` у `apps/web` — інфраструктурний (`typedStore`, `featureFlags`).                                     | ✅ Done | by-construction (перевірено 2026-04-20)                                                                         |
| R6  | Tailwind preset + дизайн-токени → `@sergeant/design-tokens`. `apps/web/tailwind.config.js` і `apps/mobile/tailwind.config.js` обидва підключають один preset.                                                                          | ✅ Done | [#406](https://github.com/Skords-01/Sergeant/pull/406)                                                          |
| R7  | Haptics — pure-контракт `HapticAdapter` + `hapticTap / Success / Warning / Error / Cancel / Pattern` у `@sergeant/shared/lib/haptic`. Web — `navigator.vibrate`. Mobile — `expo-haptics`. Реєстрація у entrypoint-ах.                  | ✅ Done | [#425](https://github.com/Skords-01/Sergeant/pull/425) + [#428](https://github.com/Skords-01/Sergeant/pull/428) |
| R8  | File download / import — pure-контракт у `@sergeant/shared/lib/fileDownload`. Web — `Blob` + `URL.createObjectURL`. Mobile — `expo-file-system` + `expo-sharing` + `expo-document-picker`. Усі 5 web-споживачів JSON-backup мігровано. | ✅ Done | [#432](https://github.com/Skords-01/Sergeant/pull/432) + [#437](https://github.com/Skords-01/Sergeant/pull/437) |
| R9  | Visual-keyboard inset — pure-хук `useVisualKeyboardInset(active)` у `@sergeant/shared/hooks`. Web — `window.visualViewport`. Mobile — `Keyboard.addListener` (без додаткових deps). 5 споживачів мігровано.                            | ✅ Done | [#433](https://github.com/Skords-01/Sergeant/pull/433)                                                          |

**Post-R-track cleanup.** Після закриття R1–R9 виконано точкове прибирання
мертвих експортів у `apps/web/src` ([#439](https://github.com/Skords-01/Sergeant/pull/439)):
~18 символів у 7 секціях (constants, types, runtime helpers, pantry CRUD,
foodDb export / import, UI). Жодних змін у публічному API `@sergeant/*`
пакетів чи в `apps/mobile`.

### 11.1 Mobile stubs backlog (єдиний трек)

Зведення навмисних заглушок і відкладених інтеграцій, щоб не розмазувати
їх по окремих issue без зв'язку з фазами вище.

| Зона                        | Файл (приклад)                                                                                           | Цільова фаза / PR          | Коротко                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| JSON backup download        | `apps/mobile/src/lib/fileDownload.ts`                                                                    | ~~Phase 4+ (R8)~~ Done     | `expo-file-system` + `expo-sharing` + `expo-document-picker`. Import / export UI live in `GeneralSection`. |
| Weekly digest UI            | `apps/mobile/src/core/dashboard/WeeklyDigestCard.tsx`                                                    | Після паритету з web       | Мінімальний stub замість повного `WeeklyDigestCard` з PWA.                                                 |
| Deep links / hub маршрути   | `apps/mobile/src/components/DeepLinkPlaceholder.tsx`, `apps/mobile/src/modules/finyk/pages/PageStub.tsx` | За мірою появи екранів     | Плейсхолдери до повного nested-стеку.                                                                      |
| Observability               | `apps/mobile/src/core/ModuleErrorBoundary.tsx`                                                           | Phase 12+                  | `TODO(phase-12):` `@sentry/react-native` breadcrumbs + performance.                                        |
| Haptics `pattern`           | `apps/mobile/src/lib/haptic.ts`                                                                          | RN API                     | `expo-haptics` не експонує pattern — no-op + TODO.                                                         |
| Universal links             | `apps/mobile/app.config.ts`                                                                              | Публікація / Phase 10+     | Associated domains після стабільного прод-домену.                                                          |
| Routine reminders vs web SW | `apps/mobile/src/modules/routine/hooks/useRoutineReminders.ts`                                           | Паралельно з нотифікаціями | Коментар про відмінність від web Service Worker.                                                           |

## 12. Ризики

- **Expo SDK upgrade cadence** — ми на SDK 52 (LTS на момент написання),
  далі треба планувати підйоми SDK, кожен ламає щось у нативних
  плагінах.
- **Реюз `apps/web` компонентів через `react-native-web`** — можливо,
  але не ціль: PWA і native мають різні UX. Розглядаємо лише як
  запасний сценарій для Hub-чату або DesignShowcase.
- **Розмір бандла** — усі `@sergeant/*` тягнуться сирим TS у Metro;
  треба стежити за tree-shake-ом, особливо `@sergeant/finyk-domain` /
  `@sergeant/fizruk-domain`.
- **iOS background quota** — scheduled notifications + offline queue
  можуть впертись в iOS-обмеження фонових тасків. MVP — через
  push-пінг від сервера, не клієнт-сайд cron.
- **Apple App Review** — «personal finance» + AI-чат = підвищена увага.
  Потрібен чіткий privacy policy і пояснення, що дані Monobank
  користувача ніколи не виходять за межі його сесії.
- **Hermes `Intl.*` покриття.** Web активно використовує
  `toLocaleDateString`, `Intl.NumberFormat` для дат / валют у
  finyk / nutrition. RN 0.76 + Hermes має повний Intl за дефолтом, але
  потрібен smoke-тест української локалі (компонент зі всіма
  формат-варіантами) у Phase 2.
- **OTA-оновлення.** `expo-updates` дозволяє пушити JS-only фікси без
  store-review. Потрібна стратегія каналів (dev / preview / prod),
  щоб не зламати версіювання. Планується на Phase 11.

## 13. Прийняті рішення (Q1–Q14)

> Закриті рішення — так, ці питання колись були відкритими. Якщо треба
> переглянути — окремий PR з мотивацією у «Нотатки». Q11–Q14 додано
> після того як storage-roadmap і `apps/mobile-shell` стали окремими
> треками; повний контекст — у [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md).

- **Q1. Доля `apps/web` після міграції.** ✅ **(a) — залишаємо PWA + mobile паралельно.**
  Сайт продовжує розвиватись як окремий продуктивний клієнт для
  desktop-юзкейсу. Mobile — додатковий канал, не заміна.
- **Q2. Публікація в магазинах як MVP-ціль.** ✅ **Internal Testing після Phase 4 (Фінік).**
  Фактичний старт Internal Testing відкладається до моменту оформлення
  Apple Developer Program і Google Play Developer акаунтів. До того часу
  тестуємо на фізичному пристрої через Expo Dev Client (Q4). Задача
  «оформити Developer-акаунти» — у Phase 11 як blocker.
- **Q3. Sync-стек на мобілці.** ✅ **`react-native-mmkv` з самого початку.**
  Пропустили проміжний етап AsyncStorage — одразу швидкий sync-стор.
  Адаптер сховища (`apps/mobile/src/lib/storage.ts`) має той самий shape,
  що й web `shared/lib/storage.ts`.
- **Q4. Dev Client vs Expo Go.** ✅ **Expo Dev Client з Phase 1.**
  Налаштовуємо EAS-збірку dev-профайлу. Плюси: свобода вибору нативних
  бібліотек (voice, MMKV на new arch без обмежень). Мінуси: 1–2 год
  EAS-setup на старті.
- **Q5. Стильова система.** ✅ **NativeWind.**
  Класова Tailwind-like API. `tailwind.config` розшарено між web і
  mobile через `@sergeant/design-tokens` preset (R6).
- **Q6. Speech-to-text на мобілці.** ✅ **`expo-speech-recognition` як primary, server-side Whisper як fallback.**
  Працює з Dev Client. Паралельно — fallback-ендпоінт
  `POST /api/v1/speech/transcribe` (Whisper).
- **Q7. Бібліотека графіків.** ✅ **`victory-native`.**
  Реюзаний у Phase 4 (Фінік) і Phase 6 (Фізрук). Обгортка-адаптер у
  `apps/mobile/src/modules/<m>/components/charts/`, щоб пізніше можна
  було безболісно замінити.
- **Q8. E2E тестування.** ✅ **Detox.**
  Відступили від рекомендації Maestro — беремо Detox через ширші
  можливості. Setup додає сесійних витрат, але в довгостроковій
  перспективі окупиться. Перший E2E-сьют — паралельно з Phase 4.
- **Q9. Brand / design consistency.** ✅ **Оновлено `brandbook.md`** ([#409](https://github.com/Skords-01/Sergeant/pull/409)).
  Додано секцію «Native Patterns (iOS / Android)»: haptics
  (Light / Medium / Heavy), safe-area правила, native-gesture-паттерни
  (swipe-back, pull-to-refresh), тип-скейл адаптації під iOS HIG /
  Material, dark-mode через `useColorScheme()`, motion + reduce-motion.
  Web-look не змінено.
- **Q10. Monobank OAuth на мобілці.** ✅ Технічна перевірка в рамках
  Phase 4 — без блокування. Очікуємо, що токен-флоу через
  `apps/server` працює без змін (клієнт лише вставляє токен).
- **Q11. SQLite-стек на мобілці.** ✅ **`expo-sqlite` v15 (SDK 52 first-class) через `drizzle-orm/expo-sqlite`** — [PR #1307](https://github.com/Skords-01/Sergeant/pull/1307).
  Schema — спільна з web/server у `packages/db-schema/src/sqlite/*` (TEXT-uuid,
  JSON-as-TEXT, `_lite`-suffix у іменах індексів). Module-data, що раніше
  жила цілим JSON-блобом у MMKV (`module_data.<m>`), тепер дублюється у
  локальний SQLite під фіче-флагом `feature.<m>.sqlite_v2.dual_write`,
  а потім cut-over reads через `feature.<m>.sqlite_v2.read_sqlite`.
  Поточний прогрес cut-over (читай storage-roadmap Stage 4): routine,
  fizruk, nutrition, finyk — Done. Templates / saved recipes / weekPlan —
  ще на legacy-LS/MMKV-слоті, чекають окремих cut-over PR-серій.
- **Q12. SQLite-стек на web.** ✅ **`@sqlite.org/sqlite-wasm` + OPFS-SAH worker** — [PR #1310](https://github.com/Skords-01/Sergeant/pull/1310).
  Lazy-loaded, тримає COOP/COEP cross-origin isolation на app-routes.
  Та сама Drizzle-схема з `packages/db-schema`. Resolved over SQLocal /
  PGlite через простішу integration з Drizzle і нижчий runtime cost.
- **Q13. Sync engine architecture.** ✅ **op-log + SSE pull + per-row apply-fns на сервері; PN-counter CRDT для streaks.**
  Замінив попередній `module_data.<m>` LWW push/pull (storage-roadmap
  Stage 5). На клієнті — outbox-таблиці у SQLite (`syncOpOutbox*`), flush
  через `useSyncEngine` writer-loop. На сервері — `/v2/sync/{push,pull}`
  - SSE real-time. Старий CloudSync v1 (`apps/web/src/core/cloudSync/`)
    вже видалений на web; mobile поступово перевозиться на той самий
    writer-wiring (план у `docs/superpowers/plans/2026-05-06-sync-engine-writer-wiring.md`).
- **Q14. `apps/mobile-shell` (Capacitor wrapper над web) — паралельний реліз-шлях?** 🟡 **Open.**
  Workspace `apps/mobile-shell` обгортає `apps/web` через Capacitor 7 на
  Android + iOS, має 4 active CI workflows
  (`mobile-shell-{android,ios}{,-release}.yml`) і потенційно потрапляє
  у Store раніше, ніж повний RN-порт через `apps/mobile`. Ризик — дрейф
  UX між двома мобільними клієнтами і дублікація bug-fix-ів. Треба
  фіксувати: лишаємо обидва (mobile-shell — як bridge до RN-MVP) чи
  sunset одного (зараз mobile-shell ще активний, див. §12).

## 14. Як читати цей документ

- **«А що я можу вже зараз робити?»** → переходь у `apps/mobile`,
  запускай `pnpm --filter @sergeant/mobile start`.
- **«Який наступний крок?»** → §2.0 (Snapshot прогресу) + §4
  (Фазований план).
- **«Що саме перенести з модуля X?»** → §5.X.
- **«Чим замінити `getUserMedia` / `localStorage` / …?»** → §7.
- **«Що блокує роботу над чимось?»** → §13 (прийняті рішення Q1–Q10).
- **«Як оновити цей документ після merged-у PR-а?»** → playbook
  [`sync-rn-migration-progress.md`](../playbooks/sync-rn-migration-progress.md).

---

_Документ живий. Редагуй у місці, де з'являється новий факт — не
додавай секції-зміни «Що нового з 12.04». PR-опис в історії git
закриває цю потребу._
