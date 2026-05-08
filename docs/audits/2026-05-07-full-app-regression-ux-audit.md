# Sergeant — full regression + UX audit (2026-05-07/08)

> **Last validated:** 2026-05-08 by Codex. **Next review:** 2026-08-06.
> **Status:** Active

Audit-only прохід виконано проти `origin/main @ 316ef626` на гілці `codex/full-app-regression-ux-audit`. Початкова мета — не виправляти код, а відтворити поточний стан регресій, тестових воріт, PWA/UX coverage і скласти чергу наступних PR. Після окремої команди на implementation mode цей самий документ став живим журналом виконаних fix-pass змін.

**Update 2026-05-08:** після встановлення Docker/Playwright Chromium виконано додатковий authenticated UX pass. Тестовий акаунт створено в локальній smoke-БД через Better Auth endpoint із потрібним CSRF header; пароль не комітиться у репо, повні локальні credentials лишаються тільки в `.codex-run-logs/test-user-api-create.json`. Browser UI sign-up через форму **не зміг створити акаунт** через `403 CSRF_HEADER_REQUIRED`; це новий P1 auth-flow finding нижче.

**Fix pass 2026-05-08:** implementation mode увімкнено після audit-only проходу. Закрито першу партію P1/P2: browser auth-client тепер додає `X-Requested-With`, CORS дозволяє `traceparent`/`tracestate`/`X-Requested-With` і `127.0.0.1` dev origins, versioned `/api/v1/metrics/web-vitals` bypass-ить CSRF, локальний CSP дозволяє dev API `:3000`, Vercel Analytics не інжектиться на localhost, Playwright smoke webServer переведено з POSIX `sh -lc` на Windows-safe Node wrapper, web Vitest storage setup відновлює повний Storage API між suites, а mobile `TransactionsPage` тест отримав runtime-like `ApiClientProvider` + `QueryClientProvider`. Targeted verification: server CORS/CSRF `31 passed`, web CSP/storage/sqlite `59 passed`, mobile TransactionsPage `21 passed`, `@sergeant/web|server|mobile typecheck` green, `@sergeant/web build` green. Повний web Vitest під Node 25/локальним timeout дійшов далі первинної storage-регресії, але був перерваний timeout-ом і завершився reporter `EPIPE`; повторити під Node 20/CI без timebox.

**Fix pass 2026-05-08 (continuation):** Закрито аудит-пункти #5 і #7 окремими PR після merge `#2214` baseline.

- **#5 P2 Mobile Jest reliability** — закрито через [PR #2215](https://github.com/Skords-01/Sergeant/pull/2215). Module shell тести (`FinykApp.test.tsx`, `BudgetsPage.test.tsx`, `NutritionApp.test.tsx`, `RoutineApp.test.tsx`, `AnalyticsIdentityBridge.test.tsx`) обернуто в runtime-like `ApiClientProvider` + `QueryClientProvider` із pre-seeded `useUser` cache, hoisting violation у Jest mock factory виправлено через `mock`-prefix rename. Verification: `pnpm --filter @sergeant/mobile exec jest --runInBand` під Node 20.20.2 — `96 suites / 624 tests passed`, peak heap ~1 GB, без heap OOM і без `Cannot log after tests are done`/`Animated(View) ... act(...)` leaks. Generated docs (`docs/initiatives/follow-ups.md`, `docs/governance/hard-rules-matrix.md`) перегенеровано в окремих commits.
- **#7 P2 Manual UX pass hardening** — закрито через [PR #2216](https://github.com/Skords-01/Sergeant/pull/2216). Додано `apps/web/tests/utils/seedFTUX.ts` — централізований helper, який seed-ить/dismiss-ить welcome splash, FTUX hero, per-module first-run bottom sheets («Налаштуй Фінік / Харчування / Рутину / Фізрук») і What's-new modal через canonical storage keys із `@sergeant/shared`. Visual regression spec `apps/web/tests/a11y/ds-visual-qa.spec.ts` перепідключено до helper-а: surface set 7 → 11 (додано `auth` `/sign-in`, `hub-chat` `/chat`, `finyk-first-run`, `nutrition-first-run`), viewport set 4 → 5 (audit-required 320 / 390 / 768 / 1440 + legacy 1280), всього **110 Argos baselines** замість 56. Verification: `tsc --noEmit` clean, ESLint clean, Playwright `--list` показує `Total: 110 tests in 1 file`.

