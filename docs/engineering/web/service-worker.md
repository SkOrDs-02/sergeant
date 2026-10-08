# Service Worker (apps/web)

> **Last touched:** 2026-10-08 by @claude (Шар 3: idle-reload не руйнує форми, reload лише у вкладці-ініціаторі, applyUpdate чекає controllerchange). **Next review:** 2026-12-16.
> **Status:** Active

Внутрішня документація стратегії оновлення Service Worker-а у `apps/web`. Базовий entry-point — [`apps/web/src/sw.ts`](../../../apps/web/src/sw.ts) (через `vite-plugin-pwa`). Build-id інжектиться у клієнт через `import.meta.env.VITE_BUILD_ID` (Vite `define`-pattern), а на сервері — через cascade `SENTRY_RELEASE → GIT_SHA → SOURCE_COMMIT → VERCEL_GIT_COMMIT_SHA → GITHUB_SHA → BUILD_ID` ([`apps/server/src/http/buildIdHeader.ts`](../../../apps/server/src/http/buildIdHeader.ts); `GIT_SHA` запікає `Dockerfile.api` (`${GIT_SHA:-${SOURCE_COMMIT}}`), `SOURCE_COMMIT` дає Coolify, що збирає образ з репо, ADR-0102 — `RAILWAY_GIT_COMMIT_SHA` знято разом із Railway, ADR-0074).

## Update strategy: prompt + idle-auto + hard-floor

Stack-pulse 2026-05 / [PR-21](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/stack-pulse-2026-05/archive/pr-21-sw-prompt-mode-auto-update.md) додає три шари до базового `prompt`-mode-у `vite-plugin-pwa`. Усі шари компонуються — кожен «зловить» свій клас stale-станів без зайвих UI-сюрпризів для активного user-а.

### Інваріант: `install` НЕ робить `skipWaiting()`

Найважливіше правило цього файлу — [`apps/web/src/sw.ts`](../../../apps/web/src/sw.ts) не має форсувати активацію в `install`. Форсована активація тихо вимикає всі шари, що спираються на `waiting`-воркера (1-3). Шар 4 переживає її — він працює з HTTP-заголовка і `registration.waiting` не потребує, — але залишається сам на себе: плашка приходить із запізненням у годину, а спрацювати їй дає лише reload-фолбек в `applyUpdate`. Саме так репо прожило до 2026-08-05:

- `vite-plugin-pwa` у `prompt`-mode вішає `onNeedRefresh` рівно на workbox-подію `waiting`, а `workbox-window` спеціально захищений від skipWaiting-в-install: чекає 200 мс і диспатчить `waiting`, лише якщо воркер УСЕ ЩЕ в `waiting` (перехід у `activating` скидає таймер). Воркер, що активується миттєво, події не дає — плашка «Доступна нова версія» не приходить ніколи.
- `updateSW()` зводиться до `wb.messageSkipWaiting()`, який шле `SKIP_WAITING` лише за наявності `registration.waiting`. Без нього клік по «Оновити» — no-op, бо і reload робить слухач `controlling`, зареєстрований у момент `onNeedRefresh`.
- Шар 3 (idle auto-skipWaiting) перевіряє `reg.waiting` — теж завжди `null`.
- `clients.claim()` віддає живій вкладці новий precache під старим JS-графом у пам'яті. Перший же lazy-чанк зі старим хешем падає в 404 → [`chunkReload.ts`](../../../apps/web/src/core/lib/chunkReload.ts) робить `location.reload()` без запиту, з'їдаючи незбережений ввід.

Проти «застряглої на тижні» версії в iOS-PWA (заради чого `skipWaiting()` колись і додали) працюють Шар 2 і Шар 4 — вони не потребують негайної активації.

### Шар 1 — manual prompt (baseline)

`vite-plugin-pwa` у `prompt`-mode викликає `onNeedRefresh` коли встановиться `waiting`-SW. [`apps/web/src/main.tsx`](../../../apps/web/src/main.tsx) виставляє `window.__pwaUpdateReady = true` і dispatch-ить `pwa-update-ready`-event. Далі подію споживають дві поверхні:

- [`useSWUpdate`](../../../apps/web/src/core/app/useSWUpdate.ts) показує toast «Доступна нова версія / Оновити» — хук живе в `RootLayout`, тож toast видно на будь-якому маршруті;
- [`HubHomeView`](../../../apps/web/src/core/app/HubHomeView.tsx) додає рядок `sw-update` у дзвіночок [`NotificationBell`](../../../apps/web/src/core/app/NotificationBell.tsx) — лише на Hub-home і не під час FTUX-сесії.

