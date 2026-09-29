# SPEC: повторювані стани застосунку для E2E-лейнів

> **Last touched:** 2026-09-24 by @claude (spec-інтервʼю з власником, два раунди). **Next review:** 2026-12-24.
> **Status:** Draft

## Проблема

Лейни mobile (`playwright.mobile.config.ts`, 44px-аудит і overflow) і a11y (`playwright.config.ts`, axe) ганяються на прод-білді через `vite preview` без бекенда: API замоканий генеричним `ok: true` у `tests/mobile/audit.ts`, тож майже кожна сторінка міряється порожньою. Єдиний наповнений стан, комора з довгими назвами з чека, сіється вісьмома кліками через UI в `tests/mobile/mobile-ui-audit.spec.ts` і ламається на першій зміні форми. Стани, які реально навантажують верстку (місяць транзакцій Фініка, стріки звичок, активне тренування), недосяжні взагалі, а клієнт-локальні модулі (routine, fizruk, комора) пишуть у SQLite-WASM, куди `page.route` не дістає. Кожен spec-файл тримає власну копію API-мока (`tests/mobile/audit.ts`, `tests/ledger/user-story-ledger.spec.ts`, `tests/smoke/billing-checkout-smoke.spec.ts`), і вони розходяться на першій зміні контракту.

## Мета

Стан застосунку задається один раз як типізований «світ» і застосовується до будь-якої сторінки за один виклик із тесту. Серверні дані приходять через один роутер `page.route` з JSON-світів, клієнт-локальні пишуться канонічними писачами через тестовий міст, який існує лише в білді з `VITE_E2E_SEED=true` і механічно відсутній у прод-бандлі. Тест чекає на факт готовності, а не на таймаут. Перші чотири стани (комора наповнена, Фінік з місяцем транзакцій і бюджетами, routine зі стріками 7+ днів, fizruk з активною сесією і відновленням) проходять 44px-аудит, overflow-перевірки й axe.

## Рішення дизайну

Джерело кожного пункту: відповідь власника в інтервʼю 2026-09-24 або факт репо.