## Environment snapshot

| Поле           | Значення                                                             |
| -------------- | -------------------------------------------------------------------- |
| Workspace      | `C:\Users\dmytr\Documents\New project 2`                             |
| Branch         | `codex/full-app-regression-ux-audit`                                 |
| Base           | `origin/main @ 316ef626`                                             |
| Git baseline   | `git status -sb` чистий перед аудитом                                |
| Node           | `v25.9.0`                                                            |
| pnpm           | `9.15.1`                                                             |
| Repo target    | Node `20.x`; локальні engine warnings очікувані                      |
| Disk           | ~329 MB free на старті, ~151 MB після web build/Playwright artifacts |
| Sergeant skill | `sergeant-bugfix-and-regression`                                     |
| Docker update  | Docker Desktop `29.4.2`, Compose `v5.1.3`, WSL2 оновлено 2026-05-08  |
| Smoke DB       | `hub-postgres-smoke`, Postgres/pgvector на `127.0.0.1:55432`         |
| Auth test user | Локальний smoke user `codex.smoke.*@example.com`; пароль не в repo   |
| UX artifacts   | `.codex-run-logs/full-ui-audit/results.json` + `*.png` локально      |

Локальне середовище має два важливі обмеження: Node 25 замість Node 20 і критично малий вільний диск. Через це heap OOM/tooling failures нижче не треба автоматично читати як runtime-регресії продукту, але вони блокують чесний локальний release-gate.

## TL;DR severity map

| Severity | Surface                 | Висновок                                                                                                                                                           | Наступна дія                                                                                                                   |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| P0       | Web runtime             | Новий P0 boot crash не відтворився: `@sergeant/web build` зелений, `vite-browser-external:node:` не з'явився.                                                      | Лишити як verified-closed, не патчити в цьому PR.                                                                              |
| P1       | Auth sign-up            | Реальний browser sign-up на `/sign-in` не створює акаунт: `POST /api/auth/sign-up/email` повертає `403 CSRF_HEADER_REQUIRED`.                                      | Додати `X-Requested-With: XMLHttpRequest` у Better Auth browser requests або exempt/fix auth route order без послаблення CSRF. |
| P1       | Dev split-origin auth   | Vite dev на `5173` + API `3000` блокується CSP/CORS: CSP не дозволяє `127.0.0.1:3000`, preflight не дозволяє `traceparent`.                                        | Вирівняти dev CSP/CORS або документовано запускати smoke same-origin.                                                          |
| P1       | Web test gate           | Full Vitest падає на storage/localStorage shim: `localStorage.clear is not a function`, `storage.setItem is not a function`; це ламає багато shared/module тестів. | Окремий PR для web test setup/storage mocks.                                                                                   |
| P1       | Mobile test gate        | `TransactionsPage.test.tsx` має 21/21 failures через відсутній `ApiClientProvider`.                                                                                | Окремий PR для mobile test wrapper/provider.                                                                                   |
| P2       | Mobile reliability      | Full mobile Jest завершується Node heap OOM; перед OOM є async `act()`/analytics log leaks.                                                                        | Спершу ізолювати failing suites, потім стабілізувати full pass під Node 20.                                                    |
| P2       | PWA/a11y/visual tooling | Playwright a11y/visual не доходить до UI: відсутній `chromium_headless_shell-1217`; smoke config на Windows падає на webServer `) was unexpected at this time`.    | Відновити browser install і Windows-safe webServer command.                                                                    |
| P2       | Web build performance   | Build зелений, але є oversized chunks і ineffective dynamic import для `ProfilePage`.                                                                              | Performance hygiene PR після P1 gates.                                                                                         |
| P2       | Local telemetry         | Same-origin local app повертає `403` на `/api/v1/metrics/web-vitals`; `/_vercel/insights/script.js` приходить HTML і дає MIME error.                               | Exempt versioned web-vitals path і не вантажити Vercel script у локальному server-static режимі.                               |
| P3       | Local tooling           | `pnpm lint` падає heap OOM на `@sergeant/web`/`mobile-shell` під Node 25; фактичних lint findings не отримано.                                                     | Повторити під Node 20 або з контрольованим heap/disk.                                                                          |