`applyUpdate` тримає фолбек: якщо waiting-воркера не видно (плашку підняв Шар 4, а не SW-шлях), робиться прямий `location.reload()` — інакше клік не дав би нічого.

Якщо waiting-воркер є, `applyUpdate` шле `SKIP_WAITING` і сам чекає `controllerchange` (одноразовий слухач), після чого робить `location.reload()` рівно один раз (`reloadOnce`) — незалежно від `isUpdate` у `vite-plugin-pwa`, тож перша сесія, де SW встановився під час цього ж завантаження, теж перезавантажується (rel-14). Якщо `controllerchange` не прийшов за **3 с** (старий воркер ще тримає lame-duck, до 5 хв), користувач бачить тост «Застосовую оновлення…» з кнопкою «Перезавантажити» замість мовчання; слухач лишається, тож пізня активація все одно перезавантажить вкладку. Reload на `controllerchange` поза кліком «Оновити» не робиться: перший воркер активується з `clients.claim()` посеред буту.

### Шар 2 — periodic update polling

[`setupAutoUpdate()`](../../../apps/web/src/core/app/autoUpdate.ts) (мунтиться відразу після `registerSW`) кожні **30 хвилин** викликає `registration.update()`. Якщо нова версія SW з'явилась на CDN, browser стягне її і переведе у `waiting` стан → стандартний `onNeedRefresh` спрацює і user побачить toast. Trade-off:

- 1 HEAD/GET на SW manifest кожні 30 хв — мінімальний bandwidth.
- Skip якщо `navigator.connection.saveData === true` (mobile-юзер на economy-режимі).

### Шар 3 — idle auto-skipWaiting

Якщо tab був у `document.visibilityState === "hidden"` довше **5 хвилин** _і_ існує `waiting`-SW коли user повертається — `setupAutoUpdate()` викликає `updateSW(true)` (skip-waiting + reload): AFK = «свіжий старт» по UX. Активного user-а (visibilityState весь час visible) це НЕ зачіпає — він далі бачить manual toast.

**Захист від втрати даних (data-45).** Сама тривалість AFK не гарантує, що вводу немає: людина відкрила аркуш витрати, перемкнулась у банк звірити суму і повернулась через 6 хв. Тому перед `updateSW(true)` `autoUpdate` питає [`isForcedReloadBlocked`](../../../apps/web/src/core/app/updateGate.ts) і **пропускає тихий reload**, якщо:

- реєстр «брудного» стану [`dirtyState`](../../../apps/web/src/shared/lib/ui/dirtyState.ts) непорожній: його тримає кожен відкритий `Sheet` (а також центрований `Modal` і `InputDialog`) та непорожній композер HubChat (`useChatSend`). Реєструються через [`useRegisterDirtyState`](../../../apps/web/src/shared/hooks/useRegisterDirtyState.ts) — на open, знімається на close/unmount. Реєстр лічить джерела й не зберігає чернеток (у `sessionStorage` вони свідомо не пишуться);
- триває стрім HubChat (`isHubStreaming`);
- є мутації в польоті (`isMutating` з `QueryClient`, передається з `main.tsx`).

Waiting-SW тоді лишається, а користувач бачить manual toast Шару 1 і вирішує сам. Консервативність свідома: зараховується кожен відкритий аркуш, не лише той, де вже введено текст — зайва відстрочка тихого reload нічого не коштує. Повторна спроба — наступне повернення у вкладку після ≥5 хв у фоні.

**Reload лише у вкладці, що ініціювала оновлення.** `vite-plugin-pwa` вішає слухач `controlling` у кожній вкладці, де піднімали плашку, і без власного `onNeedReload` перезавантажував усі, коли оновлення прийняли в одній. Тепер `main.tsx` передає `onNeedReload` ([`swReload.ts`](../../../apps/web/src/core/app/swReload.ts)): вкладка, що натиснула «Оновити» (`applyUpdate`) або прийняла idle-оновлення, перезавантажується; в інших `useSWUpdate` показує тост «Застосунок оновлено в іншій вкладці» з кнопкою «Перезавантажити». Інші вкладки тим часом працюють на старому JS проти нового прекешу: перший ліниво підвантажений чанк зі старим хешем дасть 404 і reload через [`chunkReload.ts`](../../../apps/web/src/core/lib/chunkReload.ts), тож тост варто прийняти, але форму він не знищує.

