# PR-план Testing & DevX 2026-05 — зі зрізу 2026-05-13

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active

Цей документ — виконавчий PR-план для **outstanding-пунктів** прожарки [`docs/audits/2026-05-13-testing-devx-roast.md`](../audits/2026-05-13-testing-devx-roast.md). Картки покривають тільки те, що **не закрите** landing-PR-ом цієї прожарки (P0-1 + P1-1 для `/api/barcode` consumer-side уже змерджено в основний PR прожарки і виключені нижче).

## TL;DR

- **12 PR-карток** — 8 Testing (unit / integration / contract / E2E / VRT / mutation / coverage / property-based) + 4 DevX (scripts, plop, husky, CI feedback loop, pnpm tasks).
- **3 quick-wins (XS)** — script-alias-и, `CONTRIBUTING.md` оновлення, `docs/testing/README.md` cross-ref — кожен ≤ 50 LoC, можна злити паралельно з основним планом.
- **Дві стрічки sequencing** йдуть незалежно: Testing-стрічка (T-1 → T-8) і DevX-стрічка (D-1 → D-4). Між собою з'єднано лише T-6 (mutation) ↔ D-3 (parallel `pnpm check`) — `pnpm check --parallel` повинен з'явитись **до** того, як mutation-job додасть значущий час у CI matrix.
- **Базова реальність:** 5-шарова піраміда [ADR-0020](../adr/0020-testing-pyramid.md) уже зафіксована, Anthropic mock-harness ([#2012](https://github.com/Skords-01/Sergeant/pull/2012)) і `apps/web/src/test/contract/barcode.contract.test.ts` уже у дереві — більшість пунктів _додають coverage в існуючий стек_, не вводять нових тулів. Винятки: T-6 (Stryker — повертаємо після retirement у `docs/testing/README.md`), T-8 (`fast-check` як новий devDep), D-1 (нові precommit-timing utilities).

## Cross-refs

- **Прожарка-джерело:** [`docs/audits/2026-05-13-testing-devx-roast.md`](../audits/2026-05-13-testing-devx-roast.md) — P0/P1/P2 з file:line та `Add/Change/Remove` діями.
- **Архітектура тестового стека:** [`docs/adr/0020-testing-pyramid.md`](../adr/0020-testing-pyramid.md) — 5 шарів (unit / component / integration / a11y / smoke-E2E) + per-package coverage floors з 2pp буфером.
- **Multi-wave план попередньої прожарки:** [`docs/testing/2026-05-05-tests-pr-plan.md`](../testing/2026-05-05-tests-pr-plan.md) — Wave A–G, ~50 PR-ів (статус `merged` для PR-T01..T06, T08, T31, T32, T39; outstanding для T07, T09+, T13–T22, T23–T27, T29–T30, T33–T38).
- **Інвентар тестового стека:** [`docs/testing/2026-05-05-tests-review.md`](../testing/2026-05-05-tests-review.md) — per-app coverage % зрізу 2026-05-05.
- **Operations runbooks (для smoke-E2E залежностей):**
  - [`docs/runbooks/database-backup-restore.md`](../runbooks/database-backup-restore.md) — Postgres seed/restore для Detox-offline-sync (T-4) і Playwright smoke (T-3).
  - [`docs/runbooks/operations-runbook.md`](../runbooks/operations-runbook.md) — incident playbook, у який T-6 додає mutation-tier-1 порушення як warn-channel.
  - [`docs/runbooks/db-index-audit-template.md`](../runbooks/db-index-audit-template.md) — шаблон, який не змінюємо тут, але D-2 (`pnpm dedupe --check`) спирається на ту ж lockfile-discipline.
- **Agent entrypoint:** [`.agents/skills/sergeant-start-here/SKILL.md`](../../.agents/skills/sergeant-start-here/SKILL.md) — обов'язковий routing-skill. Кожна картка нижче вказує, який specialist skill вантажиться після нього (`sergeant-feature-delivery` для testing surfaces, `sergeant-deploy-and-observability` для CI gating, тощо).
- **CI gate matrix:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — 759 LoC, 12+ jobs (`check`, `coverage`, `a11y`, `smoke-e2e`, `commitlint`, `migration-lint`, `secret-scan`).

## Конвенції

- **Branch naming:** `devin/$(date +%s)-<short-name>` (AGENTS.md repo-конвенція).
- **Owner placeholder:** `@Skords-01` (solo maintainer; secondary = TBD per AGENTS.md). Якщо PR делегується — заміняй `Owner` на real GitHub handle і онови `docs/architecture/module-ownership.md`.
- **Priority levels (P0–P2):** успадковуємо від прожарки. P0 = blocker без обхідних шляхів; P1 = high-impact gap; P2 = nice-to-have, ризик ≤ medium.
- **Size buckets:** S = ≤ 100 LoC, ≤ ½ дня. M = 100–300 LoC, 1–2 дні. L = 300–600 LoC, 3–5 днів. XS — у секції quick-wins (≤ 50 LoC).
- **Acceptance — gate-style:** як CI job підтвердить «зроблено». Не «фіча працює», а «job X зелений / коли job X фейлить — діагностика з step summary».
- **Dependencies:** використовуй `T-N` / `D-N` ID. Cross-stream залежності (Testing ↔ DevX) явно позначені.
- **Hard rules (з [AGENTS.md](../../AGENTS.md)):** не пропускати Husky (Rule #7), не force-push у `main` (Rule #6), Conventional Commits зі scope-енумом (Rule #5), оновлення docs/governance у тому ж PR (Rule #15).

## Sequencing

```text
Тиждень 1 (квік-вінc + unblock)
├── QW-1, QW-2, QW-3  ── паралельно, ≤ 1 день кожен
└── D-1 (precommit timing) ─ unblock pre-PR DevX-метрик

Тиждень 2–3 (Testing — server side + E2E)
├── T-1 Server AI-tool unit suites (P1-2)         deps: PR-T08 ✓
├── T-2 Contract fixtures expansion (P1-1+)       deps: PR-T08 ✓ (барсель-fixture уже landed)
├── T-3 Web smoke E2E × 5 (P1-3)                  deps: T-2 (msw фікстури nutrition/chat)
└── D-2 pnpm dedupe --check gate (P2-1)           deps: ─ (запустити `pnpm dedupe` локально перш ніж включати CI gate)

Тиждень 3–4 (Testing — mobile + visual)
├── T-4 Detox suite × 6 (P1-4)                    deps: ─
├── T-5 VRT Argos baseline expansion (P2-3)       deps: ─
└── D-3 Parallel `pnpm check` (P2-5)              deps: ─, але МАЄ landed до T-6

Тиждень 4–5 (Testing — gates + coverage)
├── T-6 Mutation testing Stryker tier-1 (P0-2)    deps: D-3 (інакше CI matrix вибухне)
├── T-7 Web coverage drift module __tests__ (P1-6) deps: ─
├── T-8 Property-based fast-check tests (P2-4)    deps: T-7 (стабілізовані ratio після rebaseline)
└── D-4 ESLint plugin fixture coverage (P2-2)     deps: ─
```

Стрічки T-_/D-_ не блокують одна одну — можна паралелити; стрілка `→` означає тільки логічну послідовність.

---

## Quick-wins — XS PR-и

> Кожен ≤ 50 LoC, мерджиться як окремий PR (`docs:` / `chore:` scope), CI має пройти за ≤ 5 хвилин. Можна злити паралельно з основним планом — нічого не блокує.

### QW-1 · `pnpm dedupe:check` script alias

- **P:** P2 · **Size:** XS · **Owner:** `@Skords-01`
- **Файли:** `package.json` (одна нова scripts-entry).
- **Scope:** додати script alias `"dedupe:check": "pnpm dedupe --check"` у root `package.json`. **Не вмикає** CI gate — це робить T-2 (D-2). Просто дає контрибуторам коротку команду до того, як D-2 приземлиться.
- **Acceptance:** `pnpm dedupe:check` локально повертає exit 0 або список дублікатів. `pnpm lint:pnpm-overrides` лишається зеленим (alias не торкає overrides).
- **Deps:** — (не залежить ні від чого).

### QW-2 · `CONTRIBUTING.md` — додати посилання на новий plan + sergeant-start-here

- **P:** P2 · **Size:** XS · **Owner:** `@Skords-01`
- **Файли:** `CONTRIBUTING.md` (1–2 рядки в розділ «Verification за типом зміни» → нова bullet «testing/devx changes»).
- **Scope:** додати рядок «Для testing/devx surface — звіряйся з `docs/planning/pr-plan-testing-devx-2026-05.md` і починай із `.agents/skills/sergeant-start-here/SKILL.md`» (точний link-path формується відносно `CONTRIBUTING.md` як `./docs/planning/pr-plan-testing-devx-2026-05.md`).
- **Acceptance:** `pnpm docs:check-links` зелений (нове внутрішнє посилання resolve-иться).
- **Deps:** цей PR (план має бути merged перед QW-2).

### QW-3 · `docs/testing/README.md` cross-ref на цей план

- **P:** P2 · **Size:** XS · **Owner:** `@Skords-01`
- **Файли:** `docs/testing/README.md` (нова bullet у секції «Cross-links»).
- **Scope:** додати посилання на `docs/planning/pr-plan-testing-devx-2026-05.md` після згадки про initiative 0009. Заодно — оновити `Last validated` header (через `scripts/docs/bump-last-validated.mjs` під час pre-commit).
- **Acceptance:** `pnpm docs:check-links` зелений; `pnpm lint:tech-debt-freshness` не падає.
- **Deps:** цей PR.

---

## Testing PRs

### T-1 · Server AI-tool unit suites (nutrition × 7 + openclaw + weekly-digest)

- **Items covered:** P1-2 з прожарки (`apps/server/src/modules/nutrition/{barcode-search,food-search,parse-pantry,log-meal,recall-meals,update-meal,delete-meal}.ts` + `apps/server/src/modules/openclaw/tools/*` + `apps/server/src/modules/digest/weekly-digest.ts` — coverage 0–15%). Відповідає Wave B (T09–T12) у `docs/testing/2026-05-05-tests-pr-plan.md`.
- **Priority:** P1 · **Size:** L (~350 LoC tests + ~10 fixture файлів) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-server-api`.
- **Scope:**
  - 7 нових файлів `apps/server/src/modules/nutrition/__tests__/<tool>.test.ts` — для кожного tool-handler-а: 1 happy-path + 1 input-validation reject + 1 schema-mismatch reject (3 кейси × 7 хендлерів = 21 unit).
  - 1 файл `apps/server/src/modules/openclaw/tools/__tests__/index.test.ts` — guard-rails (allowed-tool list, missing-tool fallback, OpenClaw PAT redaction — Hard Rule #20).
  - 1 файл `apps/server/src/modules/digest/__tests__/weekly-digest.test.ts` — pure-aggregation тести (без real Postgres; integration вже існує).
  - Використовуємо існуючий `apps/server/src/test-utils/anthropic-mock.ts` (PR-T08 #2012).
- **Acceptance:**
  - `pnpm --filter @sergeant/server test` зелений; `apps/server` coverage lines зростає на ≥ 5pp (з ~37% baseline).
  - Step summary у `coverage` CI job показує `nutrition/*` ≥ 60% lines на нових файлах.
  - Жоден тест не звертається до real Anthropic / real Postgres (CI job стабільний у offline-runner-і).
- **Depends on:** PR-T08 ([#2012](https://github.com/Skords-01/Sergeant/pull/2012)) — merged.
- **Risks:** schema-mismatch reject-кейси потребують точної форми Zod error → треба тримати `error-shape` константою в test-utils, інакше дрейф ламає всі 7 файлів одночасно.

### T-2 · Contract fixtures expansion (food-search, parse-pantry, chat, sync/v2, finyk/cashflow, nutrition/log)

- **Items covered:** P1-1 follow-up з прожарки (`packages/shared/src/contract-fixtures/` має тільки `me.ts` + `barcode.ts` після основного PR; решта endpoint-ів не покриті). Wave F (T29–T30) у `docs/testing/2026-05-05-tests-pr-plan.md`.
- **Priority:** P1 · **Size:** L (~500 LoC; розбити на 2–3 sub-PR-и якщо PR-size gate сварить) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-server-api`.
- **Scope:**
  - 6 нових файлів у `packages/shared/src/contract-fixtures/`: `food-search.ts`, `parse-pantry.ts`, `chat.ts` (streaming-special-case з SSE chunk-фікстурами), `sync-v2.ts`, `finyk-cashflow.ts`, `nutrition-log.ts`.
  - 6 нових web-consumer тестів `apps/web/src/test/contract/<endpoint>.contract.test.ts` — за патерном існуючого `barcode.contract.test.ts` (schema-sanity + api-client round-trip × N + drift detection ≥ 3 кейси).
  - Update `packages/shared/src/contract-fixtures/index.ts` — barrel exports.
  - Update `packages/shared/src/contract-fixtures/README.md` — додати нові endpoints у таблицю + повторити «one fixture = golden shape» дисципліну.
- **Acceptance:**
  - `pnpm --filter @sergeant/shared test` + `pnpm --filter @sergeant/web test` зелені; нові 6 файлів повністю крутяться у `check` job.
  - Hard Rule #3 (`docs/governance/rules/03-api-contract-server-client-test.md`) cross-link перевірений `pnpm lint:governance-sync --strict`.
  - Producer-side companion-и винесені в окремий sub-PR (потребує `supertest` + `createApp()` stab — окремий ефорт).
- **Depends on:** PR-T08 (mock-harness ✓), цей PR (план doc) для cross-ref.
- **Risks:** `chat.ts` streaming SSE — нетривіальний contract (chunked Transfer-Encoding). Якщо складність вибухне — винеси streaming-fixture у окремий sub-PR.

### T-3 · Web smoke E2E — 5 module spec-ів (finyk, fizruk, nutrition, routine, hub-chat)

- **Items covered:** P1-3 з прожарки (`apps/web/e2e/{auth,nav-offline,bottom-nav,dash}.spec.ts` — лише 4 спеки). Wave C (T13–T17) у tests-pr-plan.
- **Priority:** P1 · **Size:** L (~700 LoC; розбити на 5 окремих PR-ів по 1 spec) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-feature-delivery` + `sergeant-deploy-and-observability` (для smoke-config tuning).
- **Scope:** 5 нових `apps/web/tests/smoke/<module>-smoke.spec.ts`:
  - `finyk-smoke.spec.ts` — manual transaction → видно у списку → balance оновився.
  - `fizruk-smoke.spec.ts` — start training → log set → метрика змінилася.
  - `nutrition-smoke.spec.ts` — barcode-сценарій → AI-підказка → запис у БД (мокаємо OFF + Anthropic через MSW-handlers з T-2).
  - `routine-smoke.spec.ts` — check-in → стрік++ → календар відмалював сьогодні.
  - `hub-chat-smoke.spec.ts` — надіслати команду коучу → tool execution → side-effect на іншому модулі.
  - Додати `data-testid` у 2–3 компонентах кожного модуля; стабільний `seedLocalStorage` через існуючий `apps/web/tests/smoke/utils.ts`.
- **Acceptance:**
  - CI job `smoke-e2e` зелений з 9 spec-файлами (4 existing + 5 нових); час ≤ 20 хв на runner-і.
  - Усі нові тести проходять у Playwright smoke-config (`apps/web/playwright.smoke.config.ts`), не у звичайному e2e config.
  - Кожен spec має тег `@critical` (для `critical-flow` lane).
- **Depends on:** T-2 (msw nutrition + chat handlers); опційно — кожен spec можна landed незалежно.
- **Risks:** Better Auth session seed може бути нестабільним між iOS Safari та Chromium у CI — використовуй спільний `apps/web/tests/smoke/auth.ts` helper.

### T-4 · Mobile Detox suite — 6 нових spec-ів (auth, nutrition × 2, fizruk, deep-link, offline-sync)

- **Items covered:** P1-4 з прожарки (Detox: 4 спеки → 10). Wave D (T18–T22) у tests-pr-plan.
- **Priority:** P1 · **Size:** L (~900 LoC; landed по 1 spec за PR) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-mobile-expo`.
- **Scope:** 6 нових `apps/mobile/e2e/`:
  - `auth-login.e2e.ts` — sign-in / sign-up / logout (Better Auth native flow).
  - `nutrition-add-meal.e2e.ts` + `nutrition-barcode.e2e.ts` — ручне додавання + barcode-сценарій (мокаємо камеру через Detox URL-param).
  - `fizruk-log-set.e2e.ts` — start workout → log set → save.
  - `deep-link.e2e.ts` — `sergeant://` link → правильний screen.
  - `offline-sync.e2e.ts` — offline-actions → reconcile через `apps/server/src/modules/sync/v2`.
- **Acceptance:**
  - `.github/workflows/detox-android.yml` і `.github/workflows/detox-ios.yml` зелені на CI з усіма 10 specs (4 existing + 6 нових).
  - Flake budget ≤ 3% per spec (трекається через [`docs/runbooks/operations-runbook.md`](../runbooks/operations-runbook.md) — secondary вже з мобільним runbook-ом).
  - `offline-sync.e2e.ts` крутиться **останнім** у sequence — найскладніший і має highest flake risk.
- **Depends on:** —. PR #2215 (heap-OOM fix у Jest 30) уже merged, тому infra стабільна.
- **Risks:** Detox iteration-cycle високої тертя (run-on-simulator + flake). Перші 3 PR (auth, fizruk, deep-link) дають baseline; nutrition × 2 і offline-sync — після стабілізації.

### T-5 · VRT — Argos baseline expansion (fizruk, routine, hub-chat, settings + Storybook)

- **Items covered:** P2-3 з прожарки (`.github/workflows/visual-regression.yml` — поточно baseline для `/` + `/finyk` + `/nutrition`; Storybook 54 stories, snapshots на 18).
- **Priority:** P2 · **Size:** M (~200 LoC + baseline зображення) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-feature-delivery` (web UI surface).
- **Scope:**
  - Розширити `apps/web/playwright.visual.config.ts` на `/fizruk`, `/routine`, `/hub-chat`, `/settings` — 1 viewport (desktop 1440×900) як floor.
  - Storybook: додати visual-snapshot на 36 stories, що залишилися без baseline (`apps/web/.storybook/test-runner.ts` + Argos).
  - Update `.github/workflows/visual-regression.yml` — додати нові route-и у matrix.
- **Acceptance:**
  - Argos dashboard показує baseline для усіх top-level routes (8 рoutes × 1 viewport мінімум).
  - CI job `visual-regression` зелений на first run (baseline auto-accept) і фейлить при перших pixel-drift > 1%.
  - Storybook coverage: 54/54 stories з visual snapshot.
- **Depends on:** —. PR #2216 заклав infrastructure.
- **Risks:** baseline drift після brand-token bump-у — `pnpm lint:governance-sync` має ловити.

### T-6 · Mutation testing — Stryker config + weekly workflow + tier-1 floor

- **Items covered:** P0-2 з прожарки. Wave E (T23–T27) у tests-pr-plan. ⚠️ **NB:** `docs/testing/README.md` фіксує, що stryker meta-doc був прибраний разом з cloudSync v1 retirement — цей PR **повертає** mutation testing з redefined scope (utils-only, не cloudSync).
- **Priority:** P0 · **Size:** M (~150 LoC config + workflow) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-deploy-and-observability` (CI surface).
- **Scope:**
  - Новий `packages/shared/stryker.utils.conf.json` — scope `src/utils/macros.ts` + `src/utils/date.ts` (tier-1 floor: 70% mutation score, break threshold).
  - Новий `.github/workflows/mutation-testing.yml` — weekly cron + manual `workflow_dispatch`. Reporters: `json,html` як artifact (retain 30 днів).
  - Update `docs/testing/README.md` — повернути «Mutation» секцію з redefined scope (utils-only, не cloudSync); update [`docs/adr/0020-testing-pyramid.md`](../adr/0020-testing-pyramid.md) — додати mutation як **6-й шар** (опційний, weekly-only, не PR-blocker для main check).
  - PR-required tier: workflow коментує PR, якщо mutation score падає; **не** блокує merge до того, як score стабілізується ≥ 80% на main за 2 weekly run-и.
- **Acceptance:**
  - `.github/workflows/mutation-testing.yml` зелений на manual `workflow_dispatch` run (perfect-circle test); artifact `mutation-report.json` + `mutation-report.html` доступний для download.
  - Mutation score baseline зафіксований у `docs/testing/README.md` як `Last baseline: YYYY-MM-DD: utils-macros=82% utils-date=78%`.
  - `pnpm hard-rules:check` зелений (ADR-0020 update пройшов governance gate).
- **Depends on:** **D-3** (parallel `pnpm check`) — інакше weekly Stryker run-time помножується на 4 (web/server/mobile/packages), стає негайно неприйнятним. D-3 знижує час до ~60% baseline → залишається budget на mutation-job.
- **Risks:** Stryker @ Vitest 4 — раніше repo мав `@stryker-mutator/vitest-runner@9.6.1` у lock-файлі (transitive devDep), потрібно `pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner` як explicit devDeps у `packages/shared/package.json` і верифікувати, що vitest 4.x mutator-runner стабільний.

### T-7 · Web coverage drift — module **tests** для finyk / fizruk / nutrition

- **Items covered:** P1-6 з прожарки (`apps/web/vitest.config.js:38` — lines 38 / branches 31 / functions 28 / statements 37, ниже пре-крашу 60+%).
- **Priority:** P1 · **Size:** L (~600 LoC у 9 файлах) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-feature-delivery` + `sergeant-web-ui` для RTL компонент-тестів.
- **Scope:** для кожного з 3 модулів (`apps/web/src/finyk/`, `apps/web/src/fizruk/`, `apps/web/src/nutrition/`) додати мінімум:
  - 1 hook test (`use<Something>.test.ts`) — за зразком існуючих у `apps/web/src/modules/*/hooks/`.
  - 1 selector test — для RQ keys-фабрики (`finykKeys`, `fizrukKeys`, `nutritionKeys`).
  - 1 wallet / scenario test — інтеграційний (component + hook + MSW handler).
  - **9 файлів** разом × ~70 LoC.
- **Acceptance:**
  - `apps/web/vitest.config.js` поточні thresholds лишаються; CI job `coverage` показує lines зріс з 39.29% → ≥ 45% (значущий step).
  - `coverage-baseline` log entry у `apps/web/vitest.config.js` приймає нову baseline-дату й значення (формат уже встановлений у файлі).
  - Підняти floor → окремий follow-up PR (як описано у ADR-0020 § «raise per sprint»).
- **Depends on:** —. Можна landed незалежно від T-1..T-5.
- **Risks:** flaky MSW handlers (`apps/web/src/test/msw/`) — використовуй `server.resetHandlers()` у `beforeEach`, інакше handler leakage між file-suite-ами.

### T-8 · Property-based tests (fast-check) — macros / date / speech

- **Items covered:** P2-4 з прожарки + T-35 у tests-pr-plan.
- **Priority:** P2 · **Size:** M (~250 LoC + 1 dep) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-server-api` (shared utils surface).
- **Scope:**
  - `pnpm add -D fast-check --filter @sergeant/shared` (single devDep, well-maintained, no transitive bloat).
  - 3 нові suite-и `.property.test.ts` поряд з юніт-тестами:
    - `packages/shared/src/utils/macros.property.test.ts` — identity (`+0 = no-op`), monotonicity (`a + b ≥ a` для positive), bounds (`kcal ∈ [0, 9999]` per meal).
    - `packages/shared/src/utils/date.property.test.ts` — Kyiv-roundtrip (`toKyivDayKey(fromKyivDayKey(x)) = x`), DST-transition handling.
    - `packages/shared/src/utils/speech.property.test.ts` — idempotency (`normalize(normalize(x)) = normalize(x)`).
  - Update `docs/testing/README.md` — додати «Property-based» layer у table.
- **Acceptance:**
  - `pnpm --filter @sergeant/shared test` зелений з 3 новими файлами.
  - Кожен suite запускається з `numRuns: 1000` за замовчуванням, `numRuns: 100` для CI (через ENV var `FAST_CHECK_NUM_RUNS`, fallback читається з `apps/server/src/test-utils/fast-check-config.ts`).
- **Depends on:** T-7 (фіксує coverage baseline до того, як property-tests почнуть «брати» random branches і ламати floor unstable-ly).
- **Risks:** property-test seed instability на CI — закріпи seed у `fc.configureGlobal({ seed: 42 })` під test setup, інакше weekly «random failure» з'являться без коду change-у.

---

## DevX PRs

### D-1 · Pre-commit timing instrumentation (`scripts/timing-precommit.mjs`)

- **Items covered:** P1-5 з прожарки.
- **Priority:** P1 · **Size:** M (~150 LoC + 1 hook update) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-deploy-and-observability`.
- **Scope:**
  - `scripts/timing-precommit.mjs` — wrapper, що замірює час кожного `lint-staged` stage (ESLint --fix + Prettier per file; `staged-typecheck.mjs` як один батч; `bump-last-validated.mjs` per `.md`); пише структурний JSON у `.husky/.last-precommit-timing.json` (gitignored).
  - `.gitignore` — додати `.husky/.last-precommit-timing.json`.
  - `package.json` — новий script `"precommit:bench": "node scripts/timing-precommit.mjs --mock-staging 20"` — імітує pre-commit на 20 mock-файлах (без реального git).
  - Update `.husky/pre-commit` — підмінити `pnpm exec lint-staged --concurrent false` на `node scripts/timing-precommit.mjs lint-staged --concurrent false`. Wrapper викликає той самий `lint-staged` під капотом, але навколо нього міряє час; виключення під `--no-timing` flag (CI-only).
  - **No public commit** of `.last-precommit-timing.json` — обговорено privacy у audit (P1-5).
- **Acceptance:**
  - Перший локальний commit після merge — створюється `.husky/.last-precommit-timing.json` з валідним JSON (`{ "stages": [...], "total_ms": 12345 }`).
  - `pnpm precommit:bench` повертає звіт у stdout (без git side-effects).
  - Hard Rule #7 (Husky не пропускати) не порушено — wrapper викликає lint-staged без `--no-verify`.
- **Depends on:** —. Можна landed першим у DevX-стрічці.
- **Risks:** Husky 9 + lint-staged 16 API drift — `scripts/staged-typecheck.mjs` уже встановлений патерн, wrapper-script тримай у тому ж стилі.

### D-2 · `pnpm dedupe --check` CI gate

- **Items covered:** P2-1 з прожарки.
- **Priority:** P2 · **Size:** S (~50 LoC у CI matrix) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-deploy-and-observability`.
- **Scope:**
  - **Step 1 (передумова, в окремому commit/PR):** `pnpm dedupe` локально + закомітити resulting `pnpm-lock.yaml` diff.
  - **Step 2 (цей PR):** додати `pnpm dedupe --check` як новий step у `.github/workflows/ci.yml` → job `format-lint-test-build` (поруч з `pnpm lint:pnpm-overrides`).
  - Update `CONTRIBUTING.md` — додати `pnpm dedupe:check` у Verification matrix.
- **Acceptance:**
  - CI job `format-lint-test-build` падає, якщо new commit ввів `pnpm install` без `--frozen-lockfile` і протягнув duplicate.
  - `pnpm install --frozen-lockfile` на main лишається зеленим (no drift після dedupe baseline-bump).
- **Depends on:** QW-1 (`pnpm dedupe:check` script alias landed earlier; optional convenience).
- **Risks:** `pnpm dedupe` міг змінити resolution для ≥ 1 transitive deps зі breaking-API. Перед мерджем — повний прогін `pnpm check` локально.

### D-3 · Parallel `pnpm check` (typecheck + test concurrent)

- **Items covered:** P2-5 з прожарки.
- **Priority:** P2 · **Size:** S (~30 LoC у `package.json` + турбо conf) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-deploy-and-observability`.
- **Scope:**
  - Розбити `package.json` → `scripts.check` на 2 phase-и:
    - Phase 1 (serial — лінтер блокує тести): `pnpm format:check && pnpm lint`.
    - Phase 2 (parallel — незалежні): `pnpm -r --parallel run typecheck && pnpm -r --parallel run test`.
  - Не змінювати `turbo.json` — Turborepo сам деleguє per-workspace concurrency через `--parallel`.
- **Acceptance:**
  - `pnpm check` локально завершується за **≤ 60%** baseline-часу (виміри: до 2:30 на M1, після ~1:30).
  - CI job `format-lint-test-build` показує schar-час `Total: X` step summary; новий час фіксується у `.github/workflows/ci.yml` як коментар-baseline.
- **Depends on:** —. **Critical для T-6** — інакше mutation-job ламає CI budget.
- **Risks:** test parallelism може спричинити resource contention (Testcontainers конфлікт через Postgres port). Використовуй `vitest --no-isolate` тільки в server-test-config, не глобально.

### D-4 · ESLint plugin fixture coverage expansion

- **Items covered:** P2-2 з прожарки (`packages/eslint-plugin-sergeant-design/src/rules/*` — `module-accent-containment` і `typography-scale-12px-floor` тонкі тести).
- **Priority:** P2 · **Size:** M (~200 LoC fixtures) · **Owner:** `@Skords-01`
- **Skill:** `sergeant-feature-delivery` (eslint-plugin surface).
- **Scope:**
  - `packages/eslint-plugin-sergeant-design/__tests__/module-accent-containment.test.mjs` — додати 7 нових BAD-кейсів (різні shape: `className`, `clsx` call, `cn` call, template literal, `cva` variant, theme-utility wrapper, conditional ternary).
  - `packages/eslint-plugin-sergeant-design/__tests__/typography-scale-12px-floor.test.mjs` — додати 5 BAD-кейсів (`text-[10px]` arbitrary, `style={{ fontSize: 10 }}`, Tailwind preset edge, custom-utility violation, inline mixed-units).
  - Розглянути winner кейсів через `node --test` (поточний runner для plugin).
- **Acceptance:**
  - `pnpm lint:plugins` зелений з ≥ 12 нових fixture cases.
  - Coverage `packages/eslint-plugin-sergeant-design` lines зростає на ≥ 5pp.
- **Depends on:** —.
- **Risks:** plugin rule API change у ESLint 9 — `RuleContext.report` shape стабільний, але fixture format потенційно treba синхронізувати з `@typescript-eslint/utils` версією у lock-файлі.

---

## Outstanding після цього плану

Що **залишається** після виконання усіх 12 PR-карток (для наступних прожарок):

- **`/api/barcode` producer-side contract test** — потребує тісної інтеграції з `createApp()` stab у server-test-utils (~5–10 файлів). Винесено окремо, бо торкається server bootstrap, не api-client.
- **Module-level web coverage до 60+% (pre-crash baseline)** — T-7 дає ≥ 45%, потім + 3–5 PR-ів на routine / openclaw-console / hub-chat / hub-dashboard / settings.
- **Mutation testing tier-2 / tier-3** — server normalizers (`apps/server/src/lib/normalizers/*`), finyk service (`apps/server/src/modules/finyk/finyk.service.ts`), insights aggregations. Через T-6 weekly artifact-ом видно, які файли страждають mutation score < 70%.
- **`sync/v2` integration test follow-up (T-T07 у tests-pr-plan)** — закрити останні 2–3 RLS-сценарії, що лишилися no-DB-юнітами після PR-T06.
- **`packages/api-client` boundary tests (T-T33 у tests-pr-plan)** — retry / timeout / 401 refresh / 5xx backoff — окремий PR.
- **Axe deep-screens (T-T36 у tests-pr-plan)** — форми (add transaction, log workout, meal entry), modals/sheets, settings — окремий PR.
- **k6 / Artillery nightly perf (T-T37 у tests-pr-plan)** — chat single-turn + tool_use; sync/v2 concurrent — окремий PR після того, як T-2 закріпить контракт chat.

Усі ці пункти можна закривати інкрементально через звичайний PR-флоу — вони не блокуючі для основної прожарки #6.