## Command matrix

| Команда                                                                                                                            | Результат    | Нотатки                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin --prune`                                                                                                         | Pass         | Remote оновлено перед branch switch.                                                                                       |
| `git switch -c codex/full-app-regression-ux-audit origin/main`                                                                     | Pass         | Чистий audit branch від `origin/main`.                                                                                     |
| `pnpm install --frozen-lockfile`                                                                                                   | Pass         | Лише expected Node engine warnings.                                                                                        |
| `pnpm format:check`                                                                                                                | Pass         | Prettier зелений.                                                                                                          |
| `pnpm lint:env-single-source`                                                                                                      | Pass         | Env single source зелений.                                                                                                 |
| `pnpm --filter @sergeant/web typecheck`                                                                                            | Pass         | `tsc` app + service worker зелені.                                                                                         |
| `pnpm --filter @sergeant/mobile typecheck`                                                                                         | Pass         | Mobile typecheck зелений.                                                                                                  |
| `pnpm --filter @sergeant/server typecheck`                                                                                         | Pass         | Server typecheck зелений.                                                                                                  |
| `pnpm --filter @sergeant/console typecheck`                                                                                        | Pass         | Console typecheck зелений.                                                                                                 |
| `pnpm --filter @sergeant/server test`                                                                                              | Pass         | `128` files, `1661` passed, `17` skipped.                                                                                  |
| `pnpm --filter @sergeant/web build`                                                                                                | Pass         | PWA build зелений; node/fs browser leak не відтворився.                                                                    |
| `pnpm --filter @sergeant/web exec vitest run --reporter=dot --maxWorkers=1`                                                        | Fail         | P1 web storage shim failures.                                                                                              |
| `pnpm --filter @sergeant/mobile exec jest --runInBand`                                                                             | Fail         | Node heap OOM після ~426s; перед тим real TransactionsPage provider failures.                                              |
| `pnpm --filter @sergeant/mobile exec jest src/modules/finyk/pages/Transactions/TransactionsPage.test.tsx --runInBand`              | Fail         | 21/21 failures, `useApiClient must be used inside <ApiClientProvider>`.                                                    |
| `pnpm --filter @sergeant/mobile exec jest src/core/OnboardingWizard.test.tsx src/lib/__tests__/identifyTraits.test.ts --runInBand` | Pass         | 17 tests passed; попередня onboarding/identifyTraits зона на main виглядає закритою.                                       |
| `pnpm --filter @sergeant/web test:a11y`                                                                                            | Tooling fail | Build проходить, Playwright не має Chromium executable.                                                                    |
| `pnpm --filter @sergeant/web test:visual`                                                                                          | Tooling fail | 56 visual cases не стартують через той самий missing Chromium.                                                             |
| `pnpm --filter @sergeant/web exec playwright test --config playwright.smoke.config.ts --project chromium`                          | Tooling fail | webServer не стартує на Windows: `) was unexpected at this time`.                                                          |
| `pnpm --filter @sergeant/web exec playwright test --config playwright.smoke.config.ts --project mobile-safari`                     | Tooling fail | Та сама webServer помилка; mobile Safari coverage не отримано.                                                             |
| `pnpm lint`                                                                                                                        | Tooling fail | ESLint worker OOM на Node 25, не дійшло до змістовних lint findings.                                                       |
| `pnpm --filter @sergeant/web exec playwright install chromium`                                                                     | Pass         | Chromium/FFmpeg/headless shell встановлено після звільнення диску.                                                         |
| `pnpm db:up`                                                                                                                       | Pass         | Docker Desktop після WSL update підняв repo Postgres; через локальний 5432-conflict для smoke використано окремий `55432`. |
| `docker run ... --name hub-postgres-smoke -p 55432:5432 pgvector/pgvector:pg16`                                                    | Pass         | Ізольована smoke-БД для test user/auth UX pass.                                                                            |
| `DATABASE_URL=postgresql://hub:hub@127.0.0.1:55432/hub pnpm --filter @sergeant/server db:migrate:dev`                              | Pass         | Міграції `001`–`049` застосовані успішно.                                                                                  |
| Browser UI sign-up на `http://127.0.0.1:5173/sign-in`                                                                              | Fail         | `POST /api/auth/sign-up/email` → `403 CSRF_HEADER_REQUIRED`; dev CSP/CORS також блокує `/api/v1/me`.                       |
| Auth endpoint sign-up з `X-Requested-With: XMLHttpRequest`                                                                         | Pass         | Локальний smoke user створено; credentials записані лише в local `.codex-run-logs`.                                        |
| Same-origin authenticated UX matrix на `http://127.0.0.1:5000`                                                                     | Partial pass | 36 screenshots: 4 viewports × 9 routes. Модулі рендеряться; welcome/first-run overlays і telemetry errors зафіксовані.     |