Не входить у цей шар: перехоплення бази іншою вкладкою (`dbOwnership`/`yieldOwnership`, «Працювати тут») — задумана multi-tab специфікація; захист введеного там потребує окремого UX-рішення.

### Шар 4 — build-id hard-floor

Якщо stale client пропустив усі попередні шари (network failure на `registration.update()`, відсутній SW pipeline, mid-deploy race) — кожна `/api/*` відповідь повертає `X-Server-Build-Id: <short-sha>`. [`@shared/api`](../../../apps/web/src/shared/api/index.ts) пропускає header у [`serverBuildIdBus`](../../../apps/web/src/shared/api/serverBuildIdBus.ts), що bridges-ить його до `setupAutoUpdate`-controller-а через `subscribeServerBuildId`.

Логіка:

1. Перше побачене в сесії `serverBuildId` — лише базова лінія. Grace-timer на **1 годину** запускає **зміна** server build id під час сесії (API перевикотили під живою вкладкою), якщо нове значення `!== clientBuildId` (`import.meta.env.VITE_BUILD_ID`). Сама нерівність без зміни — НЕ тригер: веб (Vercel) і API (Coolify) деплояться незалежно і кожен пропускає збірку, якщо його шляхи не зачеплено, тож коміт лише в `apps/server` лишає веб на A, а API на B назавжди; наївне порівняння давало б плашку в кожній сесії довшій за годину (перезавантаження її не прибирало б). Наслідок: після деплою лише API відкрита вкладка може один раз показати плашку «нова версія» (перезавантаження безпечне, нова сесія стартує з новою базовою лінією). **Обидві сторони спершу зводяться до git-short-SHA (7 символів)** — сервер ріже своє значення, а клієнтський `VITE_BUILD_ID` — це повний 40-символьний `VERCEL_GIT_COMMIT_SHA`. Без нормалізації рівність недосяжна навіть для одного коміту, і hard-floor піднімав плашку в кожній сесії через годину (виправлено 2026-08-05).
2. Якщо за годину mismatch зберігається — controller dispatch-ить `pwa-update-ready` (як manual toast). User бачить prompt незалежно від idle-state-у.
3. Якщо server наздогнав client раніше (rollback, multi-instance race) — timer скасовується, mismatch-state очищується. Майбутні divergence пере-запускають timer.

Цей шар захищає лише від клієнтів, що активно ходять у API (без API-trafic — немає observation). Для повністю idle web-tab-у Шар 2/3 покривають update-flow.

## Сервер: `X-Server-Build-Id`

[`apps/server/src/http/buildIdHeader.ts`](../../../apps/server/src/http/buildIdHeader.ts) реалізує middleware, що стампить заголовок на КОЖНУ відповідь:

- Cascade SENTRY_RELEASE → GIT_SHA (build-arg або `SOURCE_COMMIT` через `Dockerfile.api`) → SOURCE_COMMIT (Coolify, ADR-0102) → VERCEL_GIT_COMMIT_SHA → GITHUB_SHA → BUILD_ID (resolve-стратегія консистентна з [`resolveSentryRelease`](../../../apps/server/src/sentry.ts)).
- Значення обрізається до 7 char (`git rev-parse --short HEAD`-стандарт).
- Якщо cascade повертає `null` (локальний dev без жодного SHA) — header не виставляється, клієнт трактує відсутність як «unknown server build» і НЕ форсить prompt.
- [`apps/server/src/http/apiCors.ts`](../../../apps/server/src/http/apiCors.ts) виставляє `X-Server-Build-Id` у `Access-Control-Expose-Headers`, інакше cross-origin Vercel → Coolify backend не побачив би заголовок.

## Capacitor-shell (mobile)

`isCapacitor()` гейт + `import.meta.env.VITE_TARGET === "capacitor"` build-time-флаг повністю DCE-ять SW-гілку — Capacitor WebView не використовує SW. Update-flow для mobile = standard App Store / Play OTA flow + EAS Update (окрема історія).

## Сторож білого екрана

