# Dev stack roadmap — інструменти і поради по всьому ЖЦ розробки

> **Last validated:** 2026-05-05 by Devin. **Next review:** 2026-08-03.
> **Status:** Active

**Статус:** весь топ-15 закритий + більшість Тиждень 1–4 / Місяць 2 беклогу теж залендено. Створено 2026-04-25. Останнє оновлення 2026-05-05: понад топ-15 додатково закрилися Storybook (44 stories у `apps/web`), Stryker mutation testing (`stryker.cloudSync.conf.json` — згодом retired 2026-05-06 разом із v1 engine drop, [#052b](https://github.com/Skords-01/Sergeant/pull/2046)), Argos visual regression (`@argos-ci/playwright`), Drizzle ORM POC (повноцінний `packages/db-schema` з PG + SQLite адаптерами), Helmet + CSP report-only middleware (`apps/server/src/http/security.ts`), gitleaks secret-scan + CodeQL + Trivy container-scan + release-SBOM, mobile Sentry SDK через `@sentry/react-native` (DSN-gated). Sentry mobile DSN provisioning у Expo EAS Secrets — все ще TODO, решта пунктів TL;DR — закриті. **Архів історичних сесій (2026-04-25 / 2026-04-25 evening):** [`archive/dev-stack-roadmap.md`](./archive/dev-stack-roadmap.md).

**Скоуп:** інструменти, інтеграції, практики для покращення розробки, тестування, CI/CD, проду, безпеки, performance і команди. Specifically для стеку Sergeant: pnpm + Turborepo + Vite/React + Express + Postgres + Railway + Vercel + Expo.
**Принцип:** не «впровадити все одразу», а **поетапно** — від найдешевших і найважливіших до інвестиційних. Кожен пункт — самостійний tool / practice з ціною, effort-ом, ROI і dep-ами.

---

## TL;DR — топ-15 з найвищим ROI для Sergeant

Якщо є тиждень — зроби лише це:

| #   | Інструмент / практика                             | Effort    | Cost             | ROI    | Статус                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------- | --------- | ---------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Sentry** для error tracking                     | 2 год     | $26/міс          | 🔥🔥🔥 | ✅ done — `SENTRY_DSN` (Railway server) + `VITE_SENTRY_DSN` (Vercel web) **активні**; `EXPO_PUBLIC_SENTRY_DSN` (Expo EAS mobile) — pending provisioning                                                                                                                                                                                              |
| 2   | **Knip + depcheck** — clean dead code             | 1 год     | $0               | 🔥🔥   | ✅ done [#716](https://github.com/Skords-01/Sergeant/pull/716)                                                                                                                                                                                                                                                                                       |
| 3a  | **Strict TS — server**                            | —         | $0               | 🔥🔥🔥 | ✅ done (`apps/server/tsconfig.json` має `strict: true`)                                                                                                                                                                                                                                                                                             |
| 3b  | **Strict TS — web (incremental)**                 | 1-2 тижні | $0               | 🔥🔥🔥 | ✅ done (Phases 1–4 ✅; PR1 [#1388](https://github.com/Skords-01/Sergeant/pull/1388) + PR2 [#1391](https://github.com/Skords-01/Sergeant/pull/1391) + PR3 [#1402](https://github.com/Skords-01/Sergeant/pull/1402) + PR4 final flip — baseline `419 → 0`, `strict: true` + без `allowJs` у `apps/web/tsconfig.json`; див. tech-debt/frontend.md §11) |
| 4   | **Testcontainers** для server tests               | 4 год     | $0               | 🔥🔥🔥 | ✅ done [#728](https://github.com/Skords-01/Sergeant/pull/728)                                                                                                                                                                                                                                                                                       |
| 5   | **Vercel Pro plan** (рятує preview deploy)        | 5 хв      | $20/міс          | 🔥🔥   | ✅ done (team `skords-01s-projects` на Pro plan; підтверджено через Vercel API: `billing.plan: pro`)                                                                                                                                                                                                                                                 |
| 6   | **Turbo remote cache**                            | 1 год     | $0 (Vercel free) | 🔥🔥   | ✅ done (CI wiring merged; needs secrets — see §1.1)                                                                                                                                                                                                                                                                                                 |
| 7   | **Renovate** замість Dependabot                   | 1 год     | $0               | 🔥🔥   | ✅ done [#721](https://github.com/Skords-01/Sergeant/pull/721)                                                                                                                                                                                                                                                                                       |
| 8   | **AGENTS.md** (з #711)                            | 1 год     | $0               | 🔥🔥🔥 | ✅ done [#714](https://github.com/Skords-01/Sergeant/pull/714)                                                                                                                                                                                                                                                                                       |
| 9   | **MSW** для frontend tests                        | 4 год     | $0               | 🔥     | ✅ done [#729](https://github.com/Skords-01/Sergeant/pull/729)                                                                                                                                                                                                                                                                                       |
| 10  | **Snapshot tests на server serializers** (з #711) | 4 год     | $0               | 🔥🔥🔥 | ✅ done [#718](https://github.com/Skords-01/Sergeant/pull/718)                                                                                                                                                                                                                                                                                       |
| 11  | **Pino structured logging**                       | 4 год     | $0               | 🔥🔥   | ✅ done [#738](https://github.com/Skords-01/Sergeant/pull/738)                                                                                                                                                                                                                                                                                       |
| 12  | **Activate Playwright E2E на PR**                 | 2 год     | $0               | 🔥🔥   | ✅ done [#717](https://github.com/Skords-01/Sergeant/pull/717)                                                                                                                                                                                                                                                                                       |
| 13  | **PostHog** для product analytics                 | 4 год     | $0 (free tier)   | 🔥     | ✅ done (web: `apps/web/src/core/observability/posthog.ts`; server: `apps/server/src/lib/posthog.ts`; gated на `VITE_POSTHOG_KEY` / `POSTHOG_KEY`)                                                                                                                                                                                                   |
| 14  | **size-limit** + bundle-analyzer                  | 2 год     | $0               | 🔥     | ✅ done [#740](https://github.com/Skords-01/Sergeant/pull/740)                                                                                                                                                                                                                                                                                       |
| 15  | **CONTRIBUTING.md + 5-min quickstart**            | 2 год     | $0               | 🔥🔥   | ✅ done [#726](https://github.com/Skords-01/Sergeant/pull/726)                                                                                                                                                                                                                                                                                       |

**Сумарно:** ~3-5 робочих днів + ~$50/міс. Це 80% wins за 20% effort-у.

**Прогрес (2026-05-05):** **15 / 15 закрито** (з урахуванням розщеплення #3 на 3a/3b — обидва closed). Закриті: #1 Sentry (інтеграція + DSN виставлено на Railway server + Vercel web; mobile SDK через `@sentry/react-native` теж залендено, але `EXPO_PUBLIC_SENTRY_DSN` у Expo EAS Secrets — pending provisioning), #2 Knip+depcheck, #3a Strict TS server, **#3b Strict TS web** (Phase 4 final flip — `apps/web/tsconfig.json` має `strict: true` + без `allowJs`; усі 4 PR закриті: #1388, #1391, #1402, PR4; baseline `419 → 0` помилок, 100 % скоупу), #4 Testcontainers (#728), **#5 Vercel Pro plan** (team `skords-01s-projects` на Pro — підтверджено через Vercel API: `billing.plan: pro`), #6 Turbo remote cache, #7 Renovate, #8 AGENTS.md, #9 MSW (#729), #10 Snapshot tests, #11 Pino logging (#738), #12 Playwright E2E, #13 PostHog (web + server + mobile SDK, env-gated), #14 size-limit + bundle-analyzer (#740), #15 CONTRIBUTING.md (#726). Роадмап топ-15 — повністю закритий.

**Поза топ-15 (Місяць 2 + Тиждень 4 беклог)** — ✅ done і вже на main:

- **Storybook** для shared компонентів — 44 `*.stories.tsx` у `apps/web`, `pnpm --filter @sergeant/web storybook`, окремий `storybook-deploy.yml` workflow.
- **Stryker mutation testing** — _retired 2026-05-06 разом із cloudSync v1 engine drop ([PR #052b](https://github.com/Skords-01/Sergeant/pull/2046))._ Конфіги `stryker.cloudSync.conf.json` / `stryker.cloudSyncQueue.conf.json` цілили на `apps/web/src/core/cloudSync/{conflict,queue}/` — джерельники зникли разом із v1 engine, тож `mutation-testing.yml` workflow + обидва конфіги знесено. `@stryker-mutator/{core,vitest-runner}` лишається в `apps/web/devDependencies`, щоб дешево переавтодожити mutation testing на нову critical-logic поверхню (план — `packages/finyk-domain` після Stage 7 закриття, див. `docs/testing/2026-05-05-tests-pr-plan.md`).
- **Argos visual regression** — `@argos-ci/playwright` у `apps/web/devDependencies` + `visual-regression.yml` workflow.
- **Drizzle ORM POC** — повноцінний `packages/db-schema` (Drizzle PG + SQLite) з drizzle-kit, використовується у `apps/server` + `apps/web`. POC закрив §2.2 і Місяць 2 пункт.
- **Helmet + CSP** — `apps/server/src/http/security.ts` з helmet middleware, HSTS, CSP report-only (M1 hardening card).
- **Detox mobile E2E** — `detox-android.yml` + `detox-ios.yml` workflows.
- **Container security** — `container-scan.yml` (Trivy), `release-sbom.yml` (CycloneDX), `codeql.yml` (CodeQL).
- **Secret scanning** — gitleaks job у `ci.yml` (`Secret scan (gitleaks)`).
- **prom-client metrics** — `apps/server/src/obs/metrics.ts` ($GRAFANA*CLOUD_PROMETHEUS*\*` env-gated remote_write).
- **CI hardening** — `concurrency: cancel-in-progress`, `pnpm` cache, SHA-pinned actions, actionlint, pipeline-duration p95 trend.
- **OpenAPI codegen** — `pnpm api:generate-openapi` + `api:check-openapi-types` (zod-to-openapi-style flow без переходу на tRPC).

Залишковий backlog Q3 2026 — нижче в розділі «Next-up backlog» + у [`stack-pulse-2026-05/`](../initiatives/stack-pulse-2026-05/README.md) (16 PR-ів).

---

## 1. Розробка (DX, день-у-день)

### 1.1. Локальне dev-середовище

| Tool                       | What                               | Cost | Effort | Tier |
| -------------------------- | ---------------------------------- | ---- | ------ | ---- |
| **Devcontainer** (VS Code) | Full env-as-code, `code .` → ready | $0   | 4 год  | nice |
| **Nix flake**              | Reproducible deterministic env     | $0   | 1 день | nice |
| **mise / proto / volta**   | Pin Node + pnpm versions           | $0   | 30 хв  | must |
| **direnv**                 | Auto `.envrc` activation per repo  | $0   | 30 хв  | nice |
| **Lefthook**               | Faster pre-commit (Go)             | $0   | 1 год  | nice |
| **Turbo remote cache**     | CI build cache (5 → 1 хв)          | $0   | 1 год  | must |

#### Turbo remote cache — інструкція з налаштування

CI already passes `TURBO_TOKEN` / `TURBO_TEAM` env vars to every turbo
invocation. When the secrets are absent turbo silently falls back to
local-only caching, so nothing breaks.

**To activate remote caching (maintainer steps):**

1. Go to [vercel.com/account/tokens](https://vercel.com/account/tokens)
   and create a new token (scope: the team that owns the Sergeant project).
2. Copy the token value.
3. In the GitHub repo → **Settings → Secrets and variables → Actions**,
   add two repository secrets:
   - `TURBO_TOKEN` — the Vercel token from step 2.
   - `TURBO_TEAM` — your Vercel team slug (e.g. `my-team`). Find it at
     the top-left of the Vercel dashboard or in the URL
     (`vercel.com/<team-slug>`).
4. Re-run any CI workflow — turbo will log
   `Remote caching enabled` in the output.

**Optional — local dev remote cache:**

```bash
# one-time setup
npx turbo login          # opens Vercel OAuth in browser
npx turbo link           # links the repo to the Vercel team
```

After linking, local `turbo run build` / `turbo run test` will also
read & write the shared cache.

**Sergeant-specific:**

- Локальний Postgres піднімається через кореневий `docker-compose.yml` (`pgvector/pgvector:pg16` — не alpine, бо міграція 025 потребує `CREATE EXTENSION vector`). Повний dev cycle — `pnpm dev:db` (піднімає docker + мігрує).
- **Volta вже в package.json** (`"volta": { "node": "20.20.2", "pnpm": "9.15.1" }`) + `engines.node = "20.x"`. Пункт «must» закритий.

### 1.2. CLI quality-of-life

| Tool                                                                 | What                                | Cost |
| -------------------------------------------------------------------- | ----------------------------------- | ---- |
| **GitHub CLI** + alias-и (`gh pr create -f`, `gh pr merge --squash`) | $0                                  |
| **lazygit**                                                          | TUI Git замість manual commands     | $0   |
| **fzf**                                                              | Fuzzy-find для файлів і git history | $0   |
| **starship**                                                         | Швидкий і красивий shell prompt     | $0   |
| **zoxide**                                                           | Smart `cd`                          | $0   |
| **eza** / **bat**                                                    | Кращі `ls` / `cat`                  | $0   |

Це не змінює продуктивність радикально, але сумарно економить ~30 хв/день.

---

## 2. Створення коду (генератори, codegen)

### 2.1. Генератори коду

| Tool          | Use case                                         | Effort to setup |
| ------------- | ------------------------------------------------ | --------------- |
| **Plop**      | `plop module finyk` → створює структуру module-а | 4 год           |
| **Hygen**     | Те саме що Plop, інша філософія                  | 4 год           |
| **turbo-gen** | Turborepo-native generators                      | 2 год           |

**Sergeant kandydaty:**

- `plop module <name>` — нова модуль-структура (`pages/components/hooks/lib/`)
- `plop hook <name>` — RQ-hook + RQ-key + test
- `plop endpoint <method> <path>` — Express handler + zod schema + test
- `plop migration <name>` — `apps/server/src/migrations/<NNN>_<name>.sql`

### 2.2. Type-safe API-контракт

Це **найбільша зміна архітектури**, але вирішує клас регресій типу #708 (bigint as string).

| Approach                   | Pros                                    | Cons                               | Effort    |
| -------------------------- | --------------------------------------- | ---------------------------------- | --------- |
| **zod-to-openapi**         | Залишає Express, generate OpenAPI з zod | OpenAPI треба host-ити             | 1 тиждень |
| **tRPC**                   | End-to-end types, no codegen            | Потребує переписати всі endpoint-и | 2-3 тижні |
| **GraphQL Code Generator** | Якщо колись підете в GraphQL            | Серйозна архітектурна зміна        | 1 місяць+ |
| **Drizzle ORM**            | TS-first, schema → types                | Замінити raw SQL у міграціях       | 1-2 тижні |

**Рекомендую zod-to-openapi** — мінімальна інвазивна зміна, найбільший win.

### 2.3. UI-scaffolding

| Tool                               | What                                |
| ---------------------------------- | ----------------------------------- |
| **shadcn/ui**                      | Copy-paste компоненти на Tailwind   |
| **cva** (class-variance-authority) | Variants без boolean-prop-explosion |
| **Radix UI**                       | Headless accessible primitives      |
| **react-hook-form + zod**          | Form validation з типобезпекою      |

У Sergeant вже Tailwind + design-tokens. cva і shadcn/ui — найкращий fit.

---

## 3. Якість коду (static-аналіз)

### 3.1. Must-have

| Tool                       | What                                                        | Effort    | Статус                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript strict mode** | Incremental: `strictNullChecks` → `noImplicitAny` → full    | 1-2 тижні | ✅ done (Phase 4 [#1420](https://github.com/Skords-01/Sergeant/pull/1420) + Phase 5 cleanup ([#1448](https://github.com/Skords-01/Sergeant/pull/1448)) + Phase 5b finyk-pages `: any` cleanup ([#1452](https://github.com/Skords-01/Sergeant/pull/1452)) + Phase 5c `allowJs` workspace-wide flip ([#1454](https://github.com/Skords-01/Sergeant/pull/1454)); 13/13 пакетів = 100%, колонка `allowJs` в strict-coverage — «—» без `⚠️`. **Phase 6a (🟢 in-flight 2026-05-03):** `noUncheckedIndexedAccess: true` flipped у base, baseline зафіксований **1225 errors / 280 файлів**, `routine-domain` мігровано (17 → 0), guard розширено + 2 allowlist entries (apps/web, apps/server) з `expires: 2026-09-30`. Per-module rollout у наступних PR-ах. **Phase 6 backlog:** 6b `exactOptionalPropertyTypes`, 6c `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, 6d `noUnusedLocals`/`noUnusedParameters` — див. tech-debt/frontend.md §11.1) |
| **ESLint 9**               | У вас є                                                     | —         | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Prettier + lint-staged** | У вас є                                                     | —         | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Knip**                   | Find unused exports/files/deps (~50+ findings on first run) | 1 год     | ✅ done [#716](https://github.com/Skords-01/Sergeant/pull/716)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **depcheck**               | Find unused deps в package.json                             | 30 хв     | ✅ done [#716](https://github.com/Skords-01/Sergeant/pull/716)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **size-limit**             | Bundle size budget; fails CI on regression                  | 2 год     | ✅ done [#740](https://github.com/Skords-01/Sergeant/pull/740)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **CSpell**                 | Spell-checker для коду і коментарів                         | 30 хв     | ⏳ pending (UA + EN dictionaries; оцінити ROI після Tailwind v4 + 0007 design-system закриття)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Sergeant-priority:** ~~strict TypeScript. Зараз `strict: false` — це баги waiting to happen.~~ **Резолвед 2026-05-03:** всі 13 пакетів на `strict: true`, silent-drift блокує `tools/tsconfig-guard`.

#### size-limit + bundle-analyzer — як користуватись

`size-limit` перевіряє brotli-розмір зібраного бандла проти бюджету у
`apps/web/package.json` → `"size-limit"` (явно `"brotli": true`).
CI крок «Bundle size guard» у `.github/workflows/ci.yml` запускається
автоматично після `pnpm check`.

```bash
# Перевірити розмір бандла (потребує попередній build):
pnpm --filter @sergeant/web build
pnpm --filter @sergeant/web exec size-limit

# Або через npm-script:
pnpm --filter @sergeant/web size

# Згенерувати HTML-репорт bundle-analyzer (treemap):
pnpm --filter @sergeant/web build:analyze
# Відкрити apps/server/dist/bundle-report.html у браузері.
```

Бюджети (brotli): JS ≤ 820 kB, CSS ≤ 28 kB.
Якщо CI падає — або зменшіть бандл, або обґрунтовано підніміть ліміт у
`apps/web/package.json`.

**Knip + depcheck — впроваджено у [#716](https://github.com/Skords-01/Sergeant/pull/716):** `knip.json` baseline + scripts у root `package.json`. Перший cleanup pass видалив: 6 невикористовуваних файлів (`CelebrationOverlay.tsx`, `ModuleChecklist.tsx`, `PermissionsPrompt.tsx`, `CategoryManager.tsx`, `PhotoProgress.tsx`, `useBodyPhotos.ts`), 4 unused exports, 2 stale eslint-plugin entries (`apps/server/src/obs/metrics.ts`, `logger.ts` cleanup).

### 3.2. Nice-to-have

| Tool                   | What                                           | Cost         |
| ---------------------- | ---------------------------------------------- | ------------ |
| **Sonar / Codacy**     | Quality dashboard з historical trends          | Free for OSS |
| **Semgrep**            | Security + correctness rules; кастомні правила | $0 / paid    |
| **dependency-cruiser** | Visualize і enforce module boundaries          | $0           |
| **CodeScene**          | Hotspots analysis, churn-analysis              | Free for OSS |
| **complexity-report**  | Cyclomatic complexity per function             | $0           |
| **ts-prune**           | Find dead exports (overlap with Knip)          | $0           |
| **madge**              | Find circular dependencies                     | $0           |

### 3.3. Кастомні ESLint-rule-и

У вас вже `packages/eslint-plugin-sergeant-design/`. Кандидати на нові правила:

- `no-bigint-string` — server response shape має coerced numbers (захист від класу #708).
- `rq-keys-only-from-factory` — `["finyk", ...]` заборонено, тільки `finykKeys.*`.
- `domain-package-isolation` — `@finyk` не імпортує `@fizruk` напряму.
- `ai-marker-syntax` — валідація `AI-NOTE/AI-DANGER/AI-GENERATED/AI-LEGACY` (з #711).

---

## 4. Тестування

Окрема секція в `docs/planning/ai-coding-improvements.md` (#711) містить деталі по Vitest, Playwright, Argos, Storybook, snapshot tests. Тут — додаткові тулзи.

### 4.1. Тестова інфраструктура

| Tool                          | What                                     | Effort | Tier | Статус                                                         |
| ----------------------------- | ---------------------------------------- | ------ | ---- | -------------------------------------------------------------- |
| **Snapshot tests (server)**   | Mono serializers response shape          | 4 год  | must | ✅ done [#718](https://github.com/Skords-01/Sergeant/pull/718) |
| **Playwright Smoke E2E (PR)** | Login → dashboard happy-path на кожен PR | 2 год  | must | ✅ done [#717](https://github.com/Skords-01/Sergeant/pull/717) |
| **Testcontainers**            | Real Postgres у Docker для server tests  | 4 год  | must | ✅ done [#728](https://github.com/Skords-01/Sergeant/pull/728) |
| **MSW (Mock Service Worker)** | Realistic API mocks для frontend tests   | 4 год  | must | ✅ done [#729](https://github.com/Skords-01/Sergeant/pull/729) |
| **fishery** / **factory-bot** | Test data factories                      | 2 год  | nice | ⏳ pending                                                     |
| **faker**                     | Random test data                         | 30 хв  | nice | ⏳ pending                                                     |
| **node:test**                 | If відмовляєтесь від Vitest для server   | 1 день | nice | ⏳ pending                                                     |

**Sergeant-priority:** Testcontainers. Зараз у server tests `queryMock.mockResolvedValueOnce(...)` — це не ловить SQL-помилки. Реальний PG ловить. ✅ реалізовано у [#728](https://github.com/Skords-01/Sergeant/pull/728).

### 4.2. E2E та visual-тести

| Tool           | What                                                                                                                                  | Cost                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Playwright** | ✅ активовано на PR ([#717](https://github.com/Skords-01/Sergeant/pull/717)) + `extended-e2e.yml` workflow                            | $0                    |
| **Detox**      | ✅ mobile e2e активний (`detox-android.yml` + `detox-ios.yml`); див. [`docs/planning/mobile-e2e-testing.md`](./mobile-e2e-testing.md) | $0                    |
| **Argos**      | ✅ впроваджено: `@argos-ci/playwright` + `visual-regression.yml` workflow                                                             | Free < 5K screenshots |
| **Percy**      | BrowserStack-owned visual testing (не використовується — Argos покриває)                                                              | Free 5K screenshots   |
| **Chromatic**  | Storybook-integrated visual testing (не використовується — Argos + Storybook deploy)                                                  | $149/міс              |
| **Lost Pixel** | Self-hosted visual testing                                                                                                            | $0                    |

### 4.3. Performance та load-тести

| Tool              | What                     | Cost         | Статус                                                                                                                                                                                                                                             |
| ----------------- | ------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **k6**            | Load testing для API     | $0 (Grafana) | ⏳ pending — стоїть після запуску проду; базовий бенчмарк sync v2 endpoint-ів                                                                                                                                                                      |
| **Artillery**     | Same, Node-native        | $0 / $40/міс | ⏳ pending (k6 приоритетніший через Grafana stack)                                                                                                                                                                                                 |
| **Lighthouse CI** | Performance budget на PR | $0           | ⏳ pending — потенційний backlog після Tailwind v4 міграції; size-limit + Vercel Speed Insights вже покривають bundle + RUM                                                                                                                        |
| **WebPageTest**   | Real-device RUM          | Free quota   | ⏳ pending                                                                                                                                                                                                                                         |
| **Stryker**       | Mutation testing         | $0           | ⏸ retired ([#052b](https://github.com/Skords-01/Sergeant/pull/2046), 2026-05-06) — cloudSync конфіги + workflow знесено разом із v1 engine drop; пакет `@stryker-mutator/*` лишається в devDeps під реactivation на новій critical-logic поверхні. |

### 4.4. Покриття тестами

| Tool              | What                            |
| ----------------- | ------------------------------- |
| **c8 / Istanbul** | Code coverage                   |
| **Codecov**       | Coverage tracking + PR comments |
| **Coveralls**     | Альтернатива Codecov            |

CI gate: `vitest --coverage` + threshold (наприклад 70% lines) на critical packages (`finyk-domain`, `mono`, `auth`).

---

## 5. CI/CD

### 5.1. Оптимізація pipeline-у

| Practice                     | What                                                              | Effort           | Статус                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **Matrix builds**            | Паралельні test jobs по `apps/`. Зараз послідовно.                | 2 год            | ⏳ pending — їхали на turbo affected; matrix по окремих jobs поступово (розбити `check` на lint/typecheck/test) |
| **Concurrency cancellation** | `concurrency: {group, cancel-in-progress}` — економить compute    | 30 хв            | ✅ done — `concurrency: ci-${{ github.ref }}` + `cancel-in-progress: true` у `ci.yml`                           |
| **Affected-only tests**      | `turbo run test --filter=...[HEAD^]` — тестувати тільки зачеплене | 4 год            | ⏳ pending — все ще «full turbo run»; affected-only оцінити після Turbo remote cache метрик                     |
| **Cached node_modules**      | `actions/setup-node` з cache                                      | 30 хв (мабуть є) | ✅ done — `actions/setup-node@... cache: pnpm` у всіх jobs                                                      |
| **Cached pnpm store**        | Окремо від node_modules                                           | 30 хв            | ✅ done — `cache: pnpm` (та сама опція покриває pnpm store)                                                     |
| **Required checks rules**    | Branch protection: lint + typecheck + test required               | 30 хв            | ✅ done — бранч protection включає `check`, `Test coverage (vitest)`, `Critical-flow E2E` (див. журнал архіву)  |

### 5.2. Інструменти

| Tool                        | What                                           | Cost      | Статус                                                                                          |
| --------------------------- | ---------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| **Renovate**                | Auto-PR для оновлень (потужніше за Dependabot) | $0        | ✅ done [#721](https://github.com/Skords-01/Sergeant/pull/721) + `dependabot-automerge.yml`     |
| **release-please** (Google) | Auto-changelog + auto-versioning monorepo      | $0        | ⏳ pending — вручну `CHANGELOG.md`, оцінити ROI після виходу в прод                             |
| **semantic-release**        | Альтернатива                                   | $0        | ⏳ pending (двійник release-please)                                                             |
| **changesets**              | Інтерактивний versioning для monorepo          | $0        | ⏳ pending — monorepo internal-only, public release flow поки не потрібен                       |
| **CodeQL**                  | Security scanning від GitHub                   | $0        | ✅ done — `codeql.yml` workflow активний                                                        |
| **Codespaces**              | Cloud dev env інтегрована з PR                 | $4-15/міс | ⏳ not used — локальний dev (Volta + docker-compose) покриває; оцінити після розширення команди |

**Sergeant-priority:** Renovate (Dependabot тут не справляється з pnpm workspace правильно).

### 5.3. Preview-середовища

| Service                         | Pros               | Cons               | Cost        |
| ------------------------------- | ------------------ | ------------------ | ----------- |
| **Vercel**                      | У вас є, automatic | Rate-limit на free | $20/міс Pro |
| **Railway preview branches**    | Backend + DB на PR | Cold start ~30 сек | included    |
| **Render preview environments** | Same as Railway    | Інше vendor        | $0 starter  |
| **Fly.io machines**             | Per-PR machines    | Setup складніший   | $0 starter  |

**Sergeant-priority:** Vercel Pro (без preview AI-валідація сильно слабша).

### 5.4. Боти і AI-review

| Tool                | What                          | Cost     |
| ------------------- | ----------------------------- | -------- |
| **CodeRabbit**      | У вас є                       | $24/міс  |
| **Devin Review**    | У вас є                       | included |
| **Greptile**        | AI code review з repo-context | $30/міс  |
| **Copilot for PRs** | GitHub native                 | $10/міс  |

---

## 6. Production / observability

### 6.1. Error-tracking

| Tool                       | What                                           | Cost            |
| -------------------------- | ---------------------------------------------- | --------------- |
| **Sentry**                 | Error tracking + perf monitoring + source maps | $26/міс starter |
| **Highlight.io**           | Sentry + session replay                        | $50/міс         |
| **Bugsnag**                | Альтернатива Sentry                            | $25/міс         |
| **Logtail / Better Stack** | Logs + uptime monitoring                       | $20/міс         |

**Sergeant-priority:** Sentry. Найбільший single-tool ROI у production. Без error tracking ти дізнаєшся про bug-и тільки коли user скаржиться у чат — як було з #706/#707/#708.

**Статус (2026-05-05):** integration готова на всіх трьох клієнтах.

- `SENTRY_DSN` виставлено на Railway (server) ✅. Beforesend-фільтр у `apps/server/src/sentry.ts` стрипає cookies/auth + email хеш-логуючи; реліз береться з cascade `SENTRY_RELEASE → RAILWAY_GIT_COMMIT_SHA → VERCEL_GIT_COMMIT_SHA → GITHUB_SHA` (L9 hardening).
- `VITE_SENTRY_DSN` виставлено на Vercel (web) ✅ + `@sentry/vite-plugin` для source-map upload, динамічний import щоб не блокувати hydration.
- **Mobile SDK залендено** (`@sentry/react-native` 6.10.0) у `apps/mobile/src/lib/observability.ts` ✅. Поки не виставлено `EXPO_PUBLIC_SENTRY_DSN` у Expo EAS Secrets — SDK раціонально no-op-ить (див. `getSentryDsn`), mobile помилки не агрегуються — єдиний залишок від «повного» #1.
- Беклог: PR #12 `sentry-traces-sampler.md` у [`stack-pulse-2026-05/`](../initiatives/stack-pulse-2026-05/pr-12-sentry-traces-sampler.md) — dynamic traces sample-rate по route-pattern.

### 6.2. APM і tracing

| Tool                  | What                                 | Cost            |
| --------------------- | ------------------------------------ | --------------- |
| **Datadog APM**       | Comprehensive                        | $31/host/міс    |
| **New Relic**         | Альтернатива Datadog                 | $0 (free 100GB) |
| **Grafana Cloud**     | OSS-friendly, OpenTelemetry-first    | $0 starter      |
| **OpenTelemetry SDK** | Vendor-agnostic instrumentation      | $0 (just SDK)   |
| **Honeycomb**         | Best-in-class for distributed traces | $0 starter      |

### 6.3. Логи

| Tool                       | What                                 |
| -------------------------- | ------------------------------------ |
| **Pino**                   | Fastest Node logger, structured JSON |
| **Winston**                | Mature, plugin ecosystem             |
| **Logtail / Better Stack** | Log aggregation + search             |
| **Vector**                 | OSS log router                       |
| **Grafana Loki**           | OSS log storage                      |

**Sergeant:** ✅ done у [#738](https://github.com/Skords-01/Sergeant/pull/738). `apps/server/src/obs/logger.ts` тепер на pino + `pino-http` middleware, JSON-формат у проді (Railway), pretty-print у dev. Sentry/PostHog stream підключаться без зміни коду.

### 6.4. Uptime і health-checkи

| Tool                    | What                        | Cost         | Статус                                                                                             |
| ----------------------- | --------------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| **Better Stack Uptime** | Uptime monitoring + on-call | $34/міс      | ⏳ pending                                                                                         |
| **UptimeRobot**         | Безкоштовний uptime ping    | $0           | ⏳ pending — `/health` і `/healthz` вже покриті regression-тестом L7 (info-leak); ping налаштувати |
| **Healthchecks.io**     | Cron + heartbeat monitoring | $0 free tier | ⏳ pending — під cron жоби (Renovate, daily-audit) якщо підє mute                                  |
| **Pingdom**             | Premium                     | $15/міс      | ⏳ pending                                                                                         |

**Sergeant priority:** UptimeRobot на `/health` + `/healthz` — настройти за 5 хв. (`/healthz` регресія-тест вже стоїть в [PR #1842](https://github.com/Skords-01/Sergeant/pull/1842) L7 hardening).

### 6.5. Продуктова аналітика

| Tool          | What                                             | Cost         |
| ------------- | ------------------------------------------------ | ------------ |
| **PostHog**   | Analytics + feature flags + session replay + A/B | $0 free tier |
| **Plausible** | Privacy-first simple analytics                   | $9/міс       |
| **Amplitude** | Behavioural analytics                            | $0 / paid    |
| **Mixpanel**  | Same as Amplitude                                | $0 / paid    |
| **GA4**       | Free, але creepy і слабкий за UX                 | $0           |

**Sergeant priority:** PostHog. Один tool покриває аналітику + flags + replay. Якщо боїтесь cloud — self-host (open-source).

### 6.6. Synthetic / RUM

| Tool                         | What                  | Статус                                                                                                  |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| **Lighthouse CI**            | Synthetic perf на PR  | ⏳ pending (див. §4.3)                                                                                  |
| **Sentry Performance**       | RUM + traces          | ✅ done — traces sample-rate на всіх 3 клієнтах; backlog — dynamic sampler (PR #12 stack-pulse-2026-05) |
| **Vercel Speed Insights**    | Vercel-native RUM     | ⏳ pending — evaluate після Tailwind v4 + cut-over                                                      |
| **Cloudflare Web Analytics** | RUM, privacy-friendly | ⏳ not used (PostHog + Vercel покривають)                                                               |

---

## 7. База даних

### 7.1. Postgres-інструменти

| Tool                   | What                            | Cost           | Статус                                                                                                                                                              |
| ---------------------- | ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PgHero**             | Performance dashboard           | $0             | ⏳ pending                                                                                                                                                          |
| **pg_stat_statements** | Slow query identification       | $0 (extension) | ⏳ pending — включити на Railway PG, додати рубрику у [`docs/observability/runbook.md`](../observability/runbook.md)                                                |
| **pgBouncer**          | Connection pooling              | $0             | ⏳ pending — PR #13 `postgres-pool-sizing.md` у [stack-pulse-2026-05](../initiatives/stack-pulse-2026-05/pr-13-postgres-pool-sizing.md) (`pg.Pool.max` поки дефолт) |
| **Atlas** (atlasgo.io) | Schema-as-code, drift detection | $0 / $30/міс   | ⏳ pending — PR #11 `drizzle-schema-drift-ci.md` у stack-pulse-2026-05 (Drizzle drift CI без повного Atlas)                                                         |
| **dbmate**             | Migrations CLI (lightweight)    | $0             | ⏳ not used — власний `apps/server/migrate.mjs` + sequential `NNN_*.sql` вже покриває                                                                               |
| **squawk**             | Lint SQL migrations for safety  | $0             | ⏳ pending — власний `scripts/lint-migrations.mjs` вже ловить gaps; squawk додати для `DROP COLUMN` / `ALTER без CONCURRENTLY`                                      |
| **Prisma**             | TS ORM з migrations             | $0             | ⏳ not used (Drizzle обраний, див. [`archive/orm-drizzle-vs-kysely.md`](./archive/orm-drizzle-vs-kysely.md))                                                        |
| **Drizzle**            | TS ORM, simpler than Prisma     | $0             | ✅ done — `packages/db-schema` з PG + SQLite, drizzle-kit для schema generation; використовує `apps/server` + `apps/web` (CloudSync SQLite)                         |
| **Kysely**             | Type-safe SQL builder, no ORM   | $0             | ⏳ not used (Drizzle обраний)                                                                                                                                       |

**Sergeant priority:**

- **squawk** lint у CI на migrations — резервний пункт поверх власного `lint-migrations.mjs` (gap detection вже є, відсутня «lock»-detection для `DROP COLUMN`, `ALTER без CONCURRENTLY`).
- **pg_stat_statements** на проді — знайти повільні queries (за 1 день логів зазвичай 5+ кандидатів).
- **Drizzle** — база вже введена (`packages/db-schema`); наступний крок — schema-drift CI (PR #11).

### 7.2. Бекапи і recovery

| Practice                        | What                                                    |
| ------------------------------- | ------------------------------------------------------- |
| Railway automatic daily backups | у вас є, перевірити retention                           |
| Quarterly recovery drill        | відновити backup на staging — впевнитись що він робочий |
| **wal-e / wal-g**               | Continuous archiving (для self-hosted)                  |
| **pgBackRest**                  | Same                                                    |

### 7.3. Безпечні патерни міграцій

- **Backwards-compatible deploys**: спочатку додай column nullable, потім backfill, потім зроби NOT NULL у наступному релізі.
- **Locks-aware migrations**: ніколи `ALTER TABLE ADD COLUMN NOT NULL` на великих таблицях без default.
- **`CONCURRENTLY` для індексів** у проді.
- **Feature flag перемикає behavior** до того як міграція повноцінно applied.

---

## 8. Безпека

### 8.1. Must-have

| Practice                             | Tool                                                                                                        | Effort       | Статус                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Dependency CVE scanning              | Renovate `vulnerabilityAlerts` (✅ enabled у [#721](https://github.com/Skords-01/Sergeant/pull/721)) / Snyk | 30 хв        | ✅ done — Renovate vulnerabilityAlerts + `pnpm audit --audit-level=critical/high` у кожному PR + nightly-audit + OSV-Scanner |
| Secrets pre-commit hook              | git-secrets / gitleaks / trufflehog                                                                         | 30 хв        | ✅ done — gitleaks job (`Secret scan (gitleaks)`) у `ci.yml` блокує пуш секретів з supply-chain SHA-pin                      |
| HTTP security headers                | helmet.js (Express)                                                                                         | 1 год        | ✅ done — `apps/server/src/http/security.ts` використовує `helmet@^8` + HSTS + CSP report-only (M1 hardening)                |
| CORS strict whitelist                | manual config                                                                                               | 30 хв        | ✅ done — власний `apps/server/src/http/cors.ts` (strict allowlist)                                                          |
| Rate limiting                        | ✅ Власний `apps/server/src/http/rateLimit.ts` (Redis-backed через `ioredis`, in-memory fallback)           | done         | ✅ done — PR #02 stack-pulse: `rate-limit-fail-closed.md` (fail-closed mode при Redis outage)                                |
| HttpOnly + Secure + SameSite cookies | manual config                                                                                               | 30 хв        | ✅ done — Better Auth виставляє всі флаги; перевірено у PR #10 `better-auth-security-review.md` (stack-pulse)                |
| Strong password hashing              | Better Auth (handle-ить argon2)                                                                             | already done | ✅ done; беклог — PR #03 `bcrypt-password-limit.md` (72-байт ліміт як explicit guard)                                        |
| HTTPS everywhere                     | Railway / Vercel automatic                                                                                  | done         | ✅ done — Railway + Vercel automatic                                                                                         |

### 8.2. Nice-to-have

| Tool              | What                            | Cost             | Статус                                                                                            |
| ----------------- | ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| **Snyk**          | Comprehensive security scanning | $0 / $25/міс     | ✅ done — Snyk у supply-chain (разом з OSV-Scanner + pnpm audit, див. stack-pulse «supply chain») |
| **OWASP ZAP**     | Penetration testing             | $0               | ⏳ pending — резервно після виходу в прод                                                         |
| **trivy**         | Container security              | $0               | ✅ done — `container-scan.yml` workflow запускає trivy на всі Dockerfile-и                        |
| **trufflehog**    | Secrets in git history scan     | $0               | ⏳ not used (gitleaks покриває git history)                                                       |
| **CodeQL**        | GitHub native                   | $0               | ✅ done — `codeql.yml` workflow                                                                   |
| **release-sbom**  | CycloneDX SBOM на release       | $0               | ✅ done — `release-sbom.yml` workflow публікує SBOM біля релізів                                  |
| **1Password CLI** | Secrets injection in shell      | $3/міс           | ⏳ not used — Vercel/Railway envs + GitHub Secrets покривають                                     |
| **Doppler**       | Centralized secrets             | $0 / $7/user/міс | ⏳ not used — як вище                                                                             |
| **Infisical**     | Open-source Doppler alternative | $0 / $9/user/міс | ⏳ not used                                                                                       |

### 8.3. Аудити

- Раз на півроку — security audit (manual review або external).
- Раз на квартал — `pnpm audit` review + critical CVE patches.
- Penetration testing раз на рік (для production app з reali users).

---

## 9. Performance

### 9.1. Frontend

| Tool                          | What                        | Статус                                                                                                                                                  |
| ----------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rollup-plugin-visualizer**  | Bundle analyzer для Vite    | ✅ done — `pnpm build:analyze` генерує `dist/bundle-report.html`; integrated з size-limit budget [#740](https://github.com/Skords-01/Sergeant/pull/740) |
| **Lighthouse CI**             | Perf budget на PR           | ⏳ pending (див. §4.3 + §6.6)                                                                                                                           |
| **Core Web Vitals tracking**  | LCP, CLS, INP               | ✅ done — `apps/web/src/core/observability/webVitals.ts` (відправляє у PostHog + Sentry)                                                                |
| **React DevTools Profiler**   | Identify slow renders       | ✅ dev-only (no integration)                                                                                                                            |
| **why-did-you-render**        | Find unnecessary re-renders | ⏳ not used — React Profiler + Stryker mutation testing дають достатньо signal                                                                          |
| **Million.js**                | React optimization compiler | ⏳ not used (React 18; Million.js поки не в пріоритеті як «optimization compiler»)                                                                      |
| **React Compiler** (React 19) | Auto-memoization            | ⏳ pending — після міграції React 18 → 19; беклог окремої ADR                                                                                           |

**Sergeant priority:** Bundle visualizer + size-limit + Web Vitals tracking — вже на main; наступний крок — React Compiler після React 19 migration.

### 9.2. Backend

| Tool            | What                         |
| --------------- | ---------------------------- |
| **clinic.js**   | Node profiling (flamegraphs) |
| **autocannon**  | HTTP benchmarking            |
| **node --prof** | Native CPU profiling         |
| **0x**          | Flamegraph generator         |

### 9.3. Мережа

| Tool                   | What                                         |
| ---------------------- | -------------------------------------------- |
| **Cloudflare**         | CDN + DDoS protection (Vercel вже це робить) |
| **fastly**             | Premium CDN                                  |
| **HTTP/3**             | Vercel/Cloudflare automatic                  |
| **Brotli compression** | автоматичне у modern hosting                 |

---

## 10. Документація

### 10.1. Репо-доки

| Practice                                | Tool                |
| --------------------------------------- | ------------------- |
| **README.md з 5-min quickstart**        | manual              |
| **CONTRIBUTING.md**                     | manual              |
| **AGENTS.md**                           | manual (з #711)     |
| **ADR** (Architecture Decision Records) | adr-tools / madr    |
| **Postmortems folder**                  | `docs/postmortems/` |

### 10.2. Генеровані доки

| Tool                | What                    |
| ------------------- | ----------------------- |
| **TypeDoc**         | TS API docs             |
| **Mintlify**        | Modern docs site        |
| **Docusaurus**      | Meta's docs site        |
| **VitePress**       | Vue-team's, lightweight |
| **Astro Starlight** | Astro-based, beautiful  |
| **Storybook docs**  | Component docs          |

**Sergeant priority:** README quickstart перш за все. Зараз новий розробник буде довго стикатись.

### 10.3. Діаграми

| Tool                   | What                            |
| ---------------------- | ------------------------------- |
| **Mermaid** в markdown | Inline diagrams, GitHub-native  |
| **Excalidraw**         | Hand-drawn style                |
| **draw.io**            | Comprehensive                   |
| **structurizr**        | Architecture-as-code (C4 model) |

---

## 11. Команда / процеси

### 11.1. Інструменти

| Tool                            | What                     | Cost           |
| ------------------------------- | ------------------------ | -------------- |
| **Linear**                      | Issues, modern UX        | $8/user/міс    |
| **Notion**                      | Wiki + docs + tasks      | $10/user/міс   |
| **Height**                      | Linear-like альтернатива | $6.99/user/міс |
| **GitHub Projects**             | Free якщо вже на GitHub  | $0             |
| **Slack** + GitHub integrations | Comms                    | $7/user/міс    |

### 11.2. Практики

- **Async stand-ups** замість дзвінків (Slack thread + PR-ди).
- **PR template** з блоком "How tested" (з #711).
- **CODEOWNERS** для auto-assigned reviewers.
- **Quarterly tech debt sprint** — 1 тиждень на рефакторинг без нових фіч.
- **Postmortems на all production incidents** — folder `docs/postmortems/YYYY-MM-DD-*.md`.
- **Onboarding doc** для нових — крок за кроком 1-й тиждень.

### 11.3. Обмін знаннями

- **Tech-talks 1 раз/міс** — 30 хв, slack-recording.
- **Brown-bag sessions** — обід + презентація (для офлайн).
- **Pair programming** для tricky задач.
- **Architecture review meetings** для big changes (нова DB, новий external API).

---

## 12. Оптимізація витрат

| Practice                                | Saves                 |
| --------------------------------------- | --------------------- |
| Vercel Edge functions замість Lambda    | 30-50%                |
| Cloudflare R2 замість S3 для статики    | 90% (no egress fees)  |
| Postgres — review unused indexes        | ~20% IO               |
| Logs sampling (1% in prod)              | 70-90% logs cost      |
| Sentry sample rate 10-25%               | 75% Sentry cost       |
| Datadog `host_count_limits`             | 30-50%                |
| Railway `auto-scaling` instead of fixed | 40-60% on low traffic |

---

## Порядок впровадження (по тижнях)

### Тиждень 1 — швидкі wins ($46/міс новий cost)

- [x] **Sentry + source maps upload** — server (Railway DSN) + web (Vercel `VITE_SENTRY_DSN` + `@sentry/vite-plugin`) + mobile SDK (`@sentry/react-native` 6.10.0). Реліз cascade `SENTRY_RELEASE → RAILWAY_GIT_COMMIT_SHA → VERCEL_GIT_COMMIT_SHA → GITHUB_SHA`. Залишок: `EXPO_PUBLIC_SENTRY_DSN` в EAS Secrets (provisioning).
- [x] **Vercel Pro plan upgrade** — team `skords-01s-projects` на Pro (підтверджено через Vercel API: `billing.plan: pro`).
- [x] **Knip + depcheck + видалення dead code** — [#716](https://github.com/Skords-01/Sergeant/pull/716).
- [x] **Renovate setup** — [#721](https://github.com/Skords-01/Sergeant/pull/721) + `dependabot-automerge.yml`.
- [x] **Turbo remote cache** — активовано через `TURBO_TOKEN` + `TURBO_TEAM` у GitHub Actions.
- [x] **AGENTS.md** — [#714](https://github.com/Skords-01/Sergeant/pull/714).
- [x] **CONTRIBUTING.md з 5-хв quickstart** — [#726](https://github.com/Skords-01/Sergeant/pull/726).
- [ ] **UptimeRobot на /health + /healthz** — pending (єдиний відкритий пункт Тижня 1; ping setup ~5 хв).

### Тиждень 2 — type safety

- [x] Strict TypeScript step 1: `strictNullChecks` для одного package — done у колишньому `apps/web/tsconfig.strict.json` (`src/shared/**`).
- [x] Strict TypeScript phases 2–3.1 — `strictNullChecks` повний web (`src/{test,core/*,modules/*}`); паралельно жив `tsconfig.noimplicitany.json` для core+modules.
- [x] Strict TypeScript Phase 4 (final flip) — PR1 [#1388](https://github.com/Skords-01/Sergeant/pull/1388) · PR2 [#1391](https://github.com/Skords-01/Sergeant/pull/1391) · PR3 [#1402](https://github.com/Skords-01/Sergeant/pull/1402)/#1404 · PR4 [#1420](https://github.com/Skords-01/Sergeant/pull/1420). 419 помилок виправлено без `any` / `@ts-expect-error` / `as unknown as`; `apps/web/tsconfig.json` — `strict: true`, `allowJs: false`.
- [x] Strict TypeScript Phase 5 cleanup (2026-05-03, commit `a7a31703`) — `noImplicitOverride: true` у `packages/config/tsconfig.base.json`; явний `allowJs: false` на web/console; діагностичні `tsconfig.strict.json` / `tsconfig.noimplicitany.json` видалено (redundant); `pnpm strict:coverage` = 13/13 (100%).
- [x] Strict TypeScript Phase 5b cleanup (2026-05-03, PR [#1452](https://github.com/Skords-01/Sergeant/pull/1452)) — `: any` в 9 файлах finyk-pages (`apps/web/src/modules/finyk/pages/{transactions,budgets}/**`) замінено на канонічні finyk-domain типи + slice-інтерфейси; `MonoAccount.balance` вирівняно до webhook-output як `number | undefined`.
- [x] Strict TypeScript Phase 5c (2026-05-03, PR [#1454](https://github.com/Skords-01/Sergeant/pull/1454)) — `allowJs` workspace-wide flip: base `true → false` + explicit на всіх 4 апах + 8 пакетах; колонка `allowJs` у `pnpm strict:coverage` тепер `—` для всіх 13 пакетів.
- [ ] Strict TypeScript Phase 6 («ідеальний стрікт» — opt-in flags) — backlog: 6a `noUncheckedIndexedAccess` бейслайн-експеримент (~100–300 помилок) → 6b `exactOptionalPropertyTypes` → 6c discrete (`noImplicitReturns` + `noFallthroughCasesInSwitch` + `noPropertyAccessFromIndexSignature`) → 6d `noUnusedLocals`/`noUnusedParameters` flip. Деталі у [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) §11.1.
- [ ] Snapshot tests на server serializers (з #711)
- [ ] Custom ESLint rule `no-bigint-string`
- [ ] zod-to-openapi proof-of-concept

### Тиждень 3 — testing

- [x] **Testcontainers для server tests** — [#728](https://github.com/Skords-01/Sergeant/pull/728).
- [x] **MSW для frontend tests** — [#729](https://github.com/Skords-01/Sergeant/pull/729).
- [x] **Activate Playwright E2E на PR** — [#717](https://github.com/Skords-01/Sergeant/pull/717) + `extended-e2e.yml`.
- [x] **PostHog setup + key events tracking** — web + server + mobile SDK env-gated; capture-API виключено в dev/test через `enabled` flag.

### Тиждень 4 — observability

- [x] **Pino structured logging migration** — [#738](https://github.com/Skords-01/Sergeant/pull/738) (`apps/server/src/obs/logger.ts` + `pino-http`).
- [ ] **pg_stat_statements на проді** — pending (Railway PG conf + runbook).
- [ ] **squawk lint у CI на migrations** — pending (резерв поверх власного `lint-migrations.mjs` gap-detection).
- [x] **size-limit + bundle-analyzer** — [#740](https://github.com/Skords-01/Sergeant/pull/740).

### Місяць 2 — інвестиції

- [x] **Argos visual regression** — `@argos-ci/playwright` + `visual-regression.yml` workflow.
- [x] **Storybook setup для shared components** — 44 `*.stories.tsx` у `apps/web` + `storybook-deploy.yml` workflow.
- [x] **Strict TypeScript повне покриття** — Phase 4 final flip ([#1388](https://github.com/Skords-01/Sergeant/pull/1388), [#1391](https://github.com/Skords-01/Sergeant/pull/1391), [#1402](https://github.com/Skords-01/Sergeant/pull/1402), [#1420](https://github.com/Skords-01/Sergeant/pull/1420)) + Phase 5 cleanup ([#1448](https://github.com/Skords-01/Sergeant/pull/1448), [#1452](https://github.com/Skords-01/Sergeant/pull/1452), [#1454](https://github.com/Skords-01/Sergeant/pull/1454)). 13/13 пакетів.
- [ ] **Devcontainer для local dev** — pending (docker-compose + Volta покривають default flow).
- [x] **Drizzle migration POC** — повноцінний `packages/db-schema` (Drizzle PG + SQLite) з drizzle-kit, використовує `apps/server` + `apps/web` (CloudSync SQLite). POC закрив §2.2 і Місяць 2 пункт.

### Підтримка (неперервно)

- [ ] Quarterly security audit
- [ ] Quarterly recovery drill (DB backup restore)
- [x] **Monthly tech debt review** — проводиться через [`stack-pulse-2026-05/`](../initiatives/stack-pulse-2026-05/README.md) (16 PR-ів) + цей roadmap рефреш (2026-05-05).
- [ ] Weekly metrics check (CI fail rate, time-to-PR, etc.) — pending dashboards (PostHog + Grafana Cloud).

---

## Метрики successу

| Метрика                           | Baseline (зараз) | Target Q1 | Target Q2 |
| --------------------------------- | ---------------- | --------- | --------- |
| Time-to-PR                        | ~30 хв           | ~15 хв    | ~10 хв    |
| CI-fail-rate першої спроби        | ~50%             | ~25%      | ~15%      |
| Mean time to recovery (MTTR)      | n/a              | < 1 год   | < 30 хв   |
| Bundle size (web)                 | n/a              | track     | -10%      |
| Test coverage (critical packages) | n/a              | 60%       | 75%       |
| Production error rate             | n/a              | track     | < 0.1%    |
| `pnpm audit` critical CVEs        | n/a              | 0         | 0         |

Інструмент tracking: PostHog dashboard + GitHub Insights + Sentry trends. Ревью раз на тиждень/місяць.

---

## Оцінка cost / month

| Сервіс              | Cost            | Tier    |
| ------------------- | --------------- | ------- |
| Vercel Pro          | $20/міс         | must    |
| Sentry              | $26/міс         | must    |
| Railway (existing)  | varies          | running |
| PostHog             | $0 (free tier)  | must    |
| Renovate            | $0              | must    |
| Better Stack Uptime | $0 (free tier)  | must    |
| Argos               | $0 (free tier)  | nice    |
| Doppler / Infisical | $0 (free tier)  | nice    |
| **Total new cost**  | **~$46-50/міс** | —       |

Збільшення cost-у мінімальне. ROI — годин на тиждень.

---

## Журнал сесій

Історичні журнали сесій «інфра-спринтів» (2026-04-25 day, 2026-04-25 evening) винесені в [`archive/dev-stack-roadmap.md`](./archive/dev-stack-roadmap.md), щоб роадмап залишався «forward-looking». Див. архів для хронології PR-ів #714 — #743.

### 2026-05-05 — roadmap refresh

Стояла вимога аудиту стеку без нових код-змін. Скан репо + workflow + ADR-ів підтвердив: весь топ-15 закритий єдиний «відкритий» хвіст — `EXPO_PUBLIC_SENTRY_DSN` у EAS Secrets. Понад топ-15 раніше незафіксовані в роадмапі done-пункти:

- Storybook (44 stories), Stryker mutation testing (CloudSync `stryker.cloudSync.conf.json` — згодом retired 2026-05-06 разом із v1 engine drop, [#052b](https://github.com/Skords-01/Sergeant/pull/2046)), Argos visual regression, Drizzle ORM POC (`packages/db-schema`), Helmet + CSP report-only (`apps/server/src/http/security.ts`), Detox mobile E2E (`detox-android.yml` + `detox-ios.yml`), Container security (Trivy + CodeQL + CycloneDX SBOM), Gitleaks secret-scan, prom-client metrics (`apps/server/src/obs/metrics.ts`), CI hardening (`concurrency`, `pnpm` cache, SHA-pinned actions), OpenAPI codegen (`pnpm api:generate-openapi`).
- Mobile Sentry SDK (`@sentry/react-native` 6.10.0) залендено в `apps/mobile/src/lib/observability.ts` (DSN-gated no-op якщо env порожній).

Додав: status-колонка у §6 (Uptime + Synthetic), §7.1 (Postgres-інструменти), §8.1/§8.2 (Security must-have + nice-to-have), §9.1 (Frontend perf). Винес журнал 2026-04-25 (day + evening) у [`archive/dev-stack-roadmap.md`](./archive/dev-stack-roadmap.md). Чеклісти §«Порядок впровадження» (Тиждень 1–4 + Місяць 2) промарковані згідно реального стану. Наступний review: 2026-08-03.

---

## Поза скоупом

- **Mobile-specific** — окремий roadmap для Expo / Capacitor.
- **Fizruk / Nutrition / Routine domain logic** — це продуктові roadmap-и.
- **Marketing / SEO** — окремо.
- **Hiring і team scaling** — інші питання.

---

## Зв'язки з іншими roadmap-ами

- `docs/integrations/monobank-roadmap.md` (#709) — продуктовий roadmap по Mono-інтеграції.
- `docs/planning/ai-coding-improvements.md` (#711) — інфраструктура для AI-агентів.
- `docs/tech-debt/frontend.md` — існуючі borгs у web.
- `docs/tech-debt/backend.md` — існуючі borгs у server.
- `docs/monobank-webhook-migration.md` — completed migration.

Цей документ — **superset** і **canonical** для все-проєктних рекомендацій.