## Findings

### P1 — Browser sign-up блокується CSRF guard-ом

**Affected surface:** `apps/web/src/core/auth/**`, `apps/server/src/http/requireCsrfHeader.ts`, Better Auth `/api/auth/sign-up/email`.

**Repro:** підняти API + web dev, перейти на `/sign-in`, перемкнутися на реєстрацію, заповнити ім'я/email/password, натиснути `Зареєструватися`.

**Actual:** форма лишається на `/sign-in`, показує `CSRF header required`. Network: `POST http://127.0.0.1:3000/api/auth/sign-up/email` → `403 {"error":"CSRF header required","code":"CSRF_HEADER_REQUIRED"}`.

**Expected:** Better Auth sign-up має або проходити через CSRF-exempt `/api/auth/*`, або клієнт має додавати canonical `X-Requested-With: XMLHttpRequest` до state-changing auth requests.

**Evidence:** локальний debug screenshot `.codex-run-logs/signup-debug.png`; server log показує `POST` `403`; Node-запит на той самий endpoint із header `x-requested-with: XMLHttpRequest` створює користувача успішно (`200`).

**Suggested fix direction:** перевірити route path у `requireCsrfHeader` після `apiVersionRewrite`/Better Auth mount і Better Auth client `fetchOptions.headers`. Fix має зберегти M10 CSRF invariant: не вимикати guard глобально.

### P1 — Split-origin dev auth блокується CSP/CORS

**Affected surface:** `apps/web/index.html` CSP fallback, `apps/server/src/http/cors.ts`, Vite dev proxy/smoke setup.

**Repro:** `VITE_API_BASE_URL=http://127.0.0.1:3000`, web на `http://127.0.0.1:5173`, API на `3000`, відкрити `/sign-in`.

**Actual:** браузер блокує `GET /api/v1/me`: CSP `connect-src` не містить `http://127.0.0.1:3000`; після `bypassCSP` CORS preflight падає, бо request header `traceparent` не дозволений `Access-Control-Allow-Headers`.

**Expected:** локальний split-origin dev flow має або працювати out-of-the-box, або smoke config має використовувати same-origin preview/server-static режим без CORS/CSP шуму.

**Suggested fix direction:** додати dev-only CSP allow для локального API і розширити CORS allow headers на `traceparent`, `tracestate`, `x-requested-with`, або перевести smoke на same-origin server-static wrapper.

### P2 — Authenticated UX pass показує welcome/first-run overlays після login

**Affected surface:** Hub FTUX, module first-run sheets.

**Repro:** локальний smoke user, same-origin `http://127.0.0.1:5000`, cookies Better Auth, пройти routes `/`, `/chat`, `/assistant`, `/profile`, `/finyk`, `/?module=fizruk`, `/?module=routine`, `/nutrition`, `/reset-password` на `1440x900`, `768x1024`, `390x844`, `320x700`.

**Actual:** `/` і `/profile` редиректять/рендерять `/welcome`, хоча сесія є. Module routes рендеряться, але перший вхід у `Finyk`/`Nutrition` перекритий first-run bottom sheet (`Налаштуй Фінік`, `Налаштуй Харчування`), що блокує огляд underlying content і first action.

**Expected:** authenticated returning user має потрапляти на Hub/dashboard, а first-run sheets мають бути передбачувано dismissible/seedable у smoke matrix.

**Evidence:** `.codex-run-logs/full-ui-audit/mobile-390-hub.png`, `mobile-390-finyk.png`, `narrow-320-nutrition.png`, `results.json`.