Зрідка статичні залежності entry-модуля помирають з `net::ERR_ABORTED`, головний модуль не виконується, і `#root` лишається порожнім назавжди. Винятку немає, тож [`chunkReload.ts`](../../../apps/web/src/core/lib/chunkReload.ts) не спрацьовує. Прибрані reload на `controllerchange` і `skipWaiting()` в `install` закрили найімовірніші причини ([аудит 2026-08-05, B1](../../work/specs/audits/2026-08-05-browser-profile-testing.md)), але живі прогони 2026-09-28 спіймали той самий симптом ще двічі (онлайн і офлайн), а ізольований цикл на 280 навігацій не відтворив його жодного разу.

Тому симптом лікує [`apps/web/public/boot-watchdog.js`](../../../apps/web/public/boot-watchdog.js): звичайний скрипт перед entry-модулем у `index.html`. Через 8 с після `load` він робить один reload, якщо `#root` так і не отримав дітей. Мітка в `sessionStorage` не дає reload частіше ніж раз на хвилину; без сховища reload не робиться зовсім. Файл окремий, а не інлайн: CSP має `script-src 'self'` без `'unsafe-inline'`. Він потрапляє в precache разом з іншими `*.js`, тож працює й офлайн.

## Тести

- [`apps/web/src/core/lib/bootWatchdog.test.ts`](../../../apps/web/src/core/lib/bootWatchdog.test.ts): reload при порожньому `#root`, тиша при змонтованому, cooldown і відмова без `sessionStorage`.
- [`apps/web/src/core/app/autoUpdate.test.ts`](../../../apps/web/src/core/app/autoUpdate.test.ts) — JSDOM + fake timers: periodic polling, saveData skip, idle-skipWaiting, ПРОПУСК idle-reload при непорожньому реєстрі брудного стану / стрімі HubChat / мутаціях у польоті, no-waiting-SW guard, build-id force-prompt лише після зміни server id у сесії (стабільний `API на B, веб на A` не промптить) + reset on catch-up, short-sha ↔ full-sha нормалізація, ignores empty observations.
- [`apps/web/src/core/app/useSWUpdate.test.ts`](../../../apps/web/src/core/app/useSWUpdate.test.ts) — defer-while-busy + поведінка `applyUpdate`: без waiting-воркера кнопка робить прямий reload; з waiting-воркером reload рівно один раз після `controllerchange`, статус-тост через 3 с без нього; тост замість reload у вкладці, що оновлення не ініціювала.
- [`apps/server/src/http/buildIdHeader.test.ts`](../../../apps/server/src/http/buildIdHeader.test.ts) — cascade priority, 7-char truncation, missing-env behavior.

## Як змінювати константи

`updateIntervalMs` / `idleSkipWaitingMs` / `buildIdMismatchPromptMs` приймаються як `setupAutoUpdate({ ... })` options для тестів. Дефолти: 30 хв / 5 хв / 60 хв. **Не міняй дефолти без ADR** — це user-visible UX behavior.

## Дотичні файли

- [`apps/web/src/sw.ts`](../../../apps/web/src/sw.ts) — entry-point воркера; тут живе інваріант «без `skipWaiting()` в `install`»
- [`apps/web/src/sw/messages.ts`](../../../apps/web/src/sw/messages.ts) — обробник `SKIP_WAITING` (те, що прилітає по кліку «Оновити»)
- [`apps/web/src/main.tsx`](../../../apps/web/src/main.tsx) — wire-up
- [`apps/web/src/core/app/autoUpdate.ts`](../../../apps/web/src/core/app/autoUpdate.ts) — controller
- [`apps/web/src/core/app/useSWUpdate.ts`](../../../apps/web/src/core/app/useSWUpdate.ts) — toast hook (Шар 1)
- [`apps/web/src/shared/api/serverBuildIdBus.ts`](../../../apps/web/src/shared/api/serverBuildIdBus.ts) — pub-sub bus
- [`apps/web/src/shared/api/index.ts`](../../../apps/web/src/shared/api/index.ts) — api-client `onResponseHeaders` wiring
- [`packages/api-client/src/httpClient.ts`](../../../packages/api-client/src/httpClient.ts) — `onResponseHeaders` hook contract
- [`apps/server/src/http/buildIdHeader.ts`](../../../apps/server/src/http/buildIdHeader.ts) — server middleware
- [`apps/server/src/http/apiCors.ts`](../../../apps/server/src/http/apiCors.ts) — `Access-Control-Expose-Headers` allowlist
- [`apps/server/src/app.ts`](../../../apps/server/src/app.ts) — middleware mount point
