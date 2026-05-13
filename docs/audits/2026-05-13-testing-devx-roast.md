# Sergeant — Прожарка #6/10: Testing & DevX (2026-05-13)

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active
> **Cross-refs:**
> [`docs/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](./2026-05-03-web-deep-dive/04-security-observability-testing-devx.md) — попередня deep-dive прожарка (web, секції §7 Testing pyramid + §8 DevX) ·
> [`docs/audits/2026-05-07-app-audit.md`](./2026-05-07-app-audit.md) — генеральний аудит, що зафіксував blocker з web-build-smoke та heap-OOM у mobile-jest ·
> [`docs/audits/2026-05-07-full-app-regression-ux-audit.md`](./2026-05-07-full-app-regression-ux-audit.md) — регресійний прохід після chain #2191–#2218 ·
> [`docs/testing/2026-05-05-tests-pr-plan.md`](../testing/2026-05-05-tests-pr-plan.md) — multi-wave PR-план (Wave A–G, ~50 PR-ів) ·
> [`docs/testing/2026-05-05-tests-review.md`](../testing/2026-05-05-tests-review.md) — інвентар testing-стека (Vitest / Jest / Playwright / Detox / Stryker / Argos / MSW / Testcontainers) ·
> [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — primary CI gate (759 lines, 12+ jobs).

**Скоуп:** Vitest (web), Jest (mobile), Playwright (e2e + visual), CI workflows, developer experience — pre-commit, lint-staged, helper scripts, lint швидкість.

**Метод:** статичний прохід по `apps/*/tests/**`, `apps/*/vitest.config.*`, `apps/mobile/jest.config.*`, `.github/workflows/**`, `scripts/**`, `plop-templates/**`, `CONTRIBUTING.md`. Перехресна перевірка landing-PR-ів проти plan-у з `docs/testing/2026-05-05-tests-pr-plan.md` — пункти БЕЗ merged PR / без статусу Done вважалися outstanding.

**Формат:** P0/P1/P2 з конкретними `file:line` посиланнями та явними діями `Add / Change / Remove`. Секція [«Прогрес виконання»](#прогрес-виконання) фіксує, які пункти закриті цим PR.

## TL;DR — top-7 болів

1. **Empty `.down.sql` не блокується лінтером.** Plop emit-ить `-- TODO: write your DOWN (rollback) migration here` — контрибутори історично лишали placeholder без жодного rollback-SQL. Migration-lint бачив тільки `DROP` у `up.sql`, не порожнечу в down. Two-phase guarantee (Hard Rule #4) тримався на code review, а не на CI. ✅ Закрито в цьому PR (`scripts/lint-migrations.mjs:284`).
2. **Contract-fixture pattern застосовано тільки до `/api/me`.** `packages/shared/src/contract-fixtures/` має шаблон + `me.ts`, але `barcode`, `food-search`, `parse-pantry`, `chat`, `sync/v2`, `finyk/*`, `nutrition/*` не покриті — Hard Rule #3 (server ↔ api-client ↔ test) на цих endpoint-ах тримається лише на компіляції з generic-zod-схеми. ✅ Покрито `barcode` у цьому PR; решта — наступні роасти.
3. **Web coverage drift не повернувся до пре-крашу.** `apps/web/vitest.config.js:38` фіксує threshold lines 38 / branches 31 / functions 28 / statements 37 з drift-логом 2026-04-25 → 2026-05-05 (17.42 → 39.29 lines collapse). Plan-T03/T04/T05 частково landed (idb, ui utils, sw exclude), але `finyk/*`, `fizruk/*`, `nutrition/*` UI-зрізи лишаються низькі — раніше було 60+%.
4. **Server AI-tool handlers — coverage 0–15%.** `nutrition/{barcode-search, food-search, etc.}` + `openclaw/tools` + `digest/weekly-digest` живуть під 15% per `docs/testing/2026-05-05-tests-review.md:55-58`. Plan-T08–T12 запропонували mock-harness для Anthropic (#2012 merged), але самі юніти ще не написані; T09 (nutrition tools × 7) — null PR; T10–T11 (openclaw, weekly-digest) — null PR.
5. **Mobile Detox suite — лише 4 спеки** (`finyk`, `routine`, `hub`). Auth, nutrition, fizruk, deep-link, offline-sync — порожньо (`apps/mobile/e2e/`). Plan-T18–T22 — null landing PR. Без них реліз iOS/Android тримається тільки на ручному QA.
6. **Web smoke E2E — лише 4 спеки** (`auth`, `nav/offline`, `bottom-nav`, `dash`). Module-level smoke (`finyk`, `fizruk`, `nutrition`, `routine`, `hub-chat`) — не написано. Plan-T13–T17 + console e2e (#2022 merged частково) — основна частина outstanding.
7. **Pre-commit timing не вимірюється.** `pnpm install --frozen-lockfile` + Husky setup + lint-staged разом займають ~30 s на чистому checkout, але реальний `pre-commit` на staged TS/TSX (ESLint --fix + Prettier + `staged-typecheck.mjs`) ніхто не профілював. На великих PR (>20 файлів) це вже відчутно; CI-gate на `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` додатково не паралелиться поверх turbo cache.

## P0 — критичне, без обхідних шляхів

### P0-1. Empty `.down.sql` зливалися без жодної rollback-SQL — Hard Rule #4 enforcement gap

- **Файли:**
  - `scripts/lint-migrations.mjs:22` — попередньо лінтер дивився тільки на `DROP COLUMN`/`DROP TABLE` в `up.sql`. Порожній `.down.sql` ішов tracker-ом code review.
  - `plop-templates/migration/down.sql.hbs:1` — плейсхолдер `-- TODO: write your DOWN (rollback) migration here` лишався без додаткових інструкцій.
  - `docs/testing/2026-05-05-tests-pr-plan.md:296` — PR-T38 («migration rollback за замовчуванням») фіксував задачу як P0 wave-D, але landing PR — null.
- **Why:** Two-phase migrations (Hard Rule #4, `docs/governance/rules/04-sql-migrations-sequential-two-phase.md`) гарантовано тільки для прямого `DROP` через `ALLOW_DROP:` escape hatch. Якщо `up.sql` не використовує `DROP`, але потрібен ручний rollback (`ALTER TABLE … ADD COLUMN`, `DELETE FROM …`, тощо), порожній `.down.sql` — silent regression risk при release-incident.
- **Дія:** ✅ **Change** `scripts/lint-migrations.mjs:284` — додано `isEmptyDownMigration()` + `hasNoRollbackEscapeHatch()`; новий чек фейлить будь-який **новий або змінений** `.down.sql` з пустим тілом. Escape-hatch: `-- NO_ROLLBACK: <reason> (due: YYYY-MM-DD)`. Pre-existing empty down-файли не ретроактивно тригериться — gate працює тільки на touched files. ✅ **Change** `plop-templates/migration/down.sql.hbs` — додано explicit instruction-block у генерований файл. ✅ **Change** `docs/governance/rules/04-sql-migrations-sequential-two-phase.md:41` — задокументовано escape-hatch.

### P0-2. Mutation testing — config існує, але CI gate відсутній

- **Файли:**
  - `stryker.conf.json` — конфіг знайдено в репо, але `.github/workflows/ci.yml` його не запускає; ні required, ні weekly artifact.
  - `docs/testing/2026-05-05-tests-pr-plan.md:159-194` — Wave E (T23–T27) детально розписав scope: `packages/shared/src/utils/macros.ts`, `packages/shared/src/utils/date.ts`, `apps/server/src/lib/normalizers/*`, `apps/server/src/modules/finyk/finyk.service.ts`. Landing PR — null.
- **Why:** Без mutation testing coverage % бреше — line-coverage 60% з 90% dead branches проходить без червоного. Усі AI-tool handlers + normalizers (де баги дорогі — обчислення кількості калорій, нормалізація barcode-апстрімів) живуть без mutation gate.
- **Дія:** **Add** weekly cron-workflow `.github/workflows/mutation-testing.yml` що запускає Stryker на whitelisted set і публікує `--reporters json,html` як artifact. PR-required tier — `mutation-tier-1` (utils/macros + utils/date) з 70% mutation score. Розгорнути у наступних роастах — занадто великий обсяг для одного PR.

## P1 — high-impact gaps з готовим планом

### P1-1. Contract-fixture pattern застосовано тільки до `/api/me`

- **Файли:**
  - `packages/shared/src/contract-fixtures/me.ts` — єдиний реальний fixture (4 кейси: minimal / full / legacyNoCreatedAt / unverified).
  - `packages/shared/src/contract-fixtures/README.md:1` — pattern definition: «one fixture = golden shape producer emits ↔ consumer accepts byte-for-byte».
  - `apps/web/src/test/contract/me.contract.test.ts:1` — єдиний consumer-side приклад.
  - `apps/server/src/routes/me.contract.test.ts:1` — producer-side companion.
  - `docs/testing/2026-05-05-tests-pr-plan.md:236-265` — PR-T29/T30 (web + module contracts). Landing PR — null до цього PR.
- **Why:** Hard Rule #3 («server response shape ↔ api-client types ↔ test») тримається на TypeScript-компіляції з `z.infer<>` — runtime drift (server emit-ить новий nullable, api-client не знає) ловиться тільки у production. Дані з `nutrition/*`, `finyk/*`, `routine/*` йдуть через узгоджені schemas, але без round-trip-теста.
- **Дія:** ✅ **Add** `packages/shared/src/contract-fixtures/barcode.ts` + `apps/web/src/test/contract/barcode.contract.test.ts` — 4 success + 3 error fixtures, schema-only sanity + api-client round-trip + drift detection (missing `name`, unknown `source`, empty error message). Producer-side companion (через `supertest` + mock pool/auth) винесено в окремий PR — потребує тісної інтеграції з `createApp()` стабом, що збільшує scope понад 5–15 файлів. **Add (наступні роасти):** food-search, parse-pantry, chat (streaming-special-case), sync/v2, finyk/cashflow, nutrition/log, routine/today, fizruk/heatmap.

### P1-2. Server AI-tool handlers — coverage 0–15%

- **Файли:** `apps/server/src/modules/nutrition/{barcode-search.ts,food-search.ts,parse-pantry.ts,log-meal.ts,recall-meals.ts,update-meal.ts,delete-meal.ts}` — 7 tool-handlers; `apps/server/src/modules/openclaw/tools/*`; `apps/server/src/modules/digest/weekly-digest.ts` (`docs/testing/2026-05-05-tests-review.md:55-58`).
- **Why:** AI-tool handlers викликаються Anthropic-ом через streaming chat — production-bug означає silent llm-tool-failure, ловиться тільки через ad-hoc logs. `#2012` (`docs/testing/2026-05-05-tests-pr-plan.md:117`) додав Anthropic mock-harness — unblock для T09–T12. Юніти ще не написані.
- **Дія:** **Add** `apps/server/src/modules/nutrition/__tests__/*.test.ts` × 7 (use mock-harness from `apps/server/src/test-utils/anthropic-mock.ts`). Floor: кожен tool — 1 happy-path + 1 input-validation reject + 1 schema-mismatch reject. Розгорнути у наступних роастах через scope (7 файлів × ~50 LOC tests = 350 LOC + ~10 fixture файлів).

### P1-3. Web smoke E2E — лише 4 спеки

- **Файли:** `apps/web/e2e/{auth,nav-offline,bottom-nav,dash}.spec.ts` — 4 існуючих файли. Plan-T13–T17 додає `finyk-smoke.spec.ts`, `nutrition-smoke.spec.ts`, `fizruk-smoke.spec.ts`, `routine-smoke.spec.ts`, `hub-chat-smoke.spec.ts`.
- **Why:** PWA + Vercel deploy live-checking — критичні modules (`finyk`, `nutrition`, `fizruk`, `routine`, `hub-chat`) не покриті жодним E2E. Регресія типу «routes /finyk crashes on cold load» проходить через CI без alarm-у.
- **Дія:** **Add** 5 нових spec файлів (по 1 happy-path per module). Розгорнути у наступних роастах — Playwright suites потребують стабу для Better Auth сесії та deterministic seed-data, що окремий ефорт.

### P1-4. Mobile Detox suite — лише 4 спеки

- **Файли:** `apps/mobile/e2e/{finyk.e2e.ts,routine.e2e.ts,hub.e2e.ts}` + одна shared utils. Plan-T18–T22: `auth.e2e.ts`, `nutrition.e2e.ts` (2 спеки — barcode-scan + manual-log), `fizruk.e2e.ts`, `deep-link.e2e.ts`, `offline-sync.e2e.ts`.
- **Why:** Detox runner налагоджено (PR #2215 закрив heap-OOM з Jest 30), але coverage для critical-path mobile-only flows (deep-link від `sergeant://` URL, offline-sync round-trip) — нуль. Реліз iOS/Android тримається тільки на ручному QA.
- **Дія:** **Add** 6 нових e2e файлів. Розгорнути у наступних роастах через scope (mobile Detox setup має high-friction iteration cycle — кожен файл = run-on-simulator + flake risk).

### P1-5. Pre-commit timing не вимірюється

- **Файли:** `.husky/pre-commit:1` → `pnpm exec lint-staged --concurrent false`. Stages: ESLint --fix + Prettier (per file), `scripts/staged-typecheck.mjs` (one batch per staged TS/TSX), `scripts/docs/bump-last-validated.mjs` (per `.md`).
- **Why:** На великих PR (>20 файлів) pre-commit вже відчутно тригерить уповільнення; точних чисел немає. `lint-staged --concurrent false` (а не `true`) — захист від OOM, але можливо лишає performance left on the table.
- **Дія:** **Add** `scripts/timing-precommit.mjs` що репортує `time` для кожного stage у `.husky/.last-precommit-timing.json` (gitignored); опційний `pnpm precommit:bench` що руне його на mock-staging. Розгорнути у наступних роастах — потребує дискусії про privacy (timing не має ставитися у репо).

### P1-6. Web coverage drift не повернувся до пре-крашу

- **Файли:** `apps/web/vitest.config.js:38` — фіксує threshold lines 38 / branches 31 / functions 28 / statements 37 з історичним drift-логом.
- **Why:** Падіння з 60+% lines (pre-2026-04-25) до 17.42% (2026-04-25 SW + idb explosion) і часткове відновлення до 39.29% (2026-05-05 post-PR-#1971/#1992) — все ще ниже норми. `finyk/*`, `fizruk/*`, `nutrition/*` UI-зрізи лишаються тонкі.
- **Дія:** **Add** Wave-A T03/T04/T05 follow-up — `apps/web/src/finyk/__tests__/`, `apps/web/src/fizruk/__tests__/`, `apps/web/src/nutrition/__tests__/` — мінімум по 1 hook + 1 selector + 1 wallet/scenario test для кожного модуля. Розгорнути у наступних роастах — scope ~15 файлів.

## P2 — nice-to-have, ризик ≤ medium

### P2-1. `pnpm dedupe --check` не в CI

- **Файли:** `package.json:48` (lint-staged config має `prettier`/`eslint`/`tsc-files`, але немає `pnpm dedupe --check`). `.github/workflows/ci.yml` не має dedupe gate. Драйв з `pnpm install` (без `--frozen-lockfile`) може ввести duplicate deps непомітно.
- **Дія:** **Add** `pnpm dedupe --check` як CI-job у `format-lint-test-build` matrix. Спершу прогнати `pnpm dedupe` локально + закомітити changes — потім увімкнути gate.

### P2-2. ESLint plugin coverage

- **Файли:** `packages/eslint-plugin-sergeant-design/src/rules/*` — кастомні правила (ai-marker-syntax, module-accent-containment, no-arbitrary-hex-in-classname, focus-visible-not-focus, etc.). Більшість мають базові unit-тести у `__tests__/`, але `module-accent-containment` і `typography-scale-12px-floor` — тонкі тести.
- **Дія:** **Add** ще по 5–7 fixture-кейсів на кожне правило (BAD-cases з різними shape variations).

### P2-3. Visual regression — Argos baseline розширення

- **Файли:** `.github/workflows/visual-regression.yml` (PR #2216 додав baselines), `apps/web/visual.config.ts`. Поточно баthersuti для `/` (3 viewport) + `/finyk` + `/nutrition` — без `/fizruk`, `/routine`, `/hub-chat`, `/settings`. Storybook 54-stories має visual snapshots тільки на 18 з них.
- **Дія:** **Add** baseline для решти top-level routes + Storybook stories — 1 viewport (desktop) як floor.

### P2-4. Property-based tests для парсерів

- **Файли:** `packages/shared/src/utils/macros.ts` (kcal/protein/fat/carbs arithmetic), `packages/shared/src/utils/date.ts` (Kyiv timezone), `packages/shared/src/utils/speech.ts`. Plan-T28 з `docs/testing/2026-05-05-tests-pr-plan.md:189` пропонує `fast-check`.
- **Дія:** **Add** `fast-check` як devDep + 3 property-based suites (macros: identity, monotonicity, bounds; date: Kyiv-roundtrip; speech: idempotency).

### P2-5. `pnpm check` не паралелизує web/mobile/server

- **Файли:** `package.json:scripts.check` — стартує послідовно (`format:check && lint && typecheck && test && build`). Turborepo cache мінімізує redundant work, але між топ-level scripts паралелізації немає.
- **Дія:** **Change** `package.json:scripts.check` — після `format:check && lint` можна паралелити `typecheck` + `test` (різні workspace targets); експеримент з `--parallel` flag.

## Прогрес виконання

Цим PR закрито:

| Пункт                                       | Section | Що зроблено                                                                                                                                                                                                                                                                               | Landing                                |
| ------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| P0-1 — Empty `.down.sql` lint gate          | §P0-1   | `scripts/lint-migrations.mjs:79,284` — `isEmptyDownMigration()` + `hasNoRollbackEscapeHatch()`; fail на porожній або `-- TODO: write your DOWN` плейсхолдер; escape-hatch `-- NO_ROLLBACK: <reason>` працює аналогічно `ALLOW_DROP:`. Gate спрацьовує тільки на нові/змінені `.down.sql`. | цей PR (`scripts/lint-migrations.mjs`) |
| P0-1 — Tests for empty-down                 | §P0-1   | `scripts/__tests__/lint-migrations.test.mjs:125,328` — 11 нових тестів: 4 unit для `hasNoRollbackEscapeHatch`/`isEmptyDownMigration`, 5 integration через `run()` (placeholder, empty, escape-hatch pass, real SQL pass, pre-existing file noop), всі 55 тестів проходять.                | цей PR                                 |
| P0-1 — Plop template explicit instruction   | §P0-1   | `plop-templates/migration/down.sql.hbs` — додано explanation block з посиланням на `pnpm lint:migrations` та `NO_ROLLBACK:` escape-hatch.                                                                                                                                                 | цей PR                                 |
| P0-1 — Governance rule updated              | §P0-1   | `docs/governance/rules/04-sql-migrations-sequential-two-phase.md:43` — нова секція «Empty `.down.sql` is a lint error» з описом плейсхолдер-формату та `-- NO_ROLLBACK:` контракту.                                                                                                       | цей PR                                 |
| P1-1 — Contract fixtures for `/api/barcode` | §P1-1   | `packages/shared/src/contract-fixtures/barcode.ts` — 4 success (off / usda / upcitemdb partial / nullable-macros) + 3 error (notFound / badRequest / upstreamTimeout) fixtures; `assertBarcodeFixturesValid()` self-check.                                                                | цей PR                                 |
| P1-1 — Web consumer contract test           | §P1-1   | `apps/web/src/test/contract/barcode.contract.test.ts` — 13 тестів: schema-sanity, api-client round-trip × 7 (4 success + 3 error), schema-as-unknown × 2, drift detection × 3 (missing `name`, unknown `source`, empty error). Всі проходять.                                             | цей PR                                 |
| P1-1 — Contract barrel export               | §P1-1   | `packages/shared/src/contract-fixtures/index.ts` — додано `export * from "./barcode"`, fixtures доступні через `@sergeant/shared`.                                                                                                                                                        | цей PR                                 |

## Outstanding після цього PR — порядок наступних роастів

Залишається ~25 пунктів в `docs/testing/2026-05-05-tests-pr-plan.md`. Рекомендований розподіл на наступні прожарки:

- **Прожарка #6 follow-up — Server AI-tools (P1-2):** 7 tool-handler unit suites + producer-side barcode contract (~15 файлів).
- **Прожарка #6 follow-up — E2E expansion (P1-3 + P1-4):** Web smoke × 5 modules + Detox × 6 spec (~15 файлів).
- **Прожарка #6 follow-up — Mutation testing (P0-2):** Stryker weekly workflow + tier-1 floor (`utils/macros` + `utils/date`).
- **Прожарка #6 follow-up — Coverage drift (P1-6):** Web vitest threshold step-up до lines ≥ 50% + module test suites.

Усі P2 пункти можна закрити інкрементально через звичайний PR-флоу — вони не блокуючі.