**Suggested fix direction:** уточнити FTUX state contract між auth, onboarding localStorage і server session; для smoke додати стабільний seeding або route helper, який закриває first-run sheets перед screenshot assertions.

### P2 — Local telemetry endpoints шумлять 403/MIME errors

**Affected surface:** `apps/server/src/http/requireCsrfHeader.ts`, web-vitals sender, Vercel Analytics in local/static server mode.

**Repro:** same-origin `SERVER_MODE=replit` на `http://127.0.0.1:5000`, відкрити будь-яку сторінку.

**Actual:** повторювані `403` на `/api/v1/metrics/web-vitals`; unversioned exempt є для `/api/metrics/web-vitals`, але versioned `/api/v1/metrics/web-vitals` проходить через CSRF guard. Також `/_vercel/insights/script.js` повертає HTML і браузер логує strict MIME error.

**Expected:** локальний telemetry не має створювати console error шум у smoke/UX pass.

**Suggested fix direction:** додати versioned web-vitals path до CSRF exempt або відправляти unversioned endpoint; не інжектити/не запитувати Vercel Analytics script у local server-static mode.

### P1 — Web Vitest storage shim ламає shared/module тести

**Affected surface:** `apps/web/src/shared/lib/storage/**`, `apps/web/src/shared/lib/modules/crossModulePrompt.test.ts`, `apps/web/src/modules/routine/**`, `apps/web/src/modules/finyk/**`.

**Repro:** `pnpm --filter @sergeant/web exec vitest run --reporter=dot --maxWorkers=1`.

**Actual:** багато тестів падають на `TypeError: localStorage.clear is not a function`, `window.localStorage.clear is not a function`, `storage.setItem is not a function`. `crossModulePrompt` додатково не зберігає suppression state: очікується `true`, отримує `false`, або навпаки для toast path.

**Expected:** test environment має Storage-compatible mock з `getItem`, `setItem`, `removeItem`, `clear`, `key`, `length`; storage-dependent тести ізольовані між кейсами.

**Evidence:** `src/shared/lib/ui/perf.test.ts`, `src/shared/lib/storage/createModuleStorage.test.ts`, `src/shared/lib/storage/storage.test.ts`, `src/shared/lib/storage/storageManager.test.ts`, `src/shared/lib/storage/storageQuota.test.ts`, `src/shared/lib/storage/weeklyDigestStorage.test.ts`, `src/modules/routine/components/settings/TagsSection.test.tsx`, `src/modules/finyk/hooks/useMonobankWebhook.test.tsx`.

**Likely owner/path:** `apps/web/src/test/setup*`, storage mocks, `apps/web/src/shared/lib/storage/**`.

**Suggested fix direction:** централізувати web Vitest storage shim і заборонити тестам підміняти `localStorage` partial object без full Storage API. Додати regression test, який явно перевіряє `localStorage.clear`/`setItem` перед запуском storage suites.

### P1 — Mobile TransactionsPage tests без ApiClientProvider

**Affected surface:** `apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.test.tsx`.

**Repro:** `pnpm --filter @sergeant/mobile exec jest src/modules/finyk/pages/Transactions/TransactionsPage.test.tsx --runInBand`.

**Actual:** `Test Suites: 1 failed`, `Tests: 21 failed`. Корінь однаковий: `useApiClient must be used inside <ApiClientProvider>. Create an ApiClient with createApiClient() and wrap the tree.`

**Expected:** TransactionsPage test wrapper має відтворювати runtime provider tree або мокати API client на рівні shared render helper.

**Evidence:** stack через `packages/api-client/src/react/context.tsx:32`, `useUser`, `apps/mobile/src/modules/finyk/lib/transactionsStore.ts:359`, `TransactionsPage.tsx:91`, test render helper `TransactionsPage.test.tsx:91`.

**Likely owner/path:** `apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.test.tsx`, mobile test utils/provider wrapper.

**Suggested fix direction:** додати `ApiClientProvider` у mobile render helper для Finyk pages або створити module-local wrapper з test client. Це виглядає як test harness regression, не доведений runtime crash.

### P2 — Full mobile Jest нестабільний через heap OOM і async leaks

