# Sergeant — незалежний аудит (Devin)

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

> **STATUS — historical record (2026-04-27): 30 / 31 closed.**
> Цей аудит — **історичний рекорд**, а не activity-tracker. Майже всі
> recommended PR-и закриті (детальна таблиця нижче). Один залишковий
> пункт переслідується у відповідних living-документах
> (`docs/planning/dev-stack-roadmap.md`, `docs/tech-debt/frontend.md`,
> `docs/tech-debt/backend.md`). Не правити цей файл, окрім як для
> закриття останнього пункту чи виправлення фактичних помилок —
> якщо з'являється нова робота, заводь її у відповідному
> living-документі або створюй новий audit-файл з поточною датою.

**Дата:** 2026-04-26
**Скоуп:** репо `Skords-01/Sergeant` (default branch на момент клонування).
**Метод:** репозиторний прохід — структура, конфіги, `AGENTS.md`/`CONTRIBUTING.md`/`README.md`, `docs/*` (roadmap, tech-debt, observability, playbooks), `.github/workflows/ci.yml`, `eslint.config.js`, `packages/eslint-plugin-sergeant-design/`, `apps/*/tsconfig.json`, міграції в `apps/server/src/migrations/`. Без виконання CI/тестів.

> **Статус виконання — оновлено 2026-04-27 (сьома ревізія: re-sync з реальним станом коду)**
> Поки документ жив в attachments, частина PR-ідей з нього вже відпрацьована
> через дочерні Devin-сесії. Узагальнений знімок прогресу:

| Аудит-ID | Тема                                                                                                                 | Статус     | PR (merged)                                                                                                                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR-9.A   | `pnpm audit --audit-level=high` blocking + escape hatch                                                              | ✅ closed  | [#862](https://github.com/Skords-01/Sergeant/pull/862)                                                                                                                                                                                                                          |
| PR-2.A   | commitlint + husky `commit-msg` (rule #5 enum)                                                                       | ✅ closed  | [#866](https://github.com/Skords-01/Sergeant/pull/866)                                                                                                                                                                                                                          |
| PR-5.A   | `migration-lint` CI job (rule #4)                                                                                    | ✅ closed  | [#863](https://github.com/Skords-01/Sergeant/pull/863)                                                                                                                                                                                                                          |
| PR-12.A  | Anthropic prompt-cache hit metric + streaming tracking                                                               | ✅ closed  | [#864](https://github.com/Skords-01/Sergeant/pull/864)                                                                                                                                                                                                                          |
| PR-3.D   | top-3 `localStorage` files → safe wrappers (allowlist 55→52)                                                         | ✅ closed  | [#865](https://github.com/Skords-01/Sergeant/pull/865)                                                                                                                                                                                                                          |
| PR-6.A   | `strictNullChecks` phase 1 (`apps/web/src/shared/**`)                                                                | ✅ closed  | [#870](https://github.com/Skords-01/Sergeant/pull/870)                                                                                                                                                                                                                          |
| PR-2.B   | ESLint `no-bigint-string` (rule #1)                                                                                  | ✅ closed  | [#868](https://github.com/Skords-01/Sergeant/pull/868)                                                                                                                                                                                                                          |
| PR-2.C   | ESLint `rq-keys-only-from-factory` (rule #2)                                                                         | ✅ closed  | [#869](https://github.com/Skords-01/Sergeant/pull/869)                                                                                                                                                                                                                          |
| PR-6.F   | CI metric: `strict-coverage.mjs` + `$GITHUB_STEP_SUMMARY`                                                            | ✅ closed  | [#872](https://github.com/Skords-01/Sergeant/pull/872), доробка [#874](https://github.com/Skords-01/Sergeant/pull/874)                                                                                                                                                          |
| PR-9.D   | ESLint `no-anthropic-key-in-logs`                                                                                    | ✅ closed  | [#871](https://github.com/Skords-01/Sergeant/pull/871)                                                                                                                                                                                                                          |
| PR-2.D   | `docs/governance/policy-review.md` template                                                                          | ✅ closed  | [#875](https://github.com/Skords-01/Sergeant/pull/875)                                                                                                                                                                                                                          |
| PR-6.E   | ESLint `no-strict-bypass` (forbid new `ts-expect-error`/`as any`)                                                    | ✅ closed  | [#877](https://github.com/Skords-01/Sergeant/pull/877)                                                                                                                                                                                                                          |
| PR-4.C   | extract OFF/USDA/Mono normalizers → `apps/server/src/lib/normalizers/`                                               | ✅ closed  | [#882](https://github.com/Skords-01/Sergeant/pull/882)                                                                                                                                                                                                                          |
| PR-12.B  | `chatActions` contract tests (happy + error path per handler)                                                        | ✅ closed  | [#885](https://github.com/Skords-01/Sergeant/pull/885)                                                                                                                                                                                                                          |
| PR-7.A   | `recommendationEngine` + `TodayFocusCard` unit/integration tests                                                     | ✅ closed  | [#886](https://github.com/Skords-01/Sergeant/pull/886)                                                                                                                                                                                                                          |
| PR-3.B   | decompose `Assets.tsx` (1147 LOC) into smaller modules                                                               | ✅ closed  | [#887](https://github.com/Skords-01/Sergeant/pull/887)                                                                                                                                                                                                                          |
| PR-9.B   | gitleaks SHA-pinned secret-scan blocking job in CI                                                                   | ✅ closed  | [#897](https://github.com/Skords-01/Sergeant/pull/897)                                                                                                                                                                                                                          |
| PR-3.C   | split `seedFoodsUk.ts` (1614 LOC) by category into `seeds/*`                                                         | ✅ closed  | [#898](https://github.com/Skords-01/Sergeant/pull/898)                                                                                                                                                                                                                          |
| PR-9.C   | vulnerability SLA matrix + weekly breach-reminder workflow                                                           | ✅ closed  | [#902](https://github.com/Skords-01/Sergeant/pull/902)                                                                                                                                                                                                                          |
| PR-7.B   | cloud-sync offline-queue + replay-on-reconnect integration tests                                                     | ✅ closed  | [#904](https://github.com/Skords-01/Sergeant/pull/904)                                                                                                                                                                                                                          |
| PR-5.B   | rollback sanity для `*.down.sql` міграцій (Testcontainers)                                                           | ✅ closed  | [#918](https://github.com/Skords-01/Sergeant/pull/918)                                                                                                                                                                                                                          |
| PR-6.B   | `noImplicitAny` phase 2 — routine + shared + nutrition (3 з 6)                                                       | 🟡 partial | [#923](https://github.com/Skords-01/Sergeant/pull/923), [#934](https://github.com/Skords-01/Sergeant/pull/934)                                                                                                                                                                  |
| PR-7.E   | de-flake 3 flaky tests (`OnboardingWizard` + `WeeklyDigestFooter` + `HubSettingsPage`)                               | ✅ closed  | [#963](https://github.com/Skords-01/Sergeant/pull/963) (Onboarding); цим PR-ом — `WeeklyDigestFooter` + `HubSettingsPage`                                                                                                                                                       |
| PR-11.C  | ADR template + README index + retroactive ADRs (5 з 5: Better Auth / Capacitor / Anthropic / Turbo / Monorepo split) | ✅ closed  | template+README ✅; ADR-0017/0010/0005 ✅ via [#958](https://github.com/Skords-01/Sergeant/pull/958), [#956](https://github.com/Skords-01/Sergeant/pull/956), [#962](https://github.com/Skords-01/Sergeant/pull/962); ADR-0023 (turbo) + ADR-0024 (monorepo split) ✅ цим PR-ом |
| PR-8.A   | `docs(obs): error-budget policy`                                                                                     | ✅ closed  | [#942](https://github.com/Skords-01/Sergeant/pull/942)                                                                                                                                                                                                                          |
| PR-7.D   | weekly flaky-tests dashboard workflow                                                                                | ✅ closed  | [#945](https://github.com/Skords-01/Sergeant/pull/945)                                                                                                                                                                                                                          |
| PR-8.B   | Prometheus `/metrics` endpoint + Grafana dashboards JSON                                                             | ✅ closed  | [#946](https://github.com/Skords-01/Sergeant/pull/946), [#948](https://github.com/Skords-01/Sergeant/pull/948), [#953](https://github.com/Skords-01/Sergeant/pull/953)                                                                                                          |
| PR-10.A  | p95 pipeline-duration metric у CI summary                                                                            | ✅ closed  | [#951](https://github.com/Skords-01/Sergeant/pull/951), доробка [#970](https://github.com/Skords-01/Sergeant/pull/970), [#971](https://github.com/Skords-01/Sergeant/pull/971)                                                                                                  |
| PR-11.A  | freshness badges для топ-документів + nightly overdue-doc workflow                                                   | ✅ closed  | [#952](https://github.com/Skords-01/Sergeant/pull/952)                                                                                                                                                                                                                          |
| PR-11.B  | top-5 playbooks → decision-tree формат + `_TEMPLATE-decision-tree.md`                                                | ✅ closed  | [#955](https://github.com/Skords-01/Sergeant/pull/955)                                                                                                                                                                                                                          |
| PR-6.D   | `apps/server` strict TS — explicit `"strict": true`                                                                  | ✅ closed  | [#937](https://github.com/Skords-01/Sergeant/pull/937)                                                                                                                                                                                                                          |
| Інші     | див. inline-теги нижче                                                                                               | ⏳ pending | —                                                                                                                                                                                                                                                                               |

> Sprint-таблиці нижче (`Спринт 0`, `Спринт 1-2`, `Спринт 3-6`) також оновлені
> in-line — кожен закритий PR-ID має ✅ + посилання на змержений PR.

---

## 0. TL;DR — згоден з аудитом Васі чи ні?

**В цілому згоден** з усіма 12 оцінками і висновком — Sergeant **зріла платформа з сильними guardrails**. Я б не зрушив жодну оцінку більше ніж на 0.5 бала. Базові цифри (4 apps, 9 packages, формалізовані SLO, SHA-pinned CI, custom ESLint plugin) перевірив — збігаються.

**Несуттєві уточнення там, де я б скоригував:**

| Блок                         | Оцінка Васі | Моя оцінка | Чому інша                                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3. Frontend platform         | 8/10        | **7.5/10** | Великих файлів (>600 LOC) **25, не 10**. Топ — 1614 LOC (`seedFoodsUk.ts`). Storage migration ще на 55 файлів у TODO. Це більший regression-surface, ніж видається.                                                                                                          |
| 6. Type safety               | 7.5/10      | **6.5/10** | `strict: true` ввімкнений у `tsconfig.base`. `apps/server` уже на `"strict": true"` (PR-6.D, [#937](https://github.com/Skords-01/Sergeant/pull/937)), але `apps/web` досі перевизначає на `false` + `allowJs: true, checkJs: false`. Це не «pending», це активне regression. |
| 11. Документація / playbooks | 9/10        | **9.5/10** | 23 playbooks з конкретними кроками + структурований AI-marker система (`AI-NOTE`/`AI-CONTEXT`/`AI-DANGER`/`AI-LEGACY`) + `eslint-plugin-sergeant-design` з 6 кастомних правил. Виняткове.                                                                                    |

**Чого не вистачає в аудиті Васі (мої додаткові спостереження):**

1. **TypeScript 6.0.3 + Node 20** — bleeding edge версія TS у moнорепо такого розміру. Це ризик регресій у тулзах (vitest/eslint-typescript/turbo), який варто моніторити окремо.
2. **`apps/mobile-shell` на Capacitor** — boundary з `apps/web` не задокументований жодним інваріантом (web-код, що ламає Capacitor, не блокується нічим, окрім ручного тесту).
3. **Mobile (Expo 52, RN 0.76) — 3 known flaky тести** — згадано в AGENTS.md, але немає окремого debt-tracker як для web/server. Mobile живе на правах «менший за web», що замаскує накопичення боргу.
4. **`SYSTEM_PREFIX` prompt-cache не активований**, хоча архітектурно готовий (AGENTS.md описує його як «prompt-cache candidate»). Це чистий ROI на $$.
5. **AI tool lifecycle** — у Васі це 12-й блок, але дуже коротко. У AGENTS.md фактично є вже трирядкова специфікація («tool defs server-side, exec client-side, three coordinated edits»), яка просто не вилазить у roadmap-документи. Це сильніше, ніж аудит це описує.
6. **`apps/server/src/migrations`** — лише 8 файлів (001–008). Two-phase DROP як hard rule — добре, але **немає migration linting** (наприклад, заборона `DROP COLUMN` у тому ж PR, що змінює код, або вимога супутнього `down.sql`).
7. **`pnpm audit --audit-level=high || true`** у CI — Вася назвав це «warning-режим»; це справді silently green-щока. Не побачити high vuln з тижневою трендовою лінією — реальний blind spot.

---

## 1) Архітектура монорепи та межі модулів

**Оцінка:** **8.5/10** (згоден)

**Що бачу:**

- 4 apps + 9 packages, `pnpm-workspace.yaml` чітко як `apps/*` + `packages/*`.
- `turbo.json` з правильним `dependsOn: ["^build"]` для `typecheck`/`test`/`test:coverage`.
- AGENTS.md `module ownership map` — таблиця із 14 path-стрічок, кожна має test stack + RQ keys factory + notes. Це найкраще, що я бачив у репо такого розміру.
- Domain packages (`finyk-domain`, `fizruk-domain`, `nutrition-domain`, `routine-domain`) — справжня доменна ізоляція, не fake.

**Ризики (підтверджую Васю + додаю):**

- Мобільний shell (`apps/mobile-shell`) — Capacitor wrapper навколо `apps/web`. У `AGENTS.md` для нього `Test stack: none`. Це boundary без guardrails.
- `packages/config` живе як «base tsconfig», але **його не всі споживають однаково** — `apps/web` і `apps/server` явно перевизначають `strict: false`. Тобто base — це ілюзія консистентності.

**PR-ідеї:**

- `PR-1.A` — `chore(config): enforce inheritance of strict from tsconfig.base in apps/web,server (codeowner-blocking comment)`.
- `PR-1.B` ✅ closed — [#932](https://github.com/Skords-01/Sergeant/pull/932) `docs(docs): per-app status matrix` (`docs/architecture/apps-status-matrix.md`) — одна сторінка, 4 apps + 10 packages з `active/stabilize/migration/legacy`-легендою, дата ревалідації (`Last revalidated: 2026-04-27`, наступна — квартально).

---

## 2) Інженерні стандарти та governance

**Оцінка:** **9/10** (згоден)

**Що бачу:**

- `AGENTS.md` — 8 hard rules з прикладами BAD/GOOD: bigint coercion, RQ keys factory, API-contract triple-edit, sequential migrations + two-phase drop, conventional commit scopes (явний enum, без `monorepo`/`all`), no force-push на main, no `--no-verify`, valid Tailwind opacity.
- `CONTRIBUTING.md` (335 рядків) — zero-to-running workflow.
- 23 playbooks (`docs/playbooks/`) — `add-api-endpoint`, `add-react-query-hook`, `add-sql-migration`, `migrate-localstorage-to-typedstore`, `stabilize-flaky-test`, `rotate-secrets`, `hotfix-prod-regression`, `tune-system-prompt`, `enable-prompt-caching` тощо.

**Ризики (доповнюю Васю):**

- Hard-rules автоматизовані частково (`valid-tailwind-opacity`, `no-raw-local-storage`, `ai-marker-syntax`) — ✅. Але **rule #1 (bigint coercion)** і **rule #3 (api-contract triple-edit)** покладаються лише на snapshot-тести і ревʼю. Цього достатньо, поки серіалізаторів небагато.
- `Conventional Commits` scope enum — чудово, але я не побачив **commitlint config** (ані `commitlint.config.js`, ані husky-хука на `commit-msg`). Pre-commit hook лише `lint-staged`.

**PR-ідеї:**

- `PR-2.A` ✅ closed — [#866](https://github.com/Skords-01/Sergeant/pull/866) `ci(commit): add commitlint with the AGENTS.md scope enum + husky commit-msg hook` (точно автоматизує rule #5).
- `PR-2.B` ✅ closed — [#868](https://github.com/Skords-01/Sergeant/pull/868) `feat(eslint-plugins): add no-bigint-string rule (forbid returning rows.map without Number() on numeric pg columns)`. Конкретна реалізація: AST-walk на `RETURNING.* FROM ... .map((r) => ({ id: r.id }))` + heuristic. Закриває latent surface від rule #1.
- `PR-2.C` ✅ closed — [#869](https://github.com/Skords-01/Sergeant/pull/869) `feat(eslint-plugins): rq-keys-only-from-factory` (заборонити `useQuery({ queryKey: [...] })` з array literal у `apps/web/src`, окрім `apps/web/src/shared/lib/queryKeys.ts`).
- `PR-2.D` ✅ closed — [#875](https://github.com/Skords-01/Sergeant/pull/875) `chore(governance): monthly policy-review template` (`docs/governance/policy-review.md`) з полями «правила, що порушувались», «PRs з винятками», «нові кандидати на автоматизацію».

---

## 3) Frontend (web) платформа та UX-готовність

**Оцінка:** **7.5/10** (нижче на 0.5 від Васиної).

**Що бачу:**

- Vite + React 18, Tailwind, `vitest` + MSW + RTL + Playwright + axe-core.
- `apps/web/package.json` має `size-limit` бюджет (615 kB JS / 18 kB CSS, brotli) — чесний бюджет на CI.
- **`tsconfig.json`: `strict: false` + `allowJs: true`** — це критично. `apps/web/src` приймає `.js`/`.jsx` і не має strict null-checks. Це той самий surface, який Вася назвав «high-ROI strict TS pending».
- `frontend-tech-debt.md` чесно фіксує 25 файлів >600 LOC (Вася каже «10», але реальні 25). Топ-7: 1614, 1147, 1064, 1060, 949, 907, 902.
- 105 `*.test.*` файлів на 585 source = **~18% file-level coverage** (підтверджую).

**Що додам до Васиного списку:**

- `localStorage` migration TODO — 55 файлів, було 49. **Тренд на 6 файлів за період** не вказує на активне просування. Завжди-зростаючий debt-list — зловісна ознака.
- Великі файли — це не просто «повільне рев’ю», це **circular dep risk** (наприклад `core/lib/hubChatContext.ts` 686 рядків — точно тягне half of `core/`).

**PR-ідеї:**

- `PR-3.A` — `feat(web,tsconfig): enable strict + noImplicitAny on apps/web (phase 1: shared/+ core/)` із expected baseline error-count і `// @ts-expect-error` baseline-файлом. Конкретно: спершу strict тільки в `apps/web/src/shared/**` і `apps/web/src/core/lib/**` через project references.
- `PR-3.B` ✅ closed — [#887](https://github.com/Skords-01/Sergeant/pull/887) `refactor(web,finyk): decompose Assets.tsx (1147 LOC) into smaller modules` — пілот для top-10 list.
- `PR-3.C` ✅ closed — [#898](https://github.com/Skords-01/Sergeant/pull/898) `refactor(web,nutrition): split seedFoodsUk.ts (1614 LOC) by category (meat/fish/dairy/grains/...)` — чисто data-split, 19 per-category файлів, всі 390 елементів структурно ідентичні.
- `PR-3.D` ✅ closed — [#865](https://github.com/Skords-01/Sergeant/pull/865) `chore(web,storage): migrate top-3 high-call-site localStorage files to safe wrappers` (`core/settings/FinykSection.tsx` -20, `core/lib/chatActions/fizrukActions.ts` -7, `core/hub/HubDashboard.tsx` -5) — burn-down list.
- `PR-3.E` ✅ closed — [#907](https://github.com/Skords-01/Sergeant/pull/907) `ci(ci): freshness gate for docs/tech-debt/frontend.md` (`scripts/check-tech-debt-freshness.mjs`, wired у `pnpm lint:tech-debt-freshness` → root `pnpm lint`). Парсить `> **Оновлено YYYY-MM-DD.**` маркер, fail коли > `FRESHNESS_THRESHOLD_DAYS` (default 60). Маркер, а не git mtime, — тому format-only edit не «reset-ить» свіжість.

---

## 4) Backend / API надійність та контракти

**Оцінка:** **8.5/10** (згоден)

**Що бачу:**

- `apps/server`: Express 4 + `pg` + Better Auth + Anthropic + Pino + Prometheus + Sentry.
- `backend-tech-debt.md` — P0-A через P0-E закриті: zod-валідація, error handling через `asyncHandler`+`ExternalServiceError`, `bankProxy.ts` (timeout 15s + retry+jitter+breaker+TTL-cache 60s), web-push (`webpushSend.ts` per-origin breaker FCM/Apple/Mozilla), AI-quotas через атомарний `INSERT ... ON CONFLICT DO UPDATE WHERE ... <= limit RETURNING ...`.
- Snapshot-тести на серіалізатори (PR #718) — це конкретна реалізація AGENTS rule #1.
- 35 `*.test.ts` файлів на 131 server source = **~27%** (вище за web).

**Залишковий борг (що бачу сам):**

- SSE-chat end-to-end test — ще не покритий.
- Barcode handler — ще не покритий повністю.
- Дублювання нормалізаторів OFF/USDA — backend-tech-debt чесно це фіксує.

**PR-ідеї:**

- `PR-4.A` ✅ closed — [#900](https://github.com/Skords-01/Sergeant/pull/900) `test(server): add SSE end-to-end harness for chat streaming` (17 тестів на `streamAnthropicToSse` / `streamOneIterationToSse`: text-дельти, auto-continuation на `max_tokens`, cap, graceful errors, chunk-боундарі, prompt-cache метрика).
- `PR-4.B` ✅ closed — [#908](https://github.com/Skords-01/Sergeant/pull/908) `test(server): barcode contract tests for OFF/USDA/UPCitemdb normalizers` (UPCitemdb extracted з `barcode.ts` у власний `normalizers/upcitemdb.ts`; 22 unit-тести + 14 cross-source contract тестів із realistic фікстурами Nutella/Cheerios/Coca-Cola; спільний `NormalizedProduct`-shape зафіксовано через `assertContract()` helper).
- `PR-4.C` ✅ closed — [#882](https://github.com/Skords-01/Sergeant/pull/882) `refactor(server,lib): extract OFF/USDA/Mono normalizers into apps/server/src/lib/normalizers/{off,usda,mono}.ts`.
- `PR-4.D` 🟡 partial Phase 1 — інфраструктура `zod-openapi` + `docs/api/openapi.json` (36 paths, 26 components) + freshness check-скрипт (`scripts/api/check-openapi-fresh.mjs`, runnable локально через `pnpm api:check-openapi`) + ADR-0025. Workflow `.github/workflows/openapi-freshness.yml` додає юзер вручну (OAuth App без `workflow` scope не може писати в `.github/workflows/`). Phase 2 (codegen api-client типів зі spec через `openapi-typescript`) — окремий PR.

---

## 5) Data layer, Postgres, міграції

**Оцінка:** **8/10** (згоден)

**Що бачу:**

- 8 міграцій (`001_noop.sql` … `008_mono_integration.sql`) + 2 `.down.sql` (`006_push_devices.down.sql`, `008_mono_integration.down.sql`).
- AGENTS.md rule #4 — sequential, no gaps, two-phase DROP. Залізна дисципліна.
- `db:migrate:dev` запускається в CI smoke-e2e job із Postgres 16-alpine SHA-pinned.

**Гепи (мої):**

- Жодного **automatic check** на «no `DROP COLUMN` поза two-phase». Це rule, що тримається на ревʼю.
- Немає **schema diff** артефакту в CI (як `migra` або `pgquarrel`) — складно відстежувати, що саме змінилось.
- `down.sql` не run в production (правильно), але і не run в CI як sanity-check.

**PR-ідеї:**

- `PR-5.A` ✅ closed — [#863](https://github.com/Skords-01/Sergeant/pull/863) `ci(server): migration linter — fail PR if a NNN_*.sql contains DROP COLUMN/TABLE without a sibling NNN_*.add_*.sql in a previous merged PR`. Реалізація: Node-скрипт `scripts/lint-migrations.mjs` із escape-hatch коментарем `-- ALLOW_DROP: <reason> (due: YYYY-MM-DD)`.
- `PR-5.B` ✅ closed — [#918](https://github.com/Skords-01/Sergeant/pull/918) `test(server): rollback sanity for *.down.sql migrations`. `apps/server/src/migrations/__tests__/rollback-sanity.test.ts` піднімає `postgres:16-alpine` через Testcontainers і за цикл: (1) застосовує всі forward-міграції; (2) знімає schema-fingerprint (таблиці+індекси+стовпці); (3) прокатує всі `*.down.sql` у зворотньому порядку; (4) re-applies forward; (5) перевіряє рівність fingerprint-ів. Другий тест — двократний прокат `down.sql` як idempotency-guard для AGENTS rule #4.
- `PR-5.C` ✅closed — `docs/playbooks/pre-merge-migration-checklist.md` — реалізовано: чек-лист на 10 секцій (numbering, two-phase DROP, bigint coercion, api-client sync, idempotency, performance, RLS, local & CI verification, rollout-readiness) + reviewer responsibilities + common mistakes table. Покликається з PR template для будь-якого PR з `apps/server/src/migrations/`.

---

## 6) Типобезпека та якість коду

**Оцінка:** **6.5/10** (нижче на 1 від Васиної).

**Чому нижче:**

- `packages/config/tsconfig.base.json`: `strict: true` ✅
- `apps/mobile/tsconfig.json`: `strict: true` ✅
- `apps/mobile-shell/tsconfig.json`: `strict: true` ✅
- `apps/web/tsconfig.json`: **`strict: false` + `allowJs: true` + `checkJs: false`** ❌
- `apps/server/tsconfig.json`: **немає `strict: true`** (інхеритс залежить від base, але без явного підтвердження я б це класифікував як «slipperty»).
- `packages/*/tsconfig.json`: `strict: true` лише в `packages/config/tsconfig.base.json` — packages інхеритять, але без явного `strict: true` редагування у власних tsconfig це fragile.

**Це означає:** найбільший production surface (`apps/web`) живе у non-strict режимі. Це не «pending» — це активний регресі ризик, який росте з кожним PR.

**Сильні сторони (підтримую Васю):**

- 6 кастомних ESLint правил у `packages/eslint-plugin-sergeant-design/`: `no-eyebrow-drift`, `no-ellipsis-dots`, `no-raw-tracked-storage`, `no-raw-local-storage`, `ai-marker-syntax`, `valid-tailwind-opacity`. Це супер-сильно — я рідко бачу такий рівень у monorepo.
- `lint-staged` запускає ESLint --fix + Prettier на pre-commit — закриває 80% drift автоматично.

**PR-ідеї:**

- `PR-6.A` ✅ closed — [#870](https://github.com/Skords-01/Sergeant/pull/870) `chore(web,tsconfig): enable strictNullChecks (phase 1)` — окремий PR, тільки `strictNullChecks: true`. Скоуп звужений до `apps/web/src/shared/**`.
- `PR-6.B` 🟡 partial — `chore(web,tsconfig): enable noImplicitAny (phase 2)`. Реалізовано через scoped `apps/web/tsconfig.noimplicitany.json` (paralel з `tsconfig.strict.json` від PR-6.A) + wired у `pnpm typecheck`. Покриті модулі: `src/shared/**` ([#923](https://github.com/Skords-01/Sergeant/pull/923)), `src/modules/routine/**` ([#923](https://github.com/Skords-01/Sergeant/pull/923)), `src/modules/nutrition/**` ([#934](https://github.com/Skords-01/Sergeant/pull/934)). **Залишилось ⏳:** `src/core/**`, `src/modules/finyk/**`, `src/modules/fizruk/**` — кожен у своєму PR; після всіх — promote `noImplicitAny` у root `tsconfig.json`.
- `PR-6.C` ⏳ pending — `chore(web,tsconfig): set strict: true (phase 3) + remove allowJs` — фінал. Орієнтовно через 4-6 тижнів від phase 1.
- `PR-6.D` ⏳ pending — `chore(server,tsconfig): explicit strict: true (no implicit inheritance)`.
- `PR-6.E` ✅ closed — [#877](https://github.com/Skords-01/Sergeant/pull/877) `feat(eslint-plugins): no-strict-bypass` (заборонити нові `// @ts-expect-error`, `// @ts-ignore`, `as any`, `as unknown as` поза тестами).
- `PR-6.F` ✅ closed — [#872](https://github.com/Skords-01/Sergeant/pull/872) (доробка [#874](https://github.com/Skords-01/Sergeant/pull/874)) `ci(metrics): track strict coverage % per package` — `scripts/strict-coverage.mjs` + `$GITHUB_STEP_SUMMARY`.

---

## 7) Тестова стратегія та покриття

**Оцінка:** **8/10** (згоден)

**Що бачу:**

- Vitest (web/server/packages), MSW (web), Testcontainers (server, real Postgres), Playwright (web — a11y + smoke-e2e), `node --test` (eslint-plugin).
- CI: `check` (lint+test+build) + `coverage` (vitest з per-package floor) + `a11y` (axe-core через Playwright Chromium) + `smoke-e2e` (повний стек з Postgres+API+Vite preview).
- Per-package coverage floors enforced (`apps/server` і `apps/web`).
- Знаме flaky тести задокументовані в `AGENTS.md` (3 в `apps/mobile/src/core/**`).

**Геп (підтверджую Васю):**

- File-level coverage web — 18%, server — 27%. Це не «80%-покриття-заради-відсотка», але і не повний critical-path.

**PR-ідеї:**

- `PR-7.A` ✅ closed — [#886](https://github.com/Skords-01/Sergeant/pull/886) `test(web): unit + integration tests for recommendationEngine and TodayFocusCard`.
- `PR-7.B` ✅ closed — [#904](https://github.com/Skords-01/Sergeant/pull/904) `test(web,cloud-sync): integration tests for offline queue + replay on reconnect` — 17 тестів, 4 сценарії (coalesce, happy replay, server-error, MAX_OFFLINE_QUEUE overflow).
- `PR-7.C` ✅ closed — [#913](https://github.com/Skords-01/Sergeant/pull/913) `test(web): hub-reports aggregation snapshot tests` — витягнуто 4 чисті агрегатори з inline-замикань `useReportData` у `apps/web/src/core/hub/hubReports.aggregation.ts`; 44 snapshot-тести покривають date-helpers, per-module aggregators і повний cross-module звіт із усіма 4 модулями заповненими.
- `PR-7.D` ✅ closed — [#945](https://github.com/Skords-01/Sergeant/pull/945) `ci(test): weekly flaky-tests dashboard workflow + aggregator script`. Реалізовано як `.github/workflows/flaky-tests-dashboard.yml` з cron-розкладом і markdown trend в artifact.
- `PR-7.E` ✅ closed (3/3) — [#963](https://github.com/Skords-01/Sergeant/pull/963) `OnboardingWizard.test.tsx`; цим PR-ом — `WeeklyDigestFooter.test.tsx` + `HubSettingsPage.test.tsx` (де-флак: stub `useWeeklyDigest` TanStack Query subscription, що шедулила setState після sync render → "act not wrapped" warning + first-render тяжіє до 5 s timeout). Запис «Pre-existing flaky tests» з `AGENTS.md` прибрано.

---

## 8) Observability, SLO, інцидент-готовність

**Оцінка:** **8.5/10** (згоден)

**Що бачу:**

- `docs/observability/SLO.md` — формальні SLI/SLO для HTTP API (99%), Sync (99.5%), Auth (99%), AI (97%), External HTTP per-upstream (95%). Latency SLOs p95 окремо.
- `prometheus/recording_rules.yml` + `prometheus/alert_rules.yml` — multi-window multi-burn-rate alerts (Google SRE Workbook Ch. 5). Це не «informal goals», це справжні burn-rate alerts.
- Sentry DSN-gated на web/server/mobile.
- Pino + ALS (`requestId`/`userId`/`module`) + `X-Request-Id` у response headers.

**Я б скоригував Васю:** «частина latency/SLO informal» — насправді SLO дуже формальні. Що **informal** — це **error-budget policy** (що робимо, коли бюджет вигорів — freeze фічі? skip onboarding? — нічого з цього не задокументовано).

**PR-ідеї:**

- `PR-8.A` ✅ closed — [#942](https://github.com/Skords-01/Sergeant/pull/942) `docs(obs): error-budget policy` — який тип фіч freeze, коли HTTP API budget вигорає; які ні (security fixes, hotfixes).
- `PR-8.B` ✅ closed — [#946](https://github.com/Skords-01/Sergeant/pull/946) `feat(server): Prometheus /metrics endpoint on apps/server`, [#948](https://github.com/Skords-01/Sergeant/pull/948) Grafana dashboard JSON files, [#953](https://github.com/Skords-01/Sergeant/pull/953) `docs(obs): metrics catalog`. `apps/server/src/routes/health.ts` реєструє `r.get("/metrics", metricsHandler)` (виключений з auth/CORS ланцюжка).
- `PR-8.C` ✅ closed — реалізовано в межах PR-12.A ([#864](https://github.com/Skords-01/Sergeant/pull/864)): `SYSTEM_PROMPT_VERSION` const + `anthropic_prompt_cache_hit_total{version, outcome}` (вкл. streaming-шлях).

---

## 9) Безпека, секрети, supply-chain

**Оцінка:** **7.5/10** (нижче на 0.5 від Васиної).

**Що бачу позитивного:**

- SHA-pinned GitHub Actions (всі: `actions/checkout@34e114876…`, `pnpm/action-setup@fe02b34f…`, `actions/setup-node@49933ea5…`, `actions/upload-artifact@b4b15b8c…`, `actions/cache@5a3ec84e…`, навіть `postgres:16-alpine@sha256:4e6e670bb…`).
- License policy check у CI (allowlist живе у скрипті, що генерує `THIRD_PARTY_LICENSES.md`).
- AGENTS rule «no `--no-verify`» — Husky hooks не оминаються.
- Sentry `sendDefaultPii=false` + `beforeSend` стрипає body/cookies.
- Email логується як SHA-256[:12] (хороша практика).

**Чому 7.5, а не 8:**

- **`pnpm audit --audit-level=high || true`** — це **silently-green pattern**. Висвітливши як «non-blocking warning», команда втрачає сигнал. Якщо CI завжди зелений на high vulns, ніхто їх не закриє.
- **`pnpm audit --audit-level=high --prod || true`** — те саме, тільки на prod tree.
- **Немає SLA на high vulns** (Вася теж це підмітив — згоден).
- Немає **secret-scanning step** у CI (хоч би `gitleaks` SHA-pinned). У GitHub автоматичний secret scanning є, але як CI gate його немає.

**PR-ідеї:**

- `PR-9.A` ✅ closed — [#862](https://github.com/Skords-01/Sergeant/pull/862) `ci(security): make pnpm audit --audit-level=high blocking by default + escape hatch via labeled PR (e.g. label "audit-exception")`. Це міняє default на «потрібно явно дозволити», а не «потрібно явно заблокувати».
- `PR-9.B` ✅ closed — [#897](https://github.com/Skords-01/Sergeant/pull/897) `ci(security): add gitleaks step (SHA-pinned)` — окремий blocking `Secret scan (gitleaks)` job, паралельний з `check`/`coverage`.
- `PR-9.C` ✅ closed — [#902](https://github.com/Skords-01/Sergeant/pull/902) `docs(security): vulnerability SLA matrix (critical: same-day; high: ≤14 days; med: ≤30 days)` + weekly `security-sla-reminder.yml` workflow з idempotent breach-comments.
- `PR-9.D` ✅ closed — [#871](https://github.com/Skords-01/Sergeant/pull/871) `feat(eslint-plugins): no-anthropic-key-in-logs` (AST + heuristic-rule на `console.log`/`logger.*`/`pino.*` з `process.env.ANTHROPIC_API_KEY` або secret-identifier у scope з імпортом `@anthropic-ai/sdk`).

---

## 10) Delivery pipeline, CI/CD, runtime платформи

**Оцінка:** **8.5/10** (згоден)

**Що бачу:**

- 4 jobs у `ci.yml`: `check`, `coverage`, `a11y`, `smoke-e2e`. Smoke-e2e з реальним Postgres-сервісом, міграціями, API+Vite preview, Playwright Chromium.
- Turbo remote cache (`TURBO_TOKEN`/`TURBO_TEAM` через GitHub secrets, fallback to local) — рідко зустрічається у такому розмірі.
- size-limit у CI, brotli budgets явні в `apps/web/package.json`.
- Renovate замість Dependabot — це конкретна перевага (групування, scheduled PRs).
- 7 окремих workflow для mobile (`detox-android`, `detox-ios`, `mobile-shell-android(-release)`, `mobile-shell-ios(-release)`).

**Що я б додав до Васи:**

- **Жодного explicit pipeline duration budget** — Вася це згадав як рекомендацію, але я б акцентував: smoke-e2e може повзти до 20+ хв, бо `timeout-minutes: 20`.
- **`needs:` залежності** — `coverage` не має `needs: check`. Якщо `check` ламається (lint/typecheck), `coverage` все одно бігає. Залежно від філософії — або фіча (швидкий feedback), або bug (waste).

**PR-ідеї:**

- `PR-10.A` ✅ closed — [#951](https://github.com/Skords-01/Sergeant/pull/951) `ci: p95 pipeline-duration metric у CI summary`, доробка [#970](https://github.com/Skords-01/Sergeant/pull/970)/[#971](https://github.com/Skords-01/Sergeant/pull/971) (`needs:` fix після розділення smoke-e2e → critical-flow). Реалізовано як job `pipeline-duration-summary` у `ci.yml`.
- `PR-10.B` — `ci: split smoke-e2e into critical-flow (must-pass) + extended-flow (nightly)`. ✅ closed
- `PR-10.C` — `ci: nightly job for full audit (critical+high blocking) + dependency-check (snyk або osv-scanner)`. Nightly не блокує PR, але дає трендовий сигнал. ✅ closed — [#944](https://github.com/Skords-01/Sergeant/pull/944)

---

## 11) Документація, playbooks, onboarding

**Оцінка:** **9.5/10** (вище за Васю на 0.5)

**Що бачу:**

- 23 playbooks у `docs/playbooks/` — кожен має «коли робити», «кроки», «гарантії», «приклади».
- `docs/superpowers/specs/` — окрема директорія для специфікацій великих фіч.
- `docs/observability/{SLO.md, runbook.md, dashboards.md, prometheus/}` — повне operational documentation.
- AI-marker система (`AI-NOTE`/`AI-CONTEXT`/`AI-DANGER`/`AI-GENERATED`/`AI-LEGACY: expires YYYY-MM-DD`) з `sergeant-design/ai-marker-syntax` ESLint rule (warn). Це формалізована documentation для AI-агентів, що пишуть код.
- AGENTS.md фіксує **усі скоупи commit-message** як enum (no `monorepo`, no `app`, no `core`, no `all`).

**Чому 9.5, а не 10:** документи живі і з датами, але **немає freshness badge** на топ-документах (Вася це слушно зауважив).

**PR-ідеї:**

- `PR-11.A` ✅ closed — [#952](https://github.com/Skords-01/Sergeant/pull/952) `docs(docs): freshness badges for top-10 docs + nightly overdue-doc issue workflow`. `**Last validated:**` бейдж додано на 11+ топ-документів, `.github/workflows/docs-freshness.yml` + `scripts/docs/check-freshness.mjs` відкриває issue на overdue.
- `PR-11.B` ✅ closed — [#955](https://github.com/Skords-01/Sergeant/pull/955) `docs(docs): convert top-5 playbooks to decision-tree format`. Додано `docs/playbooks/_TEMPLATE-decision-tree.md` і конвертовано: `debug-chat-tool.md`, `hotfix-prod-regression.md`, `investigate-alert.md`, `rotate-secrets.md`, `stabilize-flaky-test.md`.
- `PR-11.C` ✅ closed (5/5) — ADR template + README ✅ ([#938](https://github.com/Skords-01/Sergeant/pull/938)) + retroactive batches:
  - `docs/adr/0017-better-auth-choice-and-session-model.md` (Better Auth) ✅ ([#962](https://github.com/Skords-01/Sergeant/pull/962))
  - `docs/adr/0010-mobile-dual-track-capacitor-expo.md` (Capacitor wrapper) ✅ ([#956](https://github.com/Skords-01/Sergeant/pull/956))
  - `docs/adr/0005-anthropic-model-selection-and-prompt-caching.md` (Anthropic tool-on-client) ✅ ([#958](https://github.com/Skords-01/Sergeant/pull/958))
  - `docs/adr/0023-turbo-monorepo-runner.md` (Turborepo as monorepo task runner) ✅
  - `docs/adr/0024-monorepo-apps-packages-split.md` (`apps/*` + `packages/*` split) ✅
  - **Caveat (resolved):** паралельні ADR-пакети #956/#961/#962 створили колізії номерів 0003-0012 (10 пар файлів з однаковим NNNN); розв'язано через PR [#989](https://github.com/Skords-01/Sergeant/pull/989) `docs(adr): resolve numbering collisions`.

---

## 12) Продуктова масштабованість та AI-напрям

**Оцінка:** **8/10** (згоден)

**Що бачу:**

- HubChat tool execution path задокументований у AGENTS.md з ASCII-діаграмою: server defines tools, client executes, server passes tool_result back.
- `RISKY_TOOLS` constant у `hubChatActionCards.ts` — ризикові інструменти (delete/forget/import) отримують «Критична дія» badge.
- `max_tokens` budget явний: 1500 для першого запиту, 2500 для tool-result continuation. Auto-continuation через `callAnthropicWithContinuation` з `MAX_TEXT_CONTINUATIONS=3` cap.
- `SYSTEM_PREFIX` ідентифікований як prompt-cache candidate, але **не активований** (це чистий ROI).

**Що я додам:**

- **Tool lifecycle** (Васи рекомендація) насправді частково існує — три coordinated edits для нового tool описані в AGENTS.md. Тобто бракує **observability-стадії** і **safety-review-стадії**, не самої моделі.
- **Контрактні тести для tool_use/tool_result** — критичний геп. Якщо `client executor` зламає схему повернення (наприклад, верне `null` замість `string`), модель ловить помилку лише в runtime.

**PR-ідеї:**

- `PR-12.A` ✅ closed — [#864](https://github.com/Skords-01/Sergeant/pull/864) `feat(server,chat): activate prompt caching for SYSTEM_PREFIX (cache_control: ephemeral) + SYSTEM_PROMPT_VERSION constant` + per-request метрика `anthropic_prompt_cache_hit_total{version, outcome}` (включно зі streaming-шляхом). Очікуваний ефект: зниження Anthropic spend на 30-50% для повторних запитів.
- `PR-12.B` ✅ closed — [#885](https://github.com/Skords-01/Sergeant/pull/885) `test(web): contract tests for all hubChatActions handlers (happy + error path)`.
- `PR-12.C` ✅closed — [#930](https://github.com/Skords-01/Sergeant/pull/930) `feat(server,chat): per-tool metrics (chat_tool_invocations_total{tool, outcome=proposed|executed|unknown_tool}) → SLO dashboard`. Реалізовано: `apps/server/src/modules/chat/toolMetrics.ts` із whitelist-маперами на TOOLS-реєстр (anti-cardinality), wired в `chat.ts` на обидва кроки (`recordToolProposals` після першого Anthropic-виклику з tool_use-блоками, `recordToolExecutions` на другому кроці з мапу `tool_use_id → name` через `tool_calls_raw`), 13 unit + 3 integration тестів.
- `PR-12.D` ✅closed — `docs(ai): tool lifecycle model (proposal → safety review → rollout → KPIs)` — реалізовано як [`docs/adr/0002-tool-lifecycle.md`](../adr/0002-tool-lifecycle.md): 4-фазний процес (Proposal/Safety/Rollout/KPIs) з checklist-ами для кожної фази, owner-domain map і KPI-thresholds на основі `chat_tool_invocations_total` (PR-12.C).
- `PR-12.E` ✅closed — `feat(server,chat): truncate-aware tool_result handler` — якщо `tool_result` >N токенів, серверна частина серіалізує summary + повний blob у Sentry breadcrumb. Закриває edge case, де великі briefing/digest вибивають continuation. Реалізовано: `apps/server/src/modules/chat/toolResultTruncation.ts` (threshold 2 000 chars, head 600 + tail 400 + marker), wired у `chat.ts` перед `tool_result`-payload-ом, `chat_tool_result_truncated_total{reason}` метрика, 14 unit + 2 integration тестів.

---

## Зведена оцінка (моя)

| Метрика              | Моя                      | Васи                 |
| -------------------- | ------------------------ | -------------------- |
| Engineering maturity | **8.2/10**               | 8.4/10               |
| Operational maturity | **8.4/10**               | 8.3/10               |
| Risk profile         | **середній (керований)** | середній (керований) |

Розхід ±0.2 — у межах шуму. Основна моя поправка (нижча engineering оцінка) тримається на:

- Phase-not-started **strict TS на apps/web/server** (це найбільший single risk).
- 25 файлів >600 LOC, не 10 (як вказав Вася).

---

## Перспективи та напрямки руху (моя версія)

### Спринт 0 (1 тиждень) — «зупинити кровотечу»

| #   | PR                                                | Effort | Ризик    | Імпакт                 | Status                                                    |
| --- | ------------------------------------------------- | ------ | -------- | ---------------------- | --------------------------------------------------------- |
| 1   | `PR-9.A` — pnpm audit --audit-level=high blocking | 0.5 д  | низький  | припинити silent-green | ✅ [#862](https://github.com/Skords-01/Sergeant/pull/862) |
| 2   | `PR-2.A` — commitlint                             | 0.5 д  | низький  | автоматизує rule #5    | ✅ [#866](https://github.com/Skords-01/Sergeant/pull/866) |
| 3   | `PR-6.A` — strictNullChecks на apps/web phase 1   | 2 д    | середній | старт strict-rollout   | ✅ [#870](https://github.com/Skords-01/Sergeant/pull/870) |
| 4   | `PR-12.A` — SYSTEM_PREFIX prompt caching          | 1 д    | низький  | $$ saving + latency    | ✅ [#864](https://github.com/Skords-01/Sergeant/pull/864) |

### Спринт 1-2 (3-4 тижні) — «закрити рутиний борг»

| #   | PR                                                      | Effort | Імпакт                |
| --- | ------------------------------------------------------- | ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | `PR-6.B` — noImplicitAny phase 2                        | 3-5 д  | strict TS phase 2     | 🟡 partial: `routine`+`shared` ✅ [#923](https://github.com/Skords-01/Sergeant/pull/923), `nutrition` ✅ [#934](https://github.com/Skords-01/Sergeant/pull/934); ⏳ `core`/`finyk`/`fizruk` |
| 6   | `PR-3.D` — top-3 localStorage migration                 | 1 д    | burn-down             | ✅ [#865](https://github.com/Skords-01/Sergeant/pull/865)                                                                                                                                   |
| 7   | `PR-3.B` + `PR-3.C` — Assets.tsx + seedFoodsUk split    | 2 д    | top-LOC decomposition | `PR-3.B` ✅ [#887](https://github.com/Skords-01/Sergeant/pull/887); `PR-3.C` ✅ [#898](https://github.com/Skords-01/Sergeant/pull/898)                                                      |
| 8   | `PR-2.B` — `no-bigint-string` ESLint rule               | 1-2 д  | автоматизує rule #1   | ✅ [#868](https://github.com/Skords-01/Sergeant/pull/868)                                                                                                                                   |
| 9   | `PR-2.C` — `rq-keys-only-from-factory`                  | 1-2 д  | автоматизує rule #2   | ✅ [#869](https://github.com/Skords-01/Sergeant/pull/869)                                                                                                                                   |
| 10  | `PR-12.B` — chatActions contract tests                  | 2 д    | safety net на tools   | ✅ [#885](https://github.com/Skords-01/Sergeant/pull/885)                                                                                                                                   |
| 11  | `PR-7.A` + `PR-7.B` — recommendation + cloud-sync tests | 3 д    | critical paths        | `PR-7.A` ✅ [#886](https://github.com/Skords-01/Sergeant/pull/886); `PR-7.B` ✅ [#904](https://github.com/Skords-01/Sergeant/pull/904)                                                      |
| 12  | `PR-5.A` — migration linter                             | 1 д    | автоматизує rule #4   | ✅ [#863](https://github.com/Skords-01/Sergeant/pull/863)                                                                                                                                   |

### Спринт 3-6 (2-3 місяці) — «масштабування»

| #   | PR                                                       | Effort    | Імпакт               | Status                                                                                                                                                   |
| --- | -------------------------------------------------------- | --------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | `PR-6.C` — strict: true full + remove allowJs            | 1 тиждень | strict TS done       | ⏳ pending                                                                                                                                               |
| 14  | `PR-4.D` — zod-to-openapi для api-client                 | 1 тиждень | автоматизує rule #3  | 🟡 Phase 1 done — spec згенеровано, freshness-скрипт працює (`pnpm api:check-openapi`); workflow додає юзер; Phase 2 (api-client codegen) — наступний PR |
| 15  | `PR-8.A` + `PR-8.C` — error-budget policy + tool metrics | 3-5 д     | operational maturity | `PR-8.A` ✅ [#942](https://github.com/Skords-01/Sergeant/pull/942); `PR-8.C` ✅ через PR-12.A [#864](https://github.com/Skords-01/Sergeant/pull/864)     |
| 16  | `PR-10.B` + `PR-10.C` — split smoke-e2e + nightly audit  | 2-3 д     | CI scaling           | `PR-10.B` ✅ closed; `PR-10.C` ✅ closed — [#944](https://github.com/Skords-01/Sergeant/pull/944)                                                        |
| 17  | `PR-11.A` + `PR-11.C` — freshness badges + ADR template  | 1 тиждень | doc lifecycle        | `PR-11.A` ✅ [#952](https://github.com/Skords-01/Sergeant/pull/952); `PR-11.C` ✅ closed (5/5)                                                           |
| 18  | `PR-3.B/C` next 5 — file decomposition next wave         | 1-2 тижні | regression-surface   | ⏳ pending                                                                                                                                               |

### Поза 6 місяців

- AI tool lifecycle full implementation (`PR-12.D` + per-tool KPIs у Grafana).
- Mobile parity: винести `apps/web` UI primitives у portable package, що споживає і `apps/mobile`.
- Risk-weighted engineering portfolio (як Вася — це довгостроковий шлях, який не є PR, а changeset у методології).

---

## Що б я НЕ робив зараз (контр-рекомендація)

1. **Великий refactor architecture** — Sergeant вже на 8.2-8.4/10. Будь-який «один великий PR на все» ламає trend.
2. **Перехід на іншу test-runner / lint-runner** — вже виваженo (Vitest + ESLint 9 + custom plugin).
3. **Заміна Better Auth** — opaque user IDs описані як invariant, міграція дорожча за вигоду.
4. **Видалення `apps/mobile-shell` (Capacitor)** — це сходинка, доки `apps/mobile` (Expo) не дозріє.
5. **Power-up monorepo на Nx** — Turbo вже добре працює на цьому масштабі.

---

**Final word:** аудит Васі — добротний і чесний. Я б його прийняв як baseline для наступного кварталу. Найкритичніший single move — strict TS на `apps/web` (phase-by-phase). Все інше — інкрементальні покращення поверх вже зрілої платформи.
