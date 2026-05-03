# Dev stack roadmap — інструменти і поради по всьому ЖЦ розробки

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

**Статус:** in progress. Створено 2026-04-25. Останнє оновлення: 2026-05-03 (**14 з топ-15 закриті** — Strict TS web rollout повністю завершений: усі 4 PR закриті [#1388, #1391, #1402, PR4 final flip], baseline `419 → 0` помилок (−419, 100 % скоупу), `apps/web/tsconfig.json` тепер на повному `strict: true` + без `allowJs`; PostHog інтегрований у web + server, Sentry DSN-gated; залишається лише #5 Vercel Pro — credit card мейнтейнера; деталі у колонці Статус нижче).

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
| 5   | **Vercel Pro plan** (рятує preview deploy)        | 5 хв      | $20/міс          | 🔥🔥   | 🟡 not started (потребує credit card мейнтейнера)                                                                                                                                                                                                                                                                                                    |
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

**Прогрес (2026-05-03):** **14 / 15 закрито** (з урахуванням розщеплення #3 на 3a/3b — обидва closed). Закриті: #1 Sentry (інтеграція + DSN виставлено на Railway server + Vercel web; mobile `EXPO_PUBLIC_SENTRY_DSN` — pending EAS provisioning), #2 Knip+depcheck, #3a Strict TS server, **#3b Strict TS web** (Phase 4 final flip — `apps/web/tsconfig.json` має `strict: true` + без `allowJs`; усі 4 PR закриті: #1388, #1391, #1402, PR4; baseline `419 → 0` помилок, 100 % скоупу), #4 Testcontainers (#728), #6 Turbo remote cache, #7 Renovate, #8 AGENTS.md, #9 MSW (#729), #10 Snapshot tests, #11 Pino logging (#738), #12 Playwright E2E, #13 PostHog (web + server SDK, env-gated), #14 size-limit + bundle-analyzer (#740), #15 CONTRIBUTING.md (#726). Залишається: #5 (Vercel Pro — credentials/credit card мейнтейнера).

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

- Локальний Postgres вже піднімається через кореневий `docker-compose.yml` (`postgres:16-alpine`, `docker compose up -d` → `DATABASE_URL=postgresql://hub:hub@localhost:5432/hub`). Залишковий win — `pnpm dev:db` shortcut + seed-script, але інфраструктура вже на місці; пропозицію «додати docker-compose» прибрано як виконану.
- Volta або mise треба, бо `package.json` зараз має `engines.node` але без enforcement.

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

| Tool                       | What                                                        | Effort    | Статус                                                         |
| -------------------------- | ----------------------------------------------------------- | --------- | -------------------------------------------------------------- |
| **TypeScript strict mode** | Incremental: `strictNullChecks` → `noImplicitAny` → full    | 1-2 тижні | ⏳ pending                                                     |
| **ESLint 9**               | У вас є                                                     | —         | ✅                                                             |
| **Prettier + lint-staged** | У вас є                                                     | —         | ✅                                                             |
| **Knip**                   | Find unused exports/files/deps (~50+ findings on first run) | 1 год     | ✅ done [#716](https://github.com/Skords-01/Sergeant/pull/716) |
| **depcheck**               | Find unused deps в package.json                             | 30 хв     | ✅ done [#716](https://github.com/Skords-01/Sergeant/pull/716) |
| **size-limit**             | Bundle size budget; fails CI on regression                  | 2 год     | ✅ done [#740](https://github.com/Skords-01/Sergeant/pull/740) |
| **CSpell**                 | Spell-checker для коду і коментарів                         | 30 хв     | ⏳ pending                                                     |

**Sergeant-priority:** strict TypeScript. Зараз `strict: false` — це баги waiting to happen.

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

Бюджети (brotli): JS ≤ 615 kB, CSS ≤ 18 kB (~+10% від baseline 2026-04-25).
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

**Sergeant-priority:** Testcontainers. Зараз у server tests `queryMock.mockResolvedValueOnce(...)` — це не ловить SQL-помилки. Реальний PG ловить.

### 4.2. E2E та visual-тести

| Tool           | What                                                                         | Cost                  |
| -------------- | ---------------------------------------------------------------------------- | --------------------- |
| **Playwright** | ✅ активовано на PR ([#717](https://github.com/Skords-01/Sergeant/pull/717)) | $0                    |
| **Detox**      | Mobile e2e (вже згаданий у Sergeant)                                         | $0                    |
| **Argos**      | Visual regression on PRs                                                     | Free < 5K screenshots |
| **Percy**      | BrowserStack-owned visual testing                                            | Free 5K screenshots   |
| **Chromatic**  | Storybook-integrated visual testing                                          | $149/міс              |
| **Lost Pixel** | Self-hosted visual testing                                                   | $0                    |

### 4.3. Performance та load-тести

| Tool              | What                     | Cost         |
| ----------------- | ------------------------ | ------------ |
| **k6**            | Load testing для API     | $0 (Grafana) |
| **Artillery**     | Same, Node-native        | $0 / $40/міс |
| **Lighthouse CI** | Performance budget на PR | $0           |
| **WebPageTest**   | Real-device RUM          | Free quota   |
| **Stryker**       | Mutation testing         | $0           |

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

| Practice                     | What                                                              | Effort           |
| ---------------------------- | ----------------------------------------------------------------- | ---------------- |
| **Matrix builds**            | Паралельні test jobs по `apps/`. Зараз послідовно.                | 2 год            |
| **Concurrency cancellation** | `concurrency: {group, cancel-in-progress}` — економить compute    | 30 хв            |
| **Affected-only tests**      | `turbo run test --filter=...[HEAD^]` — тестувати тільки зачеплене | 4 год            |
| **Cached node_modules**      | `actions/setup-node` з cache                                      | 30 хв (мабуть є) |
| **Cached pnpm store**        | Окремо від node_modules                                           | 30 хв            |
| **Required checks rules**    | Branch protection: lint + typecheck + test required               | 30 хв            |

### 5.2. Інструменти

| Tool                        | What                                           | Cost      |
| --------------------------- | ---------------------------------------------- | --------- |
| **Renovate**                | Auto-PR для оновлень (потужніше за Dependabot) | $0        |
| **release-please** (Google) | Auto-changelog + auto-versioning monorepo      | $0        |
| **semantic-release**        | Альтернатива                                   | $0        |
| **changesets**              | Інтерактивний versioning для monorepo          | $0        |
| **CodeQL**                  | Security scanning від GitHub                   | $0        |
| **Codespaces**              | Cloud dev env інтегрована з PR                 | $4-15/міс |

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

**Статус (2026-05-02):** integration готова на всіх трьох клієнтах. `SENTRY_DSN` виставлено на Railway (server) ✅, `VITE_SENTRY_DSN` виставлено на Vercel (web) ✅. `EXPO_PUBLIC_SENTRY_DSN` (mobile) — ще не виставлено в Expo EAS Secrets, mobile помилки не агрегуються. Beforesend-фільтр у server (`sentry.ts`) стрипає cookies/auth + email хеш-логуючи.

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

| Tool                    | What                        | Cost         |
| ----------------------- | --------------------------- | ------------ |
| **Better Stack Uptime** | Uptime monitoring + on-call | $34/міс      |
| **UptimeRobot**         | Безкоштовний uptime ping    | $0           |
| **Healthchecks.io**     | Cron + heartbeat monitoring | $0 free tier |
| **Pingdom**             | Premium                     | $15/міс      |

**Sergeant priority:** UptimeRobot на `/health` — настройти за 5 хв.

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

| Tool                         | What                  |
| ---------------------------- | --------------------- |
| **Lighthouse CI**            | Synthetic perf на PR  |
| **Sentry Performance**       | RUM + traces          |
| **Vercel Speed Insights**    | Vercel-native RUM     |
| **Cloudflare Web Analytics** | RUM, privacy-friendly |

---

## 7. База даних

### 7.1. Postgres-інструменти

| Tool                   | What                            | Cost           |
| ---------------------- | ------------------------------- | -------------- |
| **PgHero**             | Performance dashboard           | $0             |
| **pg_stat_statements** | Slow query identification       | $0 (extension) |
| **pgBouncer**          | Connection pooling              | $0             |
| **Atlas** (atlasgo.io) | Schema-as-code, drift detection | $0 / $30/міс   |
| **dbmate**             | Migrations CLI (lightweight)    | $0             |
| **squawk**             | Lint SQL migrations for safety  | $0             |
| **Prisma**             | TS ORM з migrations             | $0             |
| **Drizzle**            | TS ORM, simpler than Prisma     | $0             |
| **Kysely**             | Type-safe SQL builder, no ORM   | $0             |

**Sergeant priority:**

- **squawk** lint у CI на migrations — ловить `DROP COLUMN`, `ALTER без CONCURRENTLY` тощо.
- **pg_stat_statements** на проді — знайти повільні queries (за 1 день логів зазвичай 5+ кандидатів).
- **Drizzle** як step-up з raw SQL — поетапно, не одразу.

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

| Practice                             | Tool                                                                                                        | Effort       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------ |
| Dependency CVE scanning              | Renovate `vulnerabilityAlerts` (✅ enabled у [#721](https://github.com/Skords-01/Sergeant/pull/721)) / Snyk | 30 хв        |
| Secrets pre-commit hook              | git-secrets / gitleaks / trufflehog                                                                         | 30 хв        |
| HTTP security headers                | helmet.js (Express)                                                                                         | 1 год        |
| CORS strict whitelist                | manual config                                                                                               | 30 хв        |
| Rate limiting                        | ✅ Власний `apps/server/src/http/rateLimit.ts` (Redis-backed через `ioredis`, in-memory fallback)           | done         |
| HttpOnly + Secure + SameSite cookies | manual config                                                                                               | 30 хв        |
| Strong password hashing              | Better Auth (handle-ить argon2)                                                                             | already done |
| HTTPS everywhere                     | Railway / Vercel automatic                                                                                  | done         |

### 8.2. Nice-to-have

| Tool              | What                            | Cost             |
| ----------------- | ------------------------------- | ---------------- |
| **Snyk**          | Comprehensive security scanning | $0 / $25/міс     |
| **OWASP ZAP**     | Penetration testing             | $0               |
| **trivy**         | Container security              | $0               |
| **trufflehog**    | Secrets in git history scan     | $0               |
| **CodeQL**        | GitHub native                   | $0               |
| **1Password CLI** | Secrets injection in shell      | $3/міс           |
| **Doppler**       | Centralized secrets             | $0 / $7/user/міс |
| **Infisical**     | Open-source Doppler alternative | $0 / $9/user/міс |

### 8.3. Аудити

- Раз на півроку — security audit (manual review або external).
- Раз на квартал — `pnpm audit` review + critical CVE patches.
- Penetration testing раз на рік (для production app з reali users).

---

## 9. Performance

### 9.1. Frontend

| Tool                          | What                        |
| ----------------------------- | --------------------------- |
| **rollup-plugin-visualizer**  | Bundle analyzer для Vite    |
| **Lighthouse CI**             | Perf budget на PR           |
| **Core Web Vitals tracking**  | LCP, CLS, INP               |
| **React DevTools Profiler**   | Identify slow renders       |
| **why-did-you-render**        | Find unnecessary re-renders |
| **Million.js**                | React optimization compiler |
| **React Compiler** (React 19) | Auto-memoization            |

**Sergeant priority:** Bundle visualizer — швидко знайдеш зайві 100KB.

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

- [ ] Sentry + source maps upload
- [ ] Vercel Pro plan upgrade
- [ ] Knip + depcheck + видалення dead code
- [x] Renovate setup ([#721](https://github.com/Skords-01/Sergeant/pull/721))
- [ ] Turbo remote cache
- [ ] AGENTS.md (з #711)
- [ ] CONTRIBUTING.md з 5-хв quickstart
- [ ] UptimeRobot на /health

### Тиждень 2 — type safety

- [x] Strict TypeScript step 1: `strictNullChecks` для одного package — done у `apps/web/tsconfig.strict.json` (`src/shared/**`)
- [x] Strict TypeScript phases 2–3.1: `strictNullChecks` розширено на весь `src/{test,core/*,modules/*}` (apps/web), плюс `tsconfig.noimplicitany.json` для частини core+modules (див. `docs/tech-debt/frontend.md` §11). Phase 4 in progress — PR1 [#1388](https://github.com/Skords-01/Sergeant/pull/1388) ✅ і PR2 [#1391](https://github.com/Skords-01/Sergeant/pull/1391) ✅ змерджені, PR3 (fizruk pages + insights, −55) у роботі (419 → 194 помилок); залишилось PR4 (flip `strict: true` + зняти `allowJs`).
- [ ] Snapshot tests на server serializers (з #711)
- [ ] Custom ESLint rule `no-bigint-string`
- [ ] zod-to-openapi proof-of-concept

### Тиждень 3 — testing

- [ ] Testcontainers для server tests
- [ ] MSW для frontend tests
- [ ] Activate Playwright E2E на PR
- [ ] PostHog setup + 5 key events tracking

### Тиждень 4 — observability

- [ ] Pino structured logging migration (якщо ще не)
- [ ] pg_stat_statements на проді
- [ ] squawk lint у CI на migrations
- [ ] size-limit + bundle-analyzer

### Місяць 2 — інвестиції

- [ ] Argos visual regression
- [ ] Storybook setup для shared components
- [ ] Strict TypeScript повне покриття
- [ ] Devcontainer для local dev (docker-compose вже на місці — кореневий `docker-compose.yml`)
- [ ] Drizzle migration POC (один модуль)

### Підтримка (неперервно)

- [ ] Quarterly security audit
- [ ] Quarterly recovery drill (DB backup restore)
- [ ] Monthly tech debt review
- [ ] Weekly metrics check (CI fail rate, time-to-PR, etc.)

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

### 2026-04-25 — інфра-спринт

8 PR замерджено, 5 пунктів топ-15 закрито. Хронологія:

| PR                                                     | Що                                                               | Roadmap         | Тривалість |
| ------------------------------------------------------ | ---------------------------------------------------------------- | --------------- | ---------- |
| [#714](https://github.com/Skords-01/Sergeant/pull/714) | `AGENTS.md` + PR template "How AI-tested"                        | #8              | паралельно |
| [#715](https://github.com/Skords-01/Sergeant/pull/715) | AI markers + ESLint rule `sergeant-design/ai-marker-syntax`      | (ai-coding §3)  | паралельно |
| [#716](https://github.com/Skords-01/Sergeant/pull/716) | Knip + depcheck + first-pass dead-code cleanup                   | #2              | паралельно |
| [#717](https://github.com/Skords-01/Sergeant/pull/717) | Activate Playwright E2E на PR (Postgres service + browser cache) | #12             | паралельно |
| [#718](https://github.com/Skords-01/Sergeant/pull/718) | Snapshot tests для `accountsHandler` + `transactionsHandler`     | #10             | паралельно |
| [#719](https://github.com/Skords-01/Sergeant/pull/719) | Оновлення roadmap-ів зі статусом + Status-колонкою               | (meta)          | sequential |
| [#720](https://github.com/Skords-01/Sergeant/pull/720) | Fix `vitest.base.ts` ESM (всі 13 пакетів падали на startup)      | (infra unblock) | sequential |
| [#721](https://github.com/Skords-01/Sergeant/pull/721) | Renovate config (заміна Dependabot)                              | #7              | sequential |

**Bonus discoveries (поза планом):**

- `pnpm test` на main був повністю зламаний з commit `dab67bdc` через `ERR_UNKNOWN_FILE_EXTENSION` для `packages/config/vitest.base.js`. Native Node ESM loader не вміє резолвити `.ts` через package exports. Fixed у [#720](https://github.com/Skords-01/Sergeant/pull/720): конвертація у `.js` з JSDoc-типами. Без цього #721 (і всі наступні PR) теж не пройшли б CI.
- AGENTS.md з [#714](https://github.com/Skords-01/Sergeant/pull/714) був закомічений без `prettier --write`; виправлено у [#719](https://github.com/Skords-01/Sergeant/pull/719) разом з doc-апдейтами.

**Що НЕ робили і чому:**

- #1 Sentry, #5 Vercel Pro, #13 PostHog — потребують credentials/credit card мейнтейнера.
- #3 Strict TypeScript, #4 Testcontainers, #11 Pino — кожне 4-8 годин роботи; залишено на наступні спринти.
- #15 CONTRIBUTING.md — найдешевший залишковий win, але вирішено зробити Renovate першим (безпека).

**Метрики до/після:**

| Метрика                     | До 2026-04-25               | Після                                  |
| --------------------------- | --------------------------- | -------------------------------------- |
| Топ-15 закрито              | 0/15                        | 5/15                                   |
| `pnpm test` працює          | ❌ (всі 13 пакетів падають) | ✅ (12/13; mobile flaky per AGENTS.md) |
| Smoke E2E у PR              | ⏭️ skipped                  | ✅ runs                                |
| `AGENTS.md` контекст для AI | ❌                          | ✅                                     |
| AI markers convention       | ❌                          | ✅ + lint warn                         |
| Snapshot захист API форм    | 0 endpoint-ів               | 2 endpoint-и Mono                      |
| Auto-PR для оновлень        | ❌                          | ✅ Renovate (Mon 6am EU/Kyiv)          |
| Dead-code detection         | manual                      | Knip + depcheck                        |

**Поточні pre-merge checks на PR:**

1. `Smoke E2E (Playwright)` ([#717](https://github.com/Skords-01/Sergeant/pull/717))
2. `Test coverage (vitest)` ([dab67bdc](https://github.com/Skords-01/Sergeant/commit/dab67bdc), unblocked by [#720](https://github.com/Skords-01/Sergeant/pull/720))
3. `check` (`format:check && lint && typecheck && test && build`)
4. `Vercel — sergeant` (rate-limited на free, потребує #5 Vercel Pro)
5. CodeRabbit + Devin Review (AI коментарі, не блокують)

**Наступні логічні кроки** (у порядку вартості/користі):

1. **#15 CONTRIBUTING.md + 5-min quickstart** — найдешевший win, ~1 год.
2. **#11 Pino structured logging** — 4 год, але **розблокує** Sentry і PostHog (треба структуровані логи з request-id перш ніж їх десь агрегувати).
3. **#4 Testcontainers** — 4 год, посилює #10 (snapshot тести з реальним Postgres у CI ловлять ще більше регресій).
4. **#6 Turbo remote cache** — 1 год, прискорить CI з ~5 хв до ~1 хв на повторних білдах.
5. **#9 MSW + #14 size-limit** — frontend тести і bundle budget, по 2-4 год кожне.

**Dependent на платних сервісах** (черга на коли мейнтейнер додасть credit card):

- [ ] #5 Vercel Pro ($20/міс) — розблокує preview deploy на PR
- [ ] #1 Sentry ($26/міс) — потребує #11 Pino перш ніж приносити користь
- [ ] #13 PostHog ($0 free tier) — теж краще з #11

### Документи що оновились разом

- `docs/planning/ai-coding-improvements.md` — TL;DR таблиця з Status-колонкою, прогрес-блок, маркери ✅ на блоках 1, 3, 4.2, 4.5, implementation checklist з лінками на PR.
- `docs/planning/dev-stack-roadmap.md` — TL;DR з Status-колонкою (5/15 done), §3.1 Static analysis і §4.1 Test infrastructure з ✅, §8.1 Security оновлений з Renovate vulnerabilityAlerts.
- `docs/integrations/renovate-usage.md` — новий файл, як працювати з Renovate-PR-ами щодня.

### 2026-04-25 (вечір) — друга хвиля + продуктова фіча

Запущено три паралельні child-сесії після оновлення статусів у [#733](https://github.com/Skords-01/Sergeant/pull/733), плюс одна продуктова фіча в чаті:

| PR                                                     | Що                                                                                    | Roadmap                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------- |
| [#737](https://github.com/Skords-01/Sergeant/pull/737) | `hotfix-prod-regression.md` + `add-monobank-event-handler.md` playbooks               | ai-coding §2 (✅ full) |
| [#738](https://github.com/Skords-01/Sergeant/pull/738) | Pino + `pino-http` middleware у `apps/server/src/obs/logger.ts`, regenerated licenses | #11                    |
| [#740](https://github.com/Skords-01/Sergeant/pull/740) | `size-limit` budget на `apps/web` + `Bundle size guard` CI step                       | #14                    |
| [#743](https://github.com/Skords-01/Sergeant/pull/743) | HubChat **Quick Actions v1** (chip-секція + action cards у чаті)                      | (продуктова фіча)      |

**Прогрес топ-15:** 9/15 → **11/15**.

**Bonus:**

- Vercel preview rate-limit лишається активний (free tier) — це неблокуюче, бо Smoke E2E запускається проти локально стартованого preview.
- License policy CI крок один раз падав на #743 через регенерацію `THIRD_PARTY_LICENSES.md` у #738; merge-up закрив проблему.

**Що залишилось без credentials:**

- #3 Strict TypeScript (incremental, починаючи зі `strictNullChecks`).
- #13 PostHog (free tier) — тепер легко завдяки структурованим логам з #11.

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