**Affected surface:** `apps/mobile` Jest.

**Repro:** `pnpm --filter @sergeant/mobile exec jest --runInBand`.

**Actual:** процес завершується `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`. Перед fatal видно `Animated(View) inside a test was not wrapped in act(...)` і `Cannot log after tests are done` для analytics/hint events.

**Expected:** full mobile Jest має завершуватись або падати на конкретних suites без процесного OOM.

**Likely owner/path:** mobile test setup, HubDashboard/hints tests, analytics mock lifecycle.

**Suggested fix direction:** після P1 provider fix повторити full Jest під Node 20; якщо OOM лишиться, запускати suite bisect і закрити async timers/logging leaks.

### P2 — Playwright a11y/visual coverage заблокований локальним browser install

**Affected surface:** `apps/web/tests/a11y/**`, visual QA, PWA smoke.

**Repro:** `pnpm --filter @sergeant/web test:a11y`, `pnpm --filter @sergeant/web test:visual`.

**Actual:** тести не доходять до сторінок. Playwright шукає `C:\Users\dmytr\AppData\Local\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe` і просить `pnpm exec playwright install`.

**Expected:** a11y/visual matrix має запускатись для welcome, hub, finyk, fizruk, routine, nutrition у light/dark і mobile/tablet/desktop viewports.

**Evidence artifacts:** `apps/web/test-results/**/error-context.md`, `apps/web/test-results/**/trace.zip` містять tooling error, не UI screenshots.

**Suggested fix direction:** відновити Playwright browsers у CI/local cache. Через локальний диск ~151 MB free не запускати browser install у цьому audit pass.

### P2 — Playwright smoke webServer command не Windows-safe

**Affected surface:** `apps/web/playwright.smoke.config.ts` або пов'язаний webServer command.

**Repro:** `pnpm --filter @sergeant/web exec playwright test --config playwright.smoke.config.ts --project chromium`.

**Actual:** `Process from config.webServer was not able to start. Exit code: 1`, webServer stderr: `) was unexpected at this time.`

**Expected:** smoke webServer має стартувати на Windows PowerShell/cmd або мати documented Windows fallback.

**Suggested fix direction:** перевірити shell syntax у `webServer.command`; якщо там POSIX grouping/env assignment, замінити на `cross-env`/Node wrapper.

### P2 — Web build зелений, але має performance/build warnings

**Affected surface:** `apps/web` bundle.

**Repro:** `pnpm --filter @sergeant/web build`.

**Actual:** build проходить, але Vite попереджає про chunks >500 KB (`index`, `vendor`, `vendor-zxing`) і `INEFFECTIVE_DYNAMIC_IMPORT`: `src/core/profile/ProfilePage.tsx` dynamic import у `useRoutePrefetch.ts` не code-split'иться, бо також є static import через `src/core/profile/index.ts`.

**Expected:** релізний build зелений без P0 browser-external warnings; performance warnings не блокують release, але мають власну чергу.

**Suggested fix direction:** після тестових P1 окремо розібрати chunking, ProfilePage import graph і lazy route boundaries.

## Surface coverage

### Web shell / PWA

Build-level PWA coverage зелений: `manifest.webmanifest`, service worker і assets збираються. Після 2026-05-08 toolchain update Chromium встановлено і виконано authenticated screenshot matrix у same-origin server-static режимі. Evidence локально: `.codex-run-logs/full-ui-audit/results.json` і 36 PNG screenshots. Офіційний `playwright.smoke.config.ts` все ще потребує Windows-safe `webServer.command`, бо його POSIX `sh -lc` не стартує з Windows shell.

### Auth / onboarding

Browser sign-up через форму відтворено і він червоний: `403 CSRF_HEADER_REQUIRED`. Test user створено тільки контрольованим auth endpoint call із `X-Requested-With: XMLHttpRequest`, щоб продовжити authenticated UX pass без обходу БД напряму. Targeted mobile onboarding suites зелені: `OnboardingWizard.test.tsx` і `identifyTraits.test.ts` разом дали `17 passed`. Reset password route рендерить expected invalid/expired token state.

### Hub / modules / HubChat