- **Перший споживач: лейни mobile і a11y.** Smoke `@critical` з реальним сервером і ручні verification-прогони поза скоупом v1: там стан сіється в Postgres, це інший клас роботи, і воно не закриває порожні екрани аудиту. Джерело: власник.
- **Клієнт-локальні дані сіє тестовий міст поза продом.** Нова тека `apps/web/src/e2e/` з модулем, що виставляє `window.__sergeantScenario` з двома методами: `apply(world)` і `snapshot()`. Пише лише через канонічні писачі модулів: routine через `saveRoutineStateDurable` з `@routine/lib/routineStorage` (той самий шлях, що `applyRoutinePreset` у `core/onboarding/presetApply.ts`), комора через `upsertItem` модуля nutrition, fizruk через писачі `@sergeant/fizruk-domain` і стор модуля. Жодних прямих записів у SQLite чи localStorage повз домен. Підключення рівно одне: у `apps/web/src/main.tsx` інлайн `if (import.meta.env.VITE_E2E_SEED === "true") void import("./e2e/installScenarioBridge")`; порівняння саме інлайн у call-сайті, бо через спільний модуль Rollup не згортає гілку і чанк потрапляє в precache (`docs/engineering/architecture/feature-flags.md § Пастка dead-code elimination`). Власник відкинув сіяння через UI (повільно, ламається, стріки так не насіяти) і `?scenario=` під `import.meta.env.DEV` (лейни ганяються на прод-білді через `vite preview`, там DEV вирізаний). Джерело: власник; шлях писачів з коду.
- **Прапорець `VITE_E2E_SEED`.** Build-time клієнтський тумблер, дефолт вимкнено, полярність «незадана = міст відсутній» (правило для нових прапорців у `feature-flags.md § 2`). Реєструється в таблиці §2 `feature-flags.md` з умовою зняття «лейни перейшли на інший механізм станів або E2E-лейни зняті» і в типах `apps/web/src/vite-env.d.ts`; гейт реєстру `scripts/check-vite-flag-registry.mjs`. Лейни вмикають його через `webServer.env` у своїх Playwright-конфігах, не через глобальне оточення машини. Джерело: факт репо, правило реєстру.
- **Межа проду: статична + скан бандла.** Два шари. (1) `scripts/check-imports.mjs` отримує друге сканування по всьому `apps/web/src`: імпорт із `e2e/` заборонений усюди, крім самого `apps/web/src/e2e/**` і єдиного дозволеного call-сайту `apps/web/src/main.tsx`; це завжди в `pnpm lint`, без білда. (2) Новий `scripts/ci/check-e2e-seed-boundary.mjs` після прод-білда сканує `apps/server/dist/assets/*.js` (туди ж дивиться `size-limit`) на рядок `__sergeantScenario` і падає, якщо знайшов; додається в кінець скрипта `check` у кореневому `package.json` після `pnpm build`, тож повний режим merge-gate його виконує. Статика ловить помилку рано, скан ловить catch-all `manualChunks`, який уже тягнув «лінивий» модуль в eager (`posthog-js`, 2026-08-07) і чанк `DesignShowcase` у прод (2026-09-01). Джерело: власник; випадки з `AGENTS.md § Performance budgets`.
- **Готовність: `apply()` повертає promise, поруч малий `snapshot()`.** `apply(world)` резолвиться після завершення всіх канонічних писачів і коли `queryClient.isFetching() === 0` і `isMutating() === 0`; відхиляється з іменем кроку, якщо писач кинув. `snapshot()` повертає `{ scenario, appliedAt, pendingQueries, pendingMutations, sqliteReady }`; тест звіряє його після навігації чи `reload`, замість чекати таймаутом. Наявні барʼєри `settleAnimations` (`tests/mobile/audit.ts`) і `waitForServiceWorkerActivated` (`tests/utils/serviceWorker.ts`) лишаються і застосовуються після `apply`. Власник відкинув fire-and-forget: саме цей клас флакі коштував трьох правок `pantry-storage-places`. Джерело: власник.
- **Серверні дані: JSON-світи й один роутер.** Тека `apps/web/tests/fixtures/worlds/` (зараз у `tests/fixtures/` лише `nutrition-photo.svg`): по одному JSON на світ плюс `index.ts`, що типізує їх через `@sergeant/api-client` (форма відповідей серверу, Hard Rule #3: дрейф контракту ловить typecheck). Один хелпер `installWorld(page, world)` у `apps/web/tests/utils/scenario.ts` реєструє `page.route` за тим самим предикатом, що `mockApi` (`url.pathname === "/api" || startsWith("/api/")`, бо глоб `**/api/**` уже раз ловив вихідники застосунку), і віддає з світу: `/me` (користувач світу, за замовчуванням `qa-user`, як у `mockApi`), Фінік (транзакції, бюджети, категорії), `silpo/sync-state`, billing; невідомий шлях отримує генеричну відповідь як зараз. Парсер світу від `unknown`, невідомі поля й непідтримувана `version` це помилка; бібліотеку валідації брати лише з наявних `devDependencies` `apps/web`, нову не додавати. `mockApi` у `tests/mobile/audit.ts` стає обгорткою над `installWorld` з порожнім світом, ad-hoc моки в ledger і billing-smoke переводяться на нього в тому ж PR. Власник відкинув MSW у браузері (конфлікт із PWA service worker-ом) і ad-hoc моки. Джерело: власник; предикат і `qa-user` з `tests/mobile/audit.ts`.
- **Дати відносні.** Світ задає `daysAgo`, `apply()` резолвить його від годинника пристрою через `toLocalISODate` з `@sergeant/shared`, бо день-ключ особистих сутностей device-local (ADR-0078). Стрік не зламається через місяць; скріншоти з різними числами днів лейни 44px і axe не помічають. Власник відкинув фіксовані дати з `page.clock` (SQLite-WASM, service worker і таймери анімацій під замороженим годинником це новий клас флакі) і опційний `anchorDate` без споживача. Джерело: власник.
- **Активація лише з тесту.** `applyScenario(page, id)` у `tests/utils/scenario.ts`: `installWorld` для API-частини, `page.goto`, `page.evaluate` з `window.__sergeantScenario.apply(world.local)`, очікування promise. Жодного `?scenario=` навіть у тестовому білді: власник зняв демо-режим 2026-09-17 саме за стан поза автентифікацією з URL (`core/onboarding/demoLeftoverCleanup.ts`). Агент із браузером застосовує стан тим самим викликом через JS. Джерело: власник.
- **Користувач і скоуп.** Міст пише під поточним користувачем контексту автентифікації (`/me` зі світу), бо SQLite-скоуп прив'язаний до `syncableUserId`; `apply()` чекає готовності auth-контексту перед першим записом. Джерело: факт репо.
- **Каталог v1: чотири світи.** `pantry-receipt-names` (назви з чека з `RECEIPT_PANTRY_ITEMS`, без ком у назвах, бо `upsertItem` робить loose parse по комі), `finyk-month` (місяць транзакцій по всіх 16 категоріях, бюджети з перевищенням і без, суми в копійках як `number`), `routine-streaks` (три звички зі стріками 7, 14 і 30 днів плюс одна пропущена вчора), `fizruk-active-session` (активна сесія тренування і дані відновлення для hero-барів). Джерело: власник; деталі вмісту узгоджуються з module-owner скілами (`sergeant-module-nutrition`, `-finyk`, `-routine`, `-fizruk`) під час виконання, без нових продуктових рішень.
- **Перевід наявного стану.** Тест `PANTRY` у `mobile-ui-audit.spec.ts` переходить на `applyScenario(page, "pantry-receipt-names")`, UI-сіяння видаляється. Для трьох нових світів додаються записи аудиту у `ROUTES`-свіп того ж спека (44px, overflow двома замірами, structural labels) і по одній axe-перевірці у світлій темі в `tests/a11y/axe.spec.ts`. Джерело: похідне від мети.
- **Деплой не бере міст.** `pnpm deploy:web` збирає локальним Vercel CLI; `scripts/deploy-vercel.mjs` перед деплоєм запускає `check-e2e-seed-boundary.mjs` на власному виході білда, бо цей шлях не проходить через `pnpm check`. Джерело: факт репо (`AGENTS.md § Deployment`).

## Поверхня змін

- `apps/web/src/e2e/installScenarioBridge.ts` (міст, `apply`, `snapshot`), `apps/web/src/e2e/world.ts` (тип локальної частини світу, парсер від `unknown`, резолвер `daysAgo`), `apps/web/src/e2e/writers/{pantry,routine,fizruk}.ts` (адаптери до канонічних писачів). Усе під `apps/web/src/e2e/`, з власним `AGENTS.md` (Contents і Guidelines, зокрема заборона прямих записів повз домен).
- `apps/web/src/main.tsx`: один інлайн-гейт `import.meta.env.VITE_E2E_SEED === "true"` з динамічним імпортом.
- `apps/web/src/vite-env.d.ts`: тип `VITE_E2E_SEED`.
- `apps/web/tests/fixtures/worlds/*.json`, `apps/web/tests/fixtures/worlds/index.ts`.
- `apps/web/tests/utils/scenario.ts` (`installWorld`, `applyScenario`), `apps/web/tests/mobile/audit.ts` (`mockApi` як обгортка), `apps/web/tests/mobile/mobile-ui-audit.spec.ts`, `apps/web/tests/a11y/axe.spec.ts`, `apps/web/tests/ledger/user-story-ledger.spec.ts`, `apps/web/tests/smoke/billing-checkout-smoke.spec.ts` (перевід моків).
- `apps/web/playwright.mobile.config.ts`, `apps/web/playwright.config.ts`: `webServer.env.VITE_E2E_SEED = "true"`.
- `scripts/check-imports.mjs` (друге сканування по `apps/web/src`), `scripts/ci/check-e2e-seed-boundary.mjs` (новий) плюс тест `scripts/ci/__tests__/check-e2e-seed-boundary.test.mjs` на `node --test`.
- Кореневий `package.json`: `check` доповнюється `&& node scripts/ci/check-e2e-seed-boundary.mjs`; ланцюжок `lint` додає `node --test scripts/ci/__tests__/check-e2e-seed-boundary.test.mjs`.
- `scripts/deploy-vercel.mjs`: pre-flight скан.
- `docs/engineering/architecture/feature-flags.md § 2`: рядок `VITE_E2E_SEED`.
- `apps/web/AGENTS.md § E2E smoke` або новий підрозділ: як застосувати стан у тесті, де живуть світи, чому міст не в проді.
- Owner-скіли за routing-таблицею `AGENTS.md`: `sergeant-e2e-testing` (лейни, хелпери) плюс `sergeant-web-ui` (`apps/web/src/**`); вміст світів узгоджується з `sergeant-module-nutrition`, `sergeant-module-finyk`, `sergeant-module-routine`, `sergeant-module-fizruk`.

## Поза скоупом v1

- Стани для smoke `@critical` з реальним сервером і Postgres; сідери на сервері.
- Привʼязка світів до карток `docs/engineering/testing/verification/catalog.json` і профілів verification-прогонів.
- Активація з URL (`?scenario=`), будь-який UI для вибору стану, повернення демо-режиму.
- Байт-стабільні скріншоти для візуального лейну (`playwright.visual.config.ts`), фіксовані дати, `page.clock`.
- Порожні стани як окремі світи: порожній світ уже дає їх, окремих файлів не потрібно.
- Мобільний стек (`apps/mobile`, `apps/mobile-shell`, ADR-0094).
- Пакет `@hraness/direct` чи будь-яка зовнішня залежність для станів.

## Верифікація (обовʼязково)

1. `node --test scripts/ci/__tests__/check-e2e-seed-boundary.test.mjs`: фікстурний бандл з рядком `__sergeantScenario` дає червоне, без нього зелене. `node scripts/check-imports.mjs` червоний на тимчасовому файлі `apps/web/src/modules/finyk/x.ts` з `import "../../e2e/world"` і зелений після його видалення.
2. `pnpm --filter @sergeant/web test` зелений, включно з новими юніт-тестами парсера світу (невідоме поле, невідома `version`, відʼємний `daysAgo` відхиляються) і резолвера дат (`daysAgo: 0` дорівнює `toLocalISODate(new Date())`).
3. Прод-білд без прапорця: `pnpm --filter @sergeant/web build`, далі `node scripts/ci/check-e2e-seed-boundary.mjs` зелений, у `apps/server/dist/assets/` немає чанка з `__sergeantScenario`; `pnpm --filter @sergeant/web size` не перевищує стелі з `AGENTS.md § Performance budgets`.
4. Тестовий білд: `pnpm --filter @sergeant/web e2e:mobile` зелений; тест `PANTRY` проходить через `applyScenario` без жодного `fill`/`click` для сіяння; три нові записи (`FINYK_MONTH`, `ROUTINE_STREAKS`, `FIZRUK_ACTIVE`) проходять 44px-флор, обидва overflow-заміри і structural labels. Записати тривалість лейну до і після в розділ «Стан виконання».
5. `pnpm --filter @sergeant/web test:a11y` зелений з чотирма новими axe-перевірками на наповнених станах у світлій темі.
6. Готовність наживо: у тесті після `applyScenario` і `page.reload()` `snapshot()` показує `pendingQueries: 0`, `sqliteReady: true`, `scenario` дорівнює застосованому; це твердження стоїть у самому тесті, не лише в ручному прогоні.
7. `pnpm lint` зелений (нові кроки в ланцюжку), `pnpm lint:vite-flags` зелений після реєстрації прапорця, `pnpm lint:specs` зелений.
8. `pnpm check` цілком зелений на гілці або червоний лише на кроках, червоних і на `main` (перелік з аудиту DG §11).

## Ризики та відкриті питання

- Для fizruk «активна сесія» може не існувати чистого писача поза UI-хуками; тоді виконавець додає його в `@sergeant/fizruk-domain` або стор модуля за скілом `sergeant-module-fizruk`, а не імітує стан через localStorage. Якщо це виявиться окремою продуктовою зміною, світ `fizruk-active-session` відкладається, решта три їдуть.
- `apply()` до готовності auth-контексту запише під анонімним скоупом; порядок «auth готовий, потім писачі» має бути закритий тестом.
- Тестовий чанк потрапляє в precache service worker-а тестового білда; це очікувано і не стосується проду, але барʼєр `waitForServiceWorkerActivated` перед `reload` лишається обовʼязковим.
- Локальний `.env` із випадково заданим `VITE_E2E_SEED=true` зробив би міст частиною `pnpm deploy:web`; pre-flight скан у `deploy-vercel.mjs` це ловить, тому він не опційний.
- `queryClient.isFetching() === 0` як сигнал готовності не бачить фонові refetch-и з `refetchOnWindowFocus`; тести не перемикають фокус між `apply` і твердженням.

## Стан виконання

Оновлено 2026-09-29 у worktree `claude/e2e-repeatable-states` (коміту ще немає).

**Зроблено.**

- Міст `apps/web/src/e2e/installScenarioBridge.ts` підключається з `main.tsx` як `installScenarioBridge(queryClient)`, без глобального `window`-клієнта. Писачі (`src/e2e/writers.ts`) вантажаться динамічно лише в `apply()`: статичний імпорт тягнув модульні писачі в бут кожної сторінки тестового білда і валив три незмінні тести лейну (`nav-label-fit` HUB, `viewport-shell-regression`).
- `apply()` чекає auth (`/me` осів; для залогіненого ще й SQLite-партиція = його id, новий `readActiveSqliteUserId()` у `core/db/sqlite.ts`), далі кожен писач чекає свій зареєстрований dual-write контекст і теплий кеш і перечитує кеш після запису. Будь-яке очікування відхиляється з іменем кроку (`auth`, `pantry`, `routine`, `finyk`, `fizruk`, `settle-queries`). `sqliteReady` = `getStorageReadySnapshot()` і відкритий VFS. Мітка світу пишеться durable-записом і переживає `reload`.
- Комора: `upsertItem` живе в замиканні хука, тож міст іде його нижньою половиною: `mergeItemsIntoPlaces` + `resolvePlaceOfWithFilter` + `persistPantries`. Готовність = позиції в кеші, а не `nutritionDualWriteIdle()` (змонтований хук тримає чергу непорожньою).
- Фінік: транзакції серверні, `installWorld` віддає `/api/mono/{sync-state,accounts,jars,transactions,backfill-progress}` у типах `@sergeant/api-client`, суми в копійках. Ліміти клієнт-локальні, пишуться через `mirrorFinykChatDualWrite` (ліміт у гривнях, як у `LimitBudget`). Світ покриває всі 18 категорій витрат `MCC_CATEGORIES` (у спеці стояло 16) і чотири ліміти: два з перевищенням, два без.
- Фізрук: UI читає тренування з SQLite-кешу, а активну сесію з `ACTIVE_WORKOUT_KEY`; міст пише обидва. Світ має два завершені тренування (для відновлення) і одне активне.
- Світи в JSON, парсер у `tests/fixtures/worlds/index.ts` відхиляє невідоме поле і чужу `version`; файл і `tests/utils/scenario.ts` включено в `tsconfig.json` веба, тож дрейф контракту ловить `typecheck`. `installWorld` роутить на контексті (після `reload` запити йдуть через service worker), віддає CORS і preflight, має режим `only` для smoke з реальним сервером. `applyScenario` робить `apply`, `reload` і звіряє `snapshot()` у самому тесті.
- Ledger і billing-smoke переведено на `installWorld`; `MONO_DISCONNECTED` прибрано.

**Знахідка.** Колишній мок `/me` не проходив `MeResponseSchema` (без `image` і `createdAt`), тож лейни фактично жили анонімом. Дефолтні світи тепер явно анонімні; валідний `QA_USER` експортовано. Сесія в мок-світі будить sync-рушій і `get-session`, яких світ не обслуговує повністю; це окрема робота.

**Перевірки 2026-09-29.** `typecheck` 0; eslint на змінених файлах 0; `vitest src/e2e` 6/6; `check-imports` 0; `node --test check-e2e-seed-boundary` 2/2; прод-білд без прапорця і скан 0 (на тестовому білді скан червоний, як і має бути). Mobile-лейн 41/41, 4,7 хв (до, на незміненому `main`: 38/38, 3,0 хв; приріст дають чотири нові тести зі світами і `reload`). A11y axe: 30/32; `chat` червоний і на незміненому `main` (`scrollable-region-focusable`); `routine-streaks` червоний на `heading-order` (h3 «Будь-коли» під h1): реальна вада наповненої рутини. Виправлено: заголовок групи в `RoutineCalendarPanel` став `h2`; повторний axe `routine-*` 3/3, юніт-тести рутини 105/105.

**Контрольна перевірка рецензента 2026-09-29.** Скан межі мовчки проходив на відсутній або порожній теці (0 файлів = «passed»), тож перший прохід «зеленів» без білда. Тепер 0 `.js` дає exit 1, додано два тести (`node --test` 4/4). Повторно: `typecheck` 0, `vitest src/e2e` 6/6, `check-imports` 0, `check-vite-flag-registry` 0, прод-білд 0, скан 0 на 398 `.js` у `apps/server/dist/assets`.

**Не зроблено.** `pnpm check` цілком, ledger- і smoke-лейни не запускались.
