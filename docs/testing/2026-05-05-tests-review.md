# Sergeant — стан тестів і що покращити

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active
>
> Repo: `Skords-01/Sergeant`. Тип: аналіз без змін у коді. Парний документ — [`2026-05-05-tests-pr-plan.md`](./2026-05-05-tests-pr-plan.md).
>
> **Зміни після початкового аудиту (Wave A прогрес):** PR-T01 (#1967, mobile floor), PR-T02 (#1970, sw exclude + e2e), PR-T03 (#1971, idb через fake-indexeddb), PR-T04 (#1992, ui utils 100%) — merged. PR-T05 (#1996, weekly-digest 95% lines/branches/fns) і PR-T06 (#2001, syncV2 no-DB unit) — open. Прогалини P0 #1, #2, #4, #5 з нижнього списку — частково або повністю закриті; floors у `vitest.config.{js,ts}` ще не підняті — це окремий PR після merge всієї Wave A.

## TL;DR

Тестова інфраструктура **зріла** (Vitest + Jest + Playwright + Detox + Stryker + Argos + MSW + Testcontainers, 667 файлів тестів, ~14 vitest-конфігів, окремі смоук/а11y/визуал/мутаційні CI-лейни). Слабких місць — три категорії:

1. **Web coverage сильно дрейфонув вниз** (functions 27%, branches 30%) через нові непокриті поверхні: `src/sw/**`, `src/shared/lib/idb/sergeantDb.ts`, `src/shared/lib/ui/{amountTone,export,perf}.ts` — це знає сама команда (з коментарів у `apps/web/vitest.config.js`), але floor поки не повертається.
2. **Server AI-tool handlers фактично без юніт-тестів** — `nutrition/{day-hint,day-plan,food-search,parse-pantry,find-recipes,shopping-list,week-plan}.ts`, `openclaw/{tools,write-tools}.ts`, `digest/weekly-digest.ts` (0/1), `sync/syncV2.ts` (0–1% покриття).
3. **E2E/смоук дуже вузькі**: web — 4 спеки (auth, navigation/offline, bottom-nav, dashboard-health); mobile Detox — 4 спеки (тільки finyk + routine + hub UX). Цілих модулів `nutrition`, `fizruk`, `HubChat` нема в e2e ні на web, ні на mobile.

## Що вже є (інвентар)

### Тестові фреймворки

| Шар                                 | Інструменти                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Unit / integration (web/server/lib) | **Vitest** (14 конфігів), shared base — `packages/config/vitest.base.js` (v8 coverage, lcov+json-summary)               |
| Web component / hook unit           | Vitest + Testing Library + jsdom-style env через `apps/web/src/test/setup.ts`                                           |
| HTTP-моки                           | **MSW** — `apps/web/src/test/msw/{handlers,server}.ts`                                                                  |
| Server integration                  | **Testcontainers** + окремий конфіг `apps/server/vitest.integration.config.ts` (singleFork, реальний Postgres pgvector) |
| Mobile (RN/Expo)                    | **Jest** з `jest-expo` пресетом (`apps/mobile/jest.config.js`)                                                          |
| Web E2E (smoke)                     | Playwright `playwright.smoke.config.ts` — піднімає Postgres + server + web preview                                      |
| Web a11y                            | Playwright + `@axe-core/playwright` (`tests/a11y/axe.spec.ts`)                                                          |
| Visual regression                   | Playwright + Argos CI (`tests/a11y/ds-visual-qa.spec.ts`, 56 скрінів)                                                   |
| Service-worker e2e                  | Playwright `tests/a11y/sw-smoke.spec.ts`                                                                                |
| Mobile E2E                          | **Detox** — `apps/mobile/e2e/*.e2e.ts` (iOS + Android), окремі workflow                                                 |
| Mutation testing                    | **Stryker** + `@stryker-mutator/vitest-runner` — `apps/web/stryker.cloudSync*.conf.json`                                |
| Contract tests                      | Producer/consumer пара через `@sergeant/shared/contract-fixtures` (приклад: `me.contract.test.ts`)                      |
| ESLint plugin tests                 | `node --test` + `packages/eslint-plugin-sergeant-design/__tests__/*.test.mjs`                                           |
| Storybook                           | `apps/web` (`storybook dev`, `build-storybook`), CI `storybook-deploy.yml`                                              |

### CI-лейни для тестів

```
ci.yml:
  - check         # pnpm check = format:check + lint + typecheck + test + build
  - coverage      # Test coverage (vitest)  — артефакти vitest-coverage-html / -summary
  - a11y          # Accessibility (axe-core)
  - critical-flow # Critical-flow E2E (Playwright @critical)
  - migration-lint, secret-scan, actionlint, pipeline-duration-summary

extended-e2e.yml         — nightly Playwright (з реальною БД)
detox-android.yml        — Detox Android
detox-ios.yml            — Detox iOS
mutation-testing.yml     — Stryker (cloudSync) — weekly + при змінах файлів
flaky-tests-dashboard.yml— збір JSON-репорту vitest, weekly
visual-regression.yml    — Argos visual diff на кожен PR
storybook-deploy.yml     — деплой Storybook
container-scan.yml, codeql.yml, audit-freeze.yml — security side
```

### Кількість тестових файлів за зонами (667 разом)

| Зона                                                                     |       Файлів |
| ------------------------------------------------------------------------ | -----------: |
| `apps/web`                                                               |          228 |
| `apps/server`                                                            |          117 |
| `apps/mobile`                                                            |          115 |
| `packages/shared`                                                        |           40 |
| `packages/eslint-plugin-sergeant-design`                                 |           27 |
| `packages/fizruk-domain`                                                 |           25 |
| `packages/db-schema`                                                     |           20 |
| `tools/console`                                                          |           19 |
| `packages/finyk-domain`                                                  |           14 |
| `packages/api-client`                                                    |           11 |
| `packages/routine-domain`                                                |            9 |
| `apps/mobile-shell`                                                      |            7 |
| `packages/nutrition-domain`                                              |            4 |
| `packages/insights`                                                      |            3 |
| `packages/design-tokens`                                                 |            3 |
| `scripts/__tests__`, `scripts/ci`, `scripts/docs`, `scripts/flaky-tests` |           25 |
| `packages/config`                                                        | 0 (намірено) |

### Coverage thresholds (актуальні floors)

`apps/web/vitest.config.js`

```
lines: 37   branches: 30   functions: 27   statements: 36
```

_Drift log у самому файлі чесно фіксує: 2026-04-25 baseline був lines/statements 17.42 / branches 65.51 / fns 52.42, тепер lines 39.29 / branches 32.83 / fns 29.3 / statements 38.06. Branches просіли на −32.7pp, functions на −23.1pp._

`apps/server/vitest.config.ts`

```
lines: 60   branches: 48   functions: 63   statements: 59
```

_Drift: з 2026-04-25 baseline lines/statements 67.13 / branches 79.31 / fns 72.80 → 2026-05-05 lines 60.51 / branches 48.97 / fns 63.97 / statements 59.54._

`apps/mobile/jest.config.js` (з [#1967](https://github.com/Skords-01/Sergeant/pull/1967), 2026-05-05):

```
lines: 30   branches: 25   functions: 30   statements: 30
```

_До 2026-05-05 `coverageThreshold` був не сконфігуровано (`jest --passWithNoTests`); тепер CI lane `coverage` піднімає mobile-jest з артефактом `mobile-coverage-summary` і падає на drift._

Інші пакети: per-package threshold у відповідних `vitest.config.ts` (рекомендований стандарт у `packages/config/vitest.base.js`: lines/fn/stmt ≥ 60, branches ≥ 55).

---

## Прогалини за пріоритетом

### P0 — критичне для надійності, треба ближче до зараз

1. **`src/sw/**`— ~600 LoC, 0% покриття.** Service-worker (cache, debug, messages, notifiedKeys, reminders, version) додавався під PWA push reminders і ніколи не імпортується з vitest, бо jsdom не дає`self`. Два валідні шляхи (з коментаря в `vitest.config.js`):
   - **(a)** node-only suite, що імпортує SW-фактори без `self` (передавати скоуп явно як параметр), або
   - **(b)** виключити `src/sw/**` з coverage і вкласти весь захист у Playwright `tests/a11y/sw-smoke.spec.ts` + розширити його до повноцінного e2e (cache hit / offline navigation / SW-update / push reminder fire).
   - **Status (2026-05-06): закрито** — варіант (b) реалізовано в [#1970](https://github.com/Skords-01/Sergeant/pull/1970): `src/sw/**` виключено з coverage, sw-smoke e2e розширений.

2. **`apps/server/src/modules/digest/weekly-digest.ts`** — 0 тестів на 1 src-файл. Weekly digest формує важливий e-mail/повідомлення; регресії невидимі до релізу.
   - **Status (2026-05-06): закрито у відкритому PR** — [#1996](https://github.com/Skords-01/Sergeant/pull/1996) дає 95.19% statements / 82.81% branches / 100% functions / 95.65% lines на цьому файлі (22 тести; Anthropic + memory-queue замоковано через `vi.mock`, без DB).

3. **AI-tool handlers (`apps/server/src/modules/nutrition/*` + `openclaw/{tools,write-tools}.ts`)** — гілки rolejob → Anthropic → DB, кожен — 0–15% покриття. Це поверхня, яка буде розростатися (нові tool definitions). Мінімум: для кожного tool — happy path + один failure path (Anthropic error / invalid args / БД-RLS). Таблиця:

   | Файл                                  | Поточно | Що додати                                                        |
   | ------------------------------------- | ------- | ---------------------------------------------------------------- |
   | `nutrition/day-hint.ts`               | ~0–15%  | unit: tool args validation, БД-збережений hint, кейш             |
   | `nutrition/day-plan.ts`               | ~0–15%  | unit: побудова плану, kcal/macro обмеження, fallback             |
   | `nutrition/food-search.ts`            | ~0–15%  | unit: пагінація, кешування результату, error від Open Food Facts |
   | `nutrition/parse-pantry.ts`           | ~0–15%  | unit: parser, missing nutrients fallback                         |
   | `nutrition/find-recipes.ts`           | ~0–15%  | unit: фільтр алергенів, score                                    |
   | `nutrition/shopping-list.ts`          | ~0–15%  | unit: aggregate by aisle, dedup                                  |
   | `nutrition/week-plan.ts`              | ~0–15%  | unit: розкладка днів, повторюваність                             |
   | `openclaw/tools.ts`, `write-tools.ts` | низьке  | unit: registry, dispatch, write-перевірка авторизації            |

4. **`apps/server/src/modules/sync/syncV2.ts`** — ~0–1% line coverage, при тому що це серверна сторона, симетрична до `apps/web/src/core/cloudSync/queue/` (де вже є Stryker з 64% mutation score). Сильна асиметрія: клієнт перевіряємо мутаціями, сервер — майже ніяк.
   - **Status (2026-05-06): частково закрито у відкритому PR** — [#2001](https://github.com/Skords-01/Sergeant/pull/2001) додає 21 no-DB unit-тест: frozen-contract reject reasons, validation gates push/pull, idempotency-replay (duplicate-only batch), pull happy-path з coerce bigint→number і trim `X-Origin-Device-Id`, ROLLBACK + release при throw, без SSE-emit на failed COMMIT. Цим файлом ~13% lines/stmts; решта (DB-coupled apply-функції) вкривається `syncV2.integration.test.ts` під Testcontainers. Доведення `syncV2.ts` до ≥ 60% потребуватиме виокремлення pure-функцій з прямого `pool`/`PoolClient` access (запланована наступна ітерація).

5. **`apps/mobile` без enforcement coverage.** 115 тестів — не мало, але немає `coverageThreshold` у `jest.config.js`, тож регресії не помітяться. Мінімум — додати floor навіть низький (наприклад 30/25/30/30) і fail CI на drift.
   - **Status (2026-05-06): закрито** — [#1967](https://github.com/Skords-01/Sergeant/pull/1967) ставить mobile-jest floor (lines 30 / branches 25 / fns 30 / stmts 30) і додає `test:coverage` script у CI lane `coverage`.

### P1 — додає реальну цінність

6. **Розширити web smoke E2E.** Зараз 4 спеки (`auth`, `bottom-nav`, `dashboard-health`, `navigation-offline-sw`). Бракує golden-path по модулях, тих, що в README як основні:
   - **Finyk:** додати manual transaction → бачиш у списку → balance оновився.
   - **Fizruk:** запустити training → залогувати підхід → метрика змінилась.
   - **Nutrition:** додати meal → barcode-сценарій (мокований OFF) → AI-підказка через `parse-pantry` (мокований Anthropic).
   - **Routine:** check-in → стрік++ → календар відмалював сьогодні.
   - **HubChat:** надіслати команду коучу → tool execution → візуальний ефект на іншому модулі.

7. **Mobile Detox: пропущені модулі.** Зараз `finyk-manual-expense`, `finyk-transactions`, `routine-smoke`, `hub-ux-smoke`. Бракує:
   - `auth-login.e2e.ts` (Better Auth flow на нативі — він і так найкрихкіший).
   - `nutrition-add-meal.e2e.ts` + `nutrition-barcode.e2e.ts`.
   - `fizruk-log-set.e2e.ts`.
   - `deep-link.e2e.ts` (сайди вже unit-тестовано в `mobile-shell`, але повного flow з нативного inbound link нема).
   - `offline-sync.e2e.ts` (offline → дії → online → reconcile).

8. **Visual regression: розширити поверхні.** `ds-visual-qa.spec.ts` — 56 скрінів, але тільки 7 surfaces (welcome, hub-pre-ftux, hub, +4 модульних shell). Не покрито: транзакція-detail, тренування-detail, страва-detail, форми FTUX-кроків, settings, error/empty states. Дешеві додаткові кадри ловлять найбільше регресій DS.

9. **Mutation testing: розширити scope.** Зараз тільки `cloudSync/conflict` (87.16%) і `cloudSync/queue` (64.38%). Кандидати з найвищим blast radius:
   - `packages/finyk-domain/src/**` — money math (округлення, FX, формули балансу). Помилка тут — мовчазна крадіжка копійок.
   - `apps/server/src/modules/sync/syncV2.ts` — серверний bookend cloudSync.
   - `apps/server/src/lib/normalizers/*` — нормалізація даних, легко регресує тихо.
   - `apps/server/src/auth/passwordHash.ts` — boundary безпеки.
   - `packages/insights/src/**` — формули агрегації.

10. **Contract tests тільки одна пара.** `me.contract.test.ts` (consumer/producer) — зразок є, шаблон в `@sergeant/shared/contract-fixtures`. Реплікувати на:
    - `POST /api/chat/*` (HubChat — найбільш важлива поверхня).
    - `GET/POST /api/sync/v2/*`.
    - `GET /api/v1/finyk/*`, `routine/*`, `nutrition/*`, `fizruk/*` (хоча б по одному endpoint на модуль, типізація через openapi-typescript і так є — лишилось зафіксувати фактичні response shapes).

### P2 — health & гігієна

11. **Слабкі пакети за співвідношенням test/src:**
    - `packages/insights` — 3 тести / 13 src. Це cross-module аналітика, чисті функції; ідеально під property-based (fast-check).
    - `packages/nutrition-domain` — 4 / 13. Найслабший з домен-пакетів.
    - `packages/api-client` — 11 / 30. Бракує retry/timeout/auth-refresh boundary тестів.
    - `packages/routine-domain` — 9 / 19.

12. **Server `modules/observability/` — 2 тести.** Спан-сенсітивні URL-маски, sampler, tracing вже мають по 1 тесту, але poshlog/sentry/web-vitals — без юніт-тестів виносу даних. Це місце, де мовчазний регрес відключає весь моніторинг.

13. **No property-based tests взагалі.** При наявній математиці (finyk amounts, sync version vectors, queue dedup, normalizers) `fast-check` дав би в десятки разів більше assert'ів за рядок коду. Stryker і fast-check добре спарюються (Stryker мутує → fast-check ловить).

14. **No load/perf tests** на Anthropic-важких ендпойнтах (chat, parse-pantry) і `sync/v2` під contention. Хоча б один Artillery/k6 сценарій у nightly — щоб p95-регресію ловити до релізу.

15. **`tools/console`** — 19 unit-тестів, але немає end-to-end бот-сценарію (моковий grammy update → асерти на reply). Не критично для основного продукту, але дешево додається.

16. **Migrations rollback.** `packages/db-schema` має `migrations/__tests__/` (3 файли) + `lint-migrations.mjs` — добре. Не ясно, чи кожна нова міграція тестує і `down()` — варто перевірити шаблон `plop-templates/new-migration` і додати rollback-assertion за замовчуванням.

17. **A11y deep screens.** `axe.spec.ts` ходить тільки по hub-сторінках. Внутрішні форми (add transaction, log workout, барcode-сканер, settings sheets) — поза axe-перевіркою. Дешево додаються в той же spec.

18. **`apps/server` без MSW для outbound HTTP.** Anthropic / Voyage / Monobank / OFF — зараз моки розкидані по тестах через `vi.mock`. Можна централізувати під nock або msw-server для consistency і простіше змінювати fixtures.

---

## Швидкий план “що ставити в roadmap”

| Пріоритет | Що зробити                                                                                          | Розмір                |
| --------: | --------------------------------------------------------------------------------------------------- | --------------------- |
|        P0 | Тести для `digest/weekly-digest.ts` + `nutrition/{7 tools}.ts` + `openclaw/tools.ts,write-tools.ts` | ~1 спринт, 8–12 PR-ів |
|        P0 | Розблокувати coverage для `src/sw/**` (node-only suite або excludе + e2e)                           | 1 PR                  |
|        P0 | `coverageThreshold` для `apps/mobile` (Jest)                                                        | 1 PR                  |
|        P0 | Тести для `apps/server/src/modules/sync/syncV2.ts` + Stryker-конфіг для нього                       | 2 PR                  |
|        P1 | 5 web smoke E2E (по одному на модуль + HubChat)                                                     | 1 спринт              |
|        P1 | 5 Detox suites (auth, nutrition×2, fizruk, deep-link, offline-sync)                                 | 1 спринт              |
|        P1 | Stryker scope: `finyk-domain`, `insights`, `normalizers`, `passwordHash`                            | 4 PR                  |
|        P1 | Розширити Argos surfaces до module-detail/forms/error states                                        | 2 PR                  |
|        P1 | Контрактні пари ще для 4–5 ключових ендпойнтів                                                      | 4–5 PR                |
|        P2 | fast-check у `finyk-domain`, `insights`, `cloudSync/queue`                                          | 3 PR                  |
|        P2 | k6/Artillery нічний lane на chat + sync/v2                                                          | 1 PR                  |
|        P2 | Розширити axe spec на форми/sheets                                                                  | 1 PR                  |
|        P2 | Підняти test/src-співвідношення в `insights`, `nutrition-domain`, `api-client`                      | поступово             |

---

## Що **не зламано** (щоб не чіпати)

- `packages/eslint-plugin-sergeant-design` — 27 тестів через `node --test` для ESLint-правил, окремий lint-лейн. Все ок.
- Stryker налаштований правильно (paths-фільтр на cloudSync, weekly cron, threshold break/low/high), документація є (`docs/testing/mutation.md`). Бракує лише розширення scope.
- Contract-fixtures шаблон через `@sergeant/shared` — вже архітектурно правильний, лишилося реплікувати.
- Testcontainers + pgvector у server-integration і extended-e2e — теж правильна форма. Тільки треба більше інтеграційних кейсів (зараз 4: `migrate-routine-from-blob`, `mono/read`, `ai-memory/vectorStore`, `sync/syncV2`).