Authenticated browser pass пройшов routes `/`, `/chat`, `/assistant`, `/profile`, `/finyk`, `/?module=fizruk`, `/?module=routine`, `/nutrition`, `/reset-password` на `1440x900`, `768x1024`, `390x844`, `320x700`. `Chat`, `Assistant`, `Finyk`, `Fizruk`, `Routine`, `Nutrition`, `Reset password` рендерять контент без pageerror. Hub/profile повертають welcome/FTUX state попри session cookie. Module routes мають first-run bottom sheets, які треба явно seed/dismiss у наступній smoke matrix.

### API / infra baseline

`@sergeant/server test` зелений: `128` test files, `1661` tests passed, `17` skipped. Негативні auth/env/push logs у server output виглядають очікуваними тестовими сценаріями, бо suite завершився pass.

### Native mobile sanity

`@sergeant/mobile typecheck` зелений. Full Jest не зелений через поєднання real TransactionsPage failures і локального OOM. Targeted onboarding/identifyTraits зелені, тому попередній audit item для onboarding async/identifyTraits не відтворився на цьому `main`.

## Decision-complete follow-up PR queue

1. **P1 Web test gate:** виправити Vitest storage/localStorage shim. Acceptance: `pnpm --filter @sergeant/web exec vitest run --reporter=dot --maxWorkers=1` проходить або лишає тільки незалежні documented failures.
2. **P1 Auth sign-up CSRF:** виправити browser Better Auth sign-up/sign-in state-changing requests або route exemption так, щоб `/sign-in` реально створював акаунт. Acceptance: UI sign-up переходить з `/sign-in` у authenticated app без `403 CSRF_HEADER_REQUIRED`.
3. **P1 Dev/smoke CORS+CSP:** зробити split-origin dev або офіційний same-origin smoke стабільним. Acceptance: `/api/v1/me` не блокується CSP/CORS, `traceparent` preflight дозволений або не потрібен.
4. **P1 Mobile Finyk test wrapper:** додати `ApiClientProvider`/test API client для `TransactionsPage`. Acceptance: targeted `TransactionsPage.test.tsx` зелений.
5. **P2 Mobile Jest reliability:** ✅ закрито в [PR #2215](https://github.com/Skords-01/Sergeant/pull/2215). Module shell тести обернуто в runtime providers; повний `pnpm --filter @sergeant/mobile exec jest --runInBand` під Node 20.20.2 — `96 suites / 624 tests passed`, peak heap ~1 GB, без heap OOM і без `Cannot log after tests are done`/`Animated(View) ... act(...)` leaks.
6. **P2 Playwright smoke tooling:** Chromium install уже відновлено локально; лишається Windows-safe `webServer.command`. Acceptance: `test:a11y`, `test:visual`, chromium smoke стартують і доходять до сторінок без ручного server setup.
7. **P2 Manual UX pass hardening:** ✅ закрито в [PR #2216](https://github.com/Skords-01/Sergeant/pull/2216). Helper `apps/web/tests/utils/seedFTUX.ts` централізує seed/dismiss для welcome splash, FTUX hero, per-module first-run sheets («Налаштуй …») і What's-new modal через canonical storage keys із `@sergeant/shared`. Visual spec охоплює 11 surfaces (додано `auth` `/sign-in`, `hub-chat` `/chat`, `finyk-first-run`, `nutrition-first-run`) × 5 viewports (320 / 390 / 768 / 1280 / 1440) × 2 themes — всього **110 Argos baselines** замість 56.
8. **P2 Local telemetry cleanup:** versioned `/api/v1/metrics/web-vitals` не має давати CSRF 403; локальний `/_vercel/insights/script.js` не має давати MIME error.
9. **P2/P3 Web performance:** розібрати oversized chunks і ineffective `ProfilePage` dynamic import після того, як test gates знову зелені.
10. **P3 Local lint reproducibility:** повторити `pnpm lint` під Node 20 із достатнім диском; якщо все одно OOM, розбити turbo lint або підняти memory envelope.

## What not to fix in this audit PR

- Не змінювати product code без окремого implementation request.
- Не комітити локальні `.codex-run-logs/**`, screenshots або test-user credentials. У репо лишається тільки summary/evidence paths.
- Не класифікувати Node 25 engine warnings як app regression; CI target лишається Node 20.
