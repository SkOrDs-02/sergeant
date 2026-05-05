# Sergeant — PR-план для тестів

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active
>
> Repo: `Skords-01/Sergeant`. Базується на [`2026-05-05-tests-review.md`](./2026-05-05-tests-review.md) (попередній аналіз).

## Як читати

Кожен PR має **scope** (що додаємо), **acceptance** (як CI підтвердить, що ок), **size** (рядків приблизно), **deps** (на чому стоїть). Один PR = один логічний крок (≤ ~400 LoC змін, бажано ≤ ~200), щоб ревʼю було швидке і pr-size workflow не сварився.

Гілки — `devin/{ts}-{slug}` (як стандарт у репо).

Послідовність трекаєтся через **wave** — wave A треба перш ніж wave B (через залежності або щоб коридор coverage thresholds рухався вгору без флапу).

---

## Wave A — P0 unblock (срочне, тиждень 1)

### PR-T01 — `coverageThreshold` для `apps/mobile`

- **Branch:** `devin/{ts}-mobile-coverage-floor`
- **Files:** `apps/mobile/jest.config.js`, `apps/mobile/package.json` (script `test:coverage`)
- **Scope:** додати `coverageThreshold` (consensus floor: lines 30 / branches 25 / fns 30 / stmts 30 — на 1pp нижче поточного факту, як і у web/server). Додати `test:coverage` script. Підвʼязати у `ci.yml` lane `coverage` (паралельно до vitest job).
- **Acceptance:** CI `coverage` job піднімає mobile-jest з coverage; артефакт `mobile-coverage-summary` зʼявляється; падає при дрейфі вниз.
- **Size:** ~30 LoC + ~50 LoC у `ci.yml`.
- **Deps:** —. Можна першим.

### PR-T02 — Service-worker testability (`apps/web/src/sw/**`)

- **Branch:** `devin/{ts}-web-sw-coverage-decision`
- **Files:** додати `apps/web/src/sw/__tests__/*.test.ts` АБО `apps/web/vitest.config.js` (виключення).
- **Scope (варіант A — preferred):** перепис SW-факторів так, щоб `self`/registration/clients передавалися як параметр (DI). Юніт-тестуємо `cache.ts`, `messages.ts`, `notifiedKeys.ts`, `reminders.ts`, `version.ts` без `self`. (`debug.ts` — суто proxy, можна виключити.)
- **Scope (варіант B — fallback):** виключити `src/sw/**` з coverage (`exclude: [...baseExclude, "src/sw/**"]`) і розширити `tests/a11y/sw-smoke.spec.ts` до повноцінного e2e (cache hit / offline navigation / SW-update / push reminder fire).
- **Acceptance:** web `branches` floor підіймається з 30 → ≥ 50; `functions` з 27 → ≥ 45; `lines/stmts` стабільні. Drift log оновлюється з новим baseline.
- **Size:** варіант A — ~250 LoC тестів + 80 LoC рефакторингу; варіант B — ~150 LoC e2e + 5 LoC config.
- **Deps:** —. Окремо від T03.

### PR-T03 — Тести для `apps/web/src/shared/lib/idb/sergeantDb.ts`

- **Branch:** `devin/{ts}-web-idb-tests`
- **Files:** `apps/web/src/shared/lib/idb/sergeantDb.test.ts`, можливо `apps/web/src/test/setup.ts` (fake-indexeddb).
- **Scope:** покрити open/upgrade/version-migration/CRUD на кожному store. Використати `fake-indexeddb` (популярний).
- **Acceptance:** `sergeantDb.ts` ≥ 80% lines/branches.
- **Size:** ~250 LoC тестів.
- **Deps:** —.

### PR-T04 — Тести для `apps/web/src/shared/lib/ui/{amountTone,export,perf}.ts`

