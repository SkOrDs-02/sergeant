# Service Worker (apps/web)

> **Last validated:** 2026-05-14 by Devin. **Next review:** 2026-08-12.
> **Status:** Active

Внутрішня документація стратегії оновлення Service Worker-а у `apps/web`. Базовий entry-point — [`apps/web/src/sw.ts`](../../apps/web/src/sw.ts) (через `vite-plugin-pwa`). Build-id інжектиться у клієнт через `import.meta.env.VITE_BUILD_ID` (Vite `define`-pattern), а на сервері — через cascade `SENTRY_RELEASE → RAILWAY_GIT_COMMIT_SHA → VERCEL_GIT_COMMIT_SHA → GITHUB_SHA → BUILD_ID`.

## Update strategy: prompt + idle-auto + hard-floor

Stack-pulse 2026-05 / [PR-21](../initiatives/stack-pulse-2026-05/pr-21-sw-prompt-mode-auto-update.md) додає три шари до базового `prompt`-mode-у `vite-plugin-pwa`. Усі шари компонуються — кожен «зловить» свій клас stale-станів без зайвих UI-сюрпризів для активного user-а.

### Шар 1 — manual prompt (baseline)

Без змін: `vite-plugin-pwa` у `prompt`-mode викликає `onNeedRefresh` коли встановиться `waiting`-SW. [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx) виставляє `window.__pwaUpdateReady = true` і dispatch-ить `pwa-update-ready`-event; [`useSWUpdate`](../../apps/web/src/core/app/useSWUpdate.ts) показує toast «Доступна нова версія / Оновити».

### Шар 2 — periodic update polling

[`setupAutoUpdate()`](../../apps/web/src/core/app/autoUpdate.ts) (мунтиться відразу після `registerSW`) кожні **30 хвилин** викликає `registration.update()`. Якщо нова версія SW з'явилась на CDN, browser стягне її і переведе у `waiting` стан → стандартний `onNeedRefresh` спрацює і user побачить toast. Trade-off:

- 1 HEAD/GET на SW manifest кожні 30 хв — мінімальний bandwidth.
- Skip якщо `navigator.connection.saveData === true` (mobile-юзер на economy-режимі).

### Шар 3 — idle auto-skipWaiting

Якщо tab був у `document.visibilityState === "hidden"` довше **5 хвилин** _і_ існує `waiting`-SW коли user повертається — `setupAutoUpdate()` сам викликає `updateSW(true)` (skip-waiting + reload). User не бачить prompt-у бо AFK-ситуація = «свіжий старт» по UX. Активного user-а (visibilityState весь час visible) це НЕ зачіпає — він далі побачить manual toast.

Захист від втрати даних: skip-waiting reload відбувається тільки якщо user був AFK >5 хв (це достатньо для browser «forgot last keystroke» поведінки). Активна редакція форми залишається у манulkial-flow Шару 1.

### Шар 4 — build-id hard-floor

Якщо stale client пропустив усі попередні шари (network failure на `registration.update()`, відсутній SW pipeline, mid-deploy race) — кожна `/api/*` відповідь повертає `X-Server-Build-Id: <short-sha>`. [`@shared/api`](../../apps/web/src/shared/api/index.ts) пропускає header у [`serverBuildIdBus`](../../apps/web/src/shared/api/serverBuildIdBus.ts), що bridges-ить його до `setupAutoUpdate`-controller-а через `subscribeServerBuildId`.

Логіка:

1. Перша сесія `serverBuildId !== clientBuildId` (`import.meta.env.VITE_BUILD_ID`) запускає grace-timer на **1 годину**.
2. Якщо за годину mismatch зберігається — controller dispatch-ить `pwa-update-ready` (як manual toast). User бачить prompt незалежно від idle-state-у.
3. Якщо server наздогнав client раніше (rollback, multi-instance race) — timer скасовується, mismatch-state очищується. Майбутні divergence пере-запускають timer.

Цей шар захищає лише від клієнтів, що активно ходять у API (без API-trafic — немає observation). Для повністю idle web-tab-у Шар 2/3 покривають update-flow.

## Сервер: `X-Server-Build-Id`

[`apps/server/src/http/buildIdHeader.ts`](../../apps/server/src/http/buildIdHeader.ts) реалізує middleware, що стампить заголовок на КОЖНУ відповідь:

- Cascade SENTRY_RELEASE → RAILWAY_GIT_COMMIT_SHA → VERCEL_GIT_COMMIT_SHA → GITHUB_SHA → BUILD_ID (resolve-стратегія консистентна з [`resolveSentryRelease`](../../apps/server/src/sentry.ts)).
- Значення обрізається до 7 char (`git rev-parse --short HEAD`-стандарт).
- Якщо cascade повертає `null` (локальний dev без жодного SHA) — header не виставляється, клієнт трактує відсутність як «unknown server build» і НЕ форсить prompt.
- [`apps/server/src/http/apiCors.ts`](../../apps/server/src/http/apiCors.ts) виставляє `X-Server-Build-Id` у `Access-Control-Expose-Headers`, інакше cross-origin Vercel → Railway не побачив би заголовок.

## Capacitor-shell (mobile)

`isCapacitor()` гейт + `import.meta.env.VITE_TARGET === "capacitor"` build-time-флаг повністю DCE-ять SW-гілку — Capacitor WebView не використовує SW. Update-flow для mobile = standard App Store / Play OTA flow + EAS Update (окрема історія).

## Тести

- [`apps/web/src/core/app/autoUpdate.test.ts`](../../apps/web/src/core/app/autoUpdate.test.ts) — JSDOM + fake timers: periodic polling, saveData skip, idle-skipWaiting, no-waiting-SW guard, build-id mismatch force-prompt + reset on catch-up, ignores empty observations.
- [`apps/server/src/http/buildIdHeader.test.ts`](../../apps/server/src/http/buildIdHeader.test.ts) — cascade priority, 7-char truncation, missing-env behavior.

## Як змінювати константи

`updateIntervalMs` / `idleSkipWaitingMs` / `buildIdMismatchPromptMs` приймаються як `setupAutoUpdate({ ... })` options для тестів. Дефолти: 30 хв / 5 хв / 60 хв. **Не міняй дефолти без ADR** — це user-visible UX behavior.

## Дотичні файли

- [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx) — wire-up
- [`apps/web/src/core/app/autoUpdate.ts`](../../apps/web/src/core/app/autoUpdate.ts) — controller
- [`apps/web/src/core/app/useSWUpdate.ts`](../../apps/web/src/core/app/useSWUpdate.ts) — toast hook (Шар 1)
- [`apps/web/src/shared/api/serverBuildIdBus.ts`](../../apps/web/src/shared/api/serverBuildIdBus.ts) — pub-sub bus
- [`apps/web/src/shared/api/index.ts`](../../apps/web/src/shared/api/index.ts) — api-client `onResponseHeaders` wiring
- [`packages/api-client/src/httpClient.ts`](../../packages/api-client/src/httpClient.ts) — `onResponseHeaders` hook contract
- [`apps/server/src/http/buildIdHeader.ts`](../../apps/server/src/http/buildIdHeader.ts) — server middleware
- [`apps/server/src/http/apiCors.ts`](../../apps/server/src/http/apiCors.ts) — `Access-Control-Expose-Headers` allowlist
- [`apps/server/src/app.ts`](../../apps/server/src/app.ts) — middleware mount point