- **Branch:** `devin/{ts}-web-shared-ui-utils-tests`
- **Files:** три `*.test.ts` поряд з джерелом.
- **Scope:** pure-utils, тривіальні юніт-кейси (всі гілки + edge cases: 0, NaN, від'ємні, локалі для `export`, raf для `perf`).
- **Acceptance:** кожен файл ≥ 90% lines.
- **Size:** ~180 LoC.
- **Deps:** —.

### PR-T05 — Тести для `apps/server/src/modules/digest/weekly-digest.ts`

- **Branch:** `devin/{ts}-server-weekly-digest-tests`
- **Files:** `apps/server/src/modules/digest/weekly-digest.test.ts`, можливо fixtures у `apps/server/src/modules/digest/__fixtures__/`.
- **Scope:** мокати DB (vi.mock pg) і Anthropic (для summary), перевірити: empty-week branch, partial data, full data, formatting locale, повторний запуск idempotent.
- **Acceptance:** файл ≥ 80% lines/branches; server `lines` floor +1pp.
- **Size:** ~200 LoC.
- **Deps:** —.

### PR-T06 — Server `sync/syncV2.ts` юніт-тести (no-DB)

- **Branch:** `devin/{ts}-server-syncv2-unit`
- **Files:** `apps/server/src/modules/sync/syncV2.test.ts`.
- **Scope:** виокремити чисті функції (pull-merge, conflict-resolution, version-vector update). Мокати pg-pool. Покрити: pull empty, pull with deltas, push happy, push conflict (server-newer / client-newer), idempotency-key replay, dirty-skip.
- **Acceptance:** `syncV2.ts` ≥ 60% lines/branches; server `lines` floor + 2pp.
- **Size:** ~350 LoC.
- **Deps:** —.

### PR-T07 — Server `sync/syncV2.integration.test.ts` доповнення

- **Branch:** `devin/{ts}-server-syncv2-integration`
- **Files:** `apps/server/src/modules/sync/syncV2.integration.test.ts` (вже існує — розширюємо).
- **Scope:** додати кейси з реальною БД через Testcontainers: дві паралельні сесії юзера → конфлікт → детермінований resolver; replay після відновлення зʼєднання; RLS-перевірки (інший userId не бачить).
- **Acceptance:** integration suite додає 5–8 нових кейсів, всі зелені.
- **Size:** ~300 LoC.
- **Deps:** PR-T06 (щоб у мутаційному прогоні юніти не дублювали інтеграцію).

---

## Wave B — P0 AI-tools (тиждень 1–2, можна паралельно з Wave A)

### PR-T08 — Anthropic-mock harness для server tools

- **Branch:** `devin/{ts}-server-anthropic-mock-harness`
- **Files:** `apps/server/src/test/__mocks__/anthropic.ts`, `apps/server/src/test/anthropicFixtures/*.json`, маленький README.
- **Scope:** єдиний reusable mock для `@anthropic-ai/sdk` з програмованими responses (tool_use turn / text / error). Звільняє T09–T11 від copy-paste.
- **Acceptance:** використовується у наступних PR; nutrition tools тести стабільні.
- **Size:** ~150 LoC.
- **Deps:** —. Робимо першим у Wave B.

### PR-T09 — Nutrition tools (1/3): `day-hint`, `day-plan`

- **Branch:** `devin/{ts}-server-nutrition-tools-day`
- **Files:** `apps/server/src/modules/nutrition/day-hint.test.ts`, `day-plan.test.ts`.
- **Scope:** на файл — happy path + invalid args + Anthropic error + DB-RLS. Зразок: `me.contract.test.ts` + harness з PR-T08.
- **Acceptance:** обидва файли ≥ 70% lines/branches.
- **Size:** ~250 LoC.
- **Deps:** PR-T08.

### PR-T10 — Nutrition tools (2/3): `food-search`, `parse-pantry`

- **Branch:** `devin/{ts}-server-nutrition-tools-search-pantry`
- **Files:** `food-search.test.ts`, `parse-pantry.test.ts`.
- **Scope:** як T09 + мок Open Food Facts (через MSW або nock). Покрити пагінацію, кеш, парсер missing-nutrients fallback.
- **Acceptance:** обидва ≥ 70%.
- **Size:** ~280 LoC.
- **Deps:** PR-T08.

### PR-T11 — Nutrition tools (3/3): `find-recipes`, `shopping-list`, `week-plan`

- **Branch:** `devin/{ts}-server-nutrition-tools-recipes-week`
- **Files:** три `*.test.ts`.
- **Scope:** як T09. Особливо: `shopping-list` — aggregate by aisle + dedup; `week-plan` — розкладка днів + повторюваність.
- **Acceptance:** усі три ≥ 70%.
- **Size:** ~320 LoC.
- **Deps:** PR-T08.

### PR-T12 — Openclaw `tools.ts` + `write-tools.ts`

- **Branch:** `devin/{ts}-server-openclaw-tools-tests`
- **Files:** `apps/server/src/modules/openclaw/tools.test.ts`, `write-tools.test.ts`.
- **Scope:** registry round-trip, dispatch, авторизація writes (юзер не може писати в чужий userId), validation помилок Anthropic tool_use args.
- **Acceptance:** обидва ≥ 70%; server `branches` floor +3pp.
- **Size:** ~220 LoC.
- **Deps:** PR-T08.

**Після Wave B**: підняти server thresholds до lines 64 / branches 55 / fns 67 / stmts 63 (drift log оновити).

---

## Wave C — P1 Smoke E2E (тиждень 2–3)

> Шаблон у `apps/web/tests/smoke/auth.spec.ts` — seedLocalStorage + Playwright. Кожен PR — окремий spec + testID hints у компонентах.

### PR-T13 — Web smoke E2E: Finyk

- **Branch:** `devin/{ts}-web-smoke-finyk`
- **Files:** `apps/web/tests/smoke/finyk-add-transaction.spec.ts`, можливо `data-testid` додати в 2-3 компонентах.
- **Scope:** додати manual transaction → видно у списку → balance оновився. Тег `@critical` щоб ловив `critical-flow` lane.
- **Acceptance:** spec зелений у `playwright.smoke.config.ts` з реальним server + Postgres.
- **Size:** ~120 LoC + кілька data-testid.
- **Deps:** —.

### PR-T14 — Web smoke E2E: Fizruk

- **Branch:** `devin/{ts}-web-smoke-fizruk`
- **Files:** `apps/web/tests/smoke/fizruk-log-set.spec.ts`.
- **Scope:** start training → log set → метрика змінилась.
- **Size:** ~120 LoC.
- **Deps:** —.

### PR-T15 — Web smoke E2E: Nutrition

- **Branch:** `devin/{ts}-web-smoke-nutrition`
- **Files:** `apps/web/tests/smoke/nutrition-add-meal.spec.ts`, `apps/web/src/test/msw/nutritionHandlers.ts` (мокаємо OFF + Anthropic для `parse-pantry`).
- **Scope:** додати meal → barcode-сценарій → AI-підказка → запис у БД.
- **Size:** ~180 LoC.
- **Deps:** —.

### PR-T16 — Web smoke E2E: Routine

- **Branch:** `devin/{ts}-web-smoke-routine`
- **Files:** `apps/web/tests/smoke/routine-checkin.spec.ts`.
- **Scope:** check-in → стрік++ → календар відмалював сьогодні.
- **Size:** ~100 LoC.
- **Deps:** —.

### PR-T17 — Web smoke E2E: HubChat

- **Branch:** `devin/{ts}-web-smoke-hubchat`
- **Files:** `apps/web/tests/smoke/hubchat-tool-call.spec.ts`, мок Anthropic у server side через AI_QUOTA_DISABLED + responses fixture.
- **Scope:** надіслати команду коучу → tool execution → візуальний ефект на іншому модулі (наприклад: «додай витрату 100 грн на каву» → у Finyk транзакція).
- **Size:** ~200 LoC.
- **Deps:** PR-T15 (msw harness).

---

## Wave D — P1 Mobile Detox (тиждень 3–4)

> Шаблон у `apps/mobile/e2e/finyk-manual-expense.e2e.ts` + `apps/mobile/e2e/README.md`. Кожен PR — один spec + testID hints.

### PR-T18 — Detox: Auth login

- **Branch:** `devin/{ts}-mobile-detox-auth`
- **Files:** `apps/mobile/e2e/auth-login.e2e.ts`.
- **Scope:** Better Auth flow на нативному стеку — sign-in / sign-up / logout.
- **Acceptance:** проходить у `detox-android.yml` і `detox-ios.yml`.
- **Size:** ~150 LoC.
- **Deps:** —.

### PR-T19 — Detox: Nutrition (add meal + barcode)

- **Branch:** `devin/{ts}-mobile-detox-nutrition`
- **Files:** `apps/mobile/e2e/nutrition-add-meal.e2e.ts`, `nutrition-barcode.e2e.ts`.
- **Scope:** ручне додавання + barcode-сценарій (мокаємо камеру через Detox URL-param).
- **Size:** ~200 LoC.
- **Deps:** —.

### PR-T20 — Detox: Fizruk log set

- **Branch:** `devin/{ts}-mobile-detox-fizruk`
- **Files:** `apps/mobile/e2e/fizruk-log-set.e2e.ts`.
- **Scope:** start workout → log set → save.
- **Size:** ~130 LoC.
- **Deps:** —.

### PR-T21 — Detox: Deep link

- **Branch:** `devin/{ts}-mobile-detox-deeplink`
- **Files:** `apps/mobile/e2e/deep-link.e2e.ts`.
- **Scope:** inbound `sergeant://` link → правильний screen, у `mobile-shell` юніти вже є, тут — нативний flow end-to-end.
- **Size:** ~120 LoC.
- **Deps:** —.

### PR-T22 — Detox: Offline sync

- **Branch:** `devin/{ts}-mobile-detox-offline-sync`
- **Files:** `apps/mobile/e2e/offline-sync.e2e.ts`.
- **Scope:** offline → дії в кількох модулях → online → reconcile. Використати Detox network mock.
- **Size:** ~200 LoC.
- **Deps:** —. Найскладніший з Detox-set, ставити останнім у wave.

---

## Wave E — P1 Mutation testing scope (тиждень 4)

### PR-T23 — Stryker для `packages/finyk-domain`

- **Branch:** `devin/{ts}-stryker-finyk-domain`
- **Files:** `packages/finyk-domain/stryker.conf.json`, оновлення `package.json` script `test:mutation`, `.github/workflows/mutation-testing.yml` (додаємо job).
- **Scope:** money math + amount formatting. Очікуваний baseline ≥ 80% (домен чистий).
- **Acceptance:** workflow `mutation-testing` зелений, `break: 70` / `low: 75` / `high: 85`.
- **Size:** ~80 LoC.
- **Deps:** —.

### PR-T24 — Stryker для `apps/server/src/modules/sync/syncV2.ts`

- **Branch:** `devin/{ts}-stryker-server-syncv2`
- **Files:** `apps/server/stryker.syncV2.conf.json`, mutation workflow.
- **Scope:** мутувати тільки `syncV2.ts`. Baseline залежить від наявності тестів з PR-T06.
- **Size:** ~80 LoC.
- **Deps:** PR-T06 (без тестів немає що killувати).

### PR-T25 — Stryker для `apps/server/src/lib/normalizers/*`

- **Branch:** `devin/{ts}-stryker-server-normalizers`
- **Files:** `apps/server/stryker.normalizers.conf.json`.
- **Size:** ~80 LoC.
- **Deps:** —. Tests вже є (5 файлів).

### PR-T26 — Stryker для `apps/server/src/auth/passwordHash.ts`

- **Branch:** `devin/{ts}-stryker-passwordhash`
- **Files:** `apps/server/stryker.passwordHash.conf.json`.
- **Scope:** малий файл, але boundary безпеки.
- **Size:** ~50 LoC.
- **Deps:** —.

### PR-T27 — Stryker для `packages/insights`

- **Branch:** `devin/{ts}-stryker-insights`
- **Files:** `packages/insights/stryker.conf.json`.
- **Deps:** **PR-T31** (треба спершу підняти test/src ratio).

---

## Wave F — P1 Visual + Contract (тиждень 4–5)

### PR-T28 — Argos visual: розширити поверхні

- **Branch:** `devin/{ts}-visual-extend-surfaces`
- **Files:** `apps/web/tests/a11y/ds-visual-qa.spec.ts`.
- **Scope:** додати ще 6–8 surfaces: transaction-detail, workout-detail, meal-detail, settings, error-state, empty-state, FTUX-step-2/3. Залишити 4 viewports × 2 themes.
- **Acceptance:** Argos diff показує нові baseline кадри; CI час < 15 хв (timeout у workflow).
- **Size:** ~200 LoC.
- **Deps:** —.

### PR-T29 — Contract tests: chat (consumer + producer)

- **Branch:** `devin/{ts}-contract-chat`
- **Files:** `packages/shared/contract-fixtures/chat/*.ts`, `apps/server/src/modules/chat/chat.contract.test.ts`, `apps/web/src/test/contract/chat.contract.test.ts`.
- **Scope:** клонувати шаблон з `me.contract.test.ts`. Покрити streaming response shape + tool_use turns.
- **Size:** ~250 LoC.
- **Deps:** —.

### PR-T30 — Contract tests: sync v2 + finyk/routine/nutrition/fizruk hub-endpoints

- **Branch:** `devin/{ts}-contract-modules`
- **Files:** 5 пар (consumer/producer) під відповідні endpoints.
- **Scope:** один endpoint на модуль (як стрижень). Інші можна додати наступними хвилями.
- **Size:** ~500 LoC (можна розбити на 2–3 PR).
- **Deps:** —.

---

## Wave G — P2 гігієна (тиждень 5+)

### PR-T31 — Підняти `packages/insights` (3 → ~12 тестів)

- **Branch:** `devin/{ts}-insights-tests`
- **Files:** `packages/insights/src/**/*.test.ts`.
- **Scope:** unit-coverage для кожної pure-функції агрегації. Додати fast-check (див. T35).
- **Size:** ~250 LoC.
- **Deps:** —. Розблоковує T27.

### PR-T32 — Підняти `packages/nutrition-domain` (4 → ~12)

- **Branch:** `devin/{ts}-nutrition-domain-tests`
- **Files:** `packages/nutrition-domain/src/**/*.test.ts`.
- **Size:** ~200 LoC.
- **Deps:** —.

### PR-T33 — Підняти `packages/api-client` (11 → ~20)

- **Branch:** `devin/{ts}-api-client-boundary-tests`
- **Files:** `packages/api-client/src/**/*.test.ts`.
- **Scope:** retry / timeout / 401 refresh / network error / 5xx backoff.
- **Size:** ~250 LoC.
- **Deps:** —.

### PR-T34 — Server `modules/observability/` deep tests

- **Branch:** `devin/{ts}-server-observability-tests`
- **Files:** `apps/server/src/modules/observability/*.test.ts`.
- **Scope:** sentry beforeSend filter, posthog identify shape, web-vitals reception, sensitive URL mask edge cases.
- **Size:** ~200 LoC.
- **Deps:** —.

### PR-T35 — Property-based tests (fast-check) у `finyk-domain`, `insights`, `cloudSync/queue`

- **Branch:** `devin/{ts}-fast-check-properties`
- **Files:** додати `fast-check` як dev-dep, нові `.property.test.ts` поряд з юніт-тестами.
- **Scope:** finyk amount math (round-trip, associativity, currency-conversion identity), insights aggregations (sum-empty=0, sum monotonicity), queue dedup (idempotent enqueue, fifo per-key).
- **Size:** ~250 LoC + 1 dep.
- **Deps:** PR-T31 (insights).

### PR-T36 — Axe spec: deep screens

- **Branch:** `devin/{ts}-axe-deep-screens`
- **Files:** `apps/web/tests/a11y/axe.spec.ts`.
- **Scope:** додати тести на форми (add transaction, log workout, meal entry), modals/sheets, settings.
- **Size:** ~150 LoC.
- **Deps:** —.

### PR-T37 — k6/Artillery nightly performance

- **Branch:** `devin/{ts}-perf-nightly`
- **Files:** `scripts/perf/k6-chat.js`, `scripts/perf/k6-sync.js`, `.github/workflows/perf-nightly.yml`.
- **Scope:** сценарії на `chat` (single-turn + tool_use) і `sync/v2` (concurrent). Експортувати `p95` у dashboard артефакт.
- **Size:** ~250 LoC.
- **Deps:** PR-T29 (контракти chat дають стабільний shape для load).

### PR-T38 — Migration rollback за замовчуванням

- **Branch:** `devin/{ts}-migration-rollback-template`
- **Files:** `plop-templates/new-migration/**`, `packages/db-schema/migrations/__tests__/template.test.ts`, `scripts/lint-migrations.mjs`.
- **Scope:** plop-генератор кладе `down()` + rollback-asserцію за замовчуванням; lint падає якщо `down` пустий.
- **Size:** ~150 LoC.
- **Deps:** —.

### PR-T39 — `tools/console` end-to-end бот-сценарій

- **Branch:** `devin/{ts}-console-bot-e2e`
- **Files:** `tools/console/src/__tests__/bot.e2e.test.ts`.
- **Scope:** mock grammy update → assert reply text + side effects. Не блокує core продукт, дешевий PR.
- **Size:** ~150 LoC.
- **Deps:** —.

---

## Залежності (компактно)

```
T01    └─ PR-T01 (mobile floor) — independent
T02    └─ PR-T02 (sw)            — independent
T03    └─ PR-T03 (idb)           — independent
T04    └─ PR-T04 (ui utils)      — independent
T05    └─ PR-T05 (digest)        — independent
T06    └─ PR-T06 (sync unit)     — independent
T07    └─ PR-T07 (sync integ)    — needs T06
T08    └─ PR-T08 (anthropic mock harness) — independent
T09–11 └─ PR-T09/10/11 (nutrition tools) — need T08
T12    └─ PR-T12 (openclaw)     — needs T08
T13–17 └─ PR-T13/.../17 (web smoke) — independent (T17 wants msw з T15)
T18–22 └─ PR-T18/.../22 (mobile detox) — independent
T23    └─ PR-T23 (stryker finyk) — independent
T24    └─ PR-T24 (stryker syncV2) — needs T06
T25    └─ PR-T25 (stryker normalizers) — independent
T26    └─ PR-T26 (stryker passwordHash) — independent
T27    └─ PR-T27 (stryker insights) — needs T31
T28    └─ PR-T28 (visual extend) — independent
T29    └─ PR-T29 (contract chat) — independent
T30    └─ PR-T30 (contract modules) — independent
T31    └─ PR-T31 (insights tests) — independent
T32    └─ PR-T32 (nutrition-domain tests) — independent
T33    └─ PR-T33 (api-client boundary) — independent
T34    └─ PR-T34 (observability deep) — independent
T35    └─ PR-T35 (fast-check) — needs T31
T36    └─ PR-T36 (axe deep) — independent
T37    └─ PR-T37 (k6 perf) — needs T29
T38    └─ PR-T38 (migration rollback) — independent
T39    └─ PR-T39 (console bot e2e) — independent
```

## Порядок мерджу (рекомендований)

1. **Wave A першим:** T01, T03, T04, T05, T06 → T07, T02 — підіймає floor, відкриває drift log.
2. **Wave B після Anthropic-mock-harness (T08):** T09 → T10 → T11 → T12 — піднімає server thresholds.
3. **Wave C/D паралельно** (web smoke + mobile detox).
4. **Wave E (mutation):** T23 → T25 → T26 → T24 → T27.
5. **Wave F (visual + contract):** T28 → T29 → T30.
6. **Wave G (гігієна):** T31 → T32 → T33 → T34 → T35 → T36 → T37 → T38 → T39.

## Загальні acceptance-критерії (для будь-якого PR з цього списку)

- `pnpm check` зелений (format + lint + typecheck + test + build).
- Якщо торкаєшся coverage thresholds — drift log у `vitest.config` оновлений з новим baseline.
- `pr-size` workflow не перевищує liмits (≤ 400 LoC NET — інакше розбий PR).
- Якщо це E2E lane — критичні теги `@critical` тільки на справді критичних шляхах (інакше блокує main без потреби).
- Якщо PR додає нову dev-dep (fast-check, fake-indexeddb, nock тощо) — згадка у `.tech-debt/` або хоча б в README пакета.

## Підсумок розміру

| Wave  | PRs       | Сумарно ~LoC  | Час одного інженера |
| ----- | --------- | ------------- | ------------------- |
| A     | 7         | ~1500         | 1 тиждень           |
| B     | 5         | ~1100         | 1 тиждень           |
| C     | 5         | ~720          | 0.5–1 тиждень       |
| D     | 5         | ~800          | 1 тиждень           |
| E     | 5         | ~370          | 2–3 дні             |
| F     | 3         | ~950          | 0.5–1 тиждень       |
| G     | 9         | ~1800         | 1.5–2 тижні         |
| **Σ** | **39 PR** | **~7240 LoC** | **~6–8 тижнів**     |
