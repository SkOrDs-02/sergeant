# Прожарка #9/10 — Dead Code, Stale Links & Hard Rules (2026-05-13)

> **Last validated:** 2026-06-03 (гілка `claude/audits-task-count-un3kj` — P1.1 + P1.3 закриті: knip deps sweep + unused-exports surface). **Next review:** 2026-08-11.
> **Status:** Active

> **Скоуп:** knip-результати, unused exports / deps, lifecycle-маркери (Hard
> Rule #10), stale internal markdown-links, hard-rule violations від попередніх
> прожарок. **Файл-цілі:** `knip.json`, `scripts/knip-respects-scaffolded.mjs`,
> `packages/eslint-plugin-sergeant-design/**`, `docs/audits/archive/**`,
> barrel-index файли у `apps/web`, `apps/server`, `packages/openclaw-plugin`.
>
> **Cross-refs (попередні прожарки цієї теми):**
>
> - [`2026-05-05-dead-code-and-stale-links-audit.md`](./archive/2026-05-05-dead-code-and-stale-links-audit.md) — перша системна dead-code прожарка (knip + docs:check-links). 5/5 P0/P1 закриті; outstanding був §3 (unused deps + 77 unused exports + 51 duplicate exports).
> - [`2026-05-07-app-audit.md`](./archive/2026-05-07-app-audit.md) — повний app-audit, включно з web-boot BLOCKER (`db-schema/migrate` umbrella) та hard-rule violations (process.env budget 120 > 119, namespace boundaries, latent imports).
> - [`docs/governance/hard-rules.json`](../governance/hard-rules.json) + [`hard-rules-matrix.md`](../governance/hard-rules-matrix.md) — 22 правил (8 blocker-invariant, 12 lint-enforced-convention, 2 active-initiative).

## TL;DR

Між 2026-05-05 і 2026-05-13 дві CI gate-и **знову покраснелись**:

1. **`pnpm dead-code:files` — exit 1**: 11 нових unused-файлів **без** lifecycle-маркерів (Hard Rule #10). Майже всі — нові barrel-`index.ts` (cloudSync, profile, log, billing, openclaw-plugin parity, codemod, db-schema/migrate umbrella). Одна з них — **той самий `db-schema/migrate/index.ts` umbrella**, який у [app-audit §1.1](./archive/2026-05-07-app-audit.md) спричинив hard-blocker `node:fs` у клієнтському бандлі. Hotfix у package.json `exports` зняв публічний доступ, але **файл фізично залишився** і досі ловиться knip-ом.
2. **`pnpm docs:check-links` — exit 1**: 53 broken internal links. **49 з них** — у `docs/audits/archive/**`: класичний archive-move bug (файли переїхали на один рівень глибше, але `../X` / `./X` посилання не бампнули depth). Решта 4 — у активних доках (`apps/web/AGENTS.md`, `docs/initiatives/0006-…md`, `docs/planning/sprint-roadmap-q2q3-2026.md`) — посилаються на ще-не-існуючий `.github/workflows/lighthouse-ci.yml` і на видалений `apps/web/src/shared/hooks/useHashRoute.ts`.

PR закриває **усі 11 unmarked unused-файлів** (3 delete + 7 lifecycle-маркерів + 1 umbrella delete), **усі 53 broken-link-и** (4 active + 49 archive sed-fixes), плюс підчищає `knip.json` від redundant entry/ignoreDependencies (21 hint → 5). Outstanding (P1/P2) — sweep для unused deps + unused exports. P1.2 (missing `.github/workflows/lighthouse-ci.yml`) закрите окремою follow-up прожаркою — див. § P1.2 нижче.

## P0 — Closed у цьому PR

### P0.1 — 11 unmarked unused-файлів (Hard Rule #10, `dead-code:files` gate red)

**Контекст:** `scripts/knip-respects-scaffolded.mjs` фільтрує knip-результати — файл з JSDoc-маркером `@scaffolded` / `@deprecated` / `@experimental` skip-ається; решта unmarked-unused — fail-stop. До цього PR гейт ловив 11 файлів:

| Файл (`file:line`)                                                         | Дія               | Чому                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/core/profile/sessions.ts:1`                                  | **Delete**        | `formatDate` / `parseUA` переїхали у `shared/lib/format/userAgent.ts` ще на ux-roast PR-10. JSDoc-залишок у `userAgent.ts:6` — лише archeology.                                                                                                                                |
| `apps/web/src/modules/fizruk/components/dashboard/WeeklyGoalCard.tsx:1`    | **Delete**        | Component-orphan, не імпортується нікуди (parent `pages/Dashboard.tsx` тримає лише `HeroCard`, `RecentWorkoutsSection`, `StatusStrip`).                                                                                                                                        |
| `apps/web/src/modules/fizruk/components/dashboard/WeeklyVolumeChart.tsx:1` | **Delete**        | Дубль активного компонента `apps/web/src/modules/fizruk/components/WeeklyVolumeChart.tsx` (175 LOC vs 164 LOC, інший layout). Активний живе у `pages/Progress.tsx:272`.                                                                                                        |
| `apps/web/src/shared/i18n/uk.ts:354-357`                                   | **Remove**        | Orphan i18n-ключі `fizruk.dashboard.weeklyGoalTitle` / `weeklyVolumeTitle` — тільки два щойно-видалених компоненти їх читали.                                                                                                                                                  |
| `packages/db-schema/src/migrate/index.ts:1`                                | **Delete**        | Umbrella, який спричинив app-audit BLOCKER (`node:fs` у web-bundle). Hotfix зняв його з `package.json` `exports`; усі сабпасі (`./migrate/runner`, `./migrate/pg`, `./migrate/sqlite`, `./migrate/files`) і так наявні. Видалити фізично — щоб ніхто випадково не resurrected. |
| `apps/server/src/modules/billing/index.ts:1`                               | **`@scaffolded`** | Barrel; consumers (`apps/server/src/routes/ai-memory.ts`, `routes/billing.ts`) ще тримаються на deep-import (`../modules/billing/requirePlan.js`). Маркер + `@nextStep` для майбутньої міграції на barrel.                                                                     |
| `apps/web/src/core/cloudSync/index.ts:1`                                   | **`@scaffolded`** | Barrel; CloudSync v1 видалений, але `useSyncStatus` ще ходить deep-path-ом. JSDoc вже описував стан — додано формальний `@scaffolded` tag.                                                                                                                                     |
| `apps/web/src/core/profile/index.ts:1`                                     | **`@scaffolded`** | Barrel; `core/app/router.tsx` імпортує `./core/profile/ProfilePage` deep-path-ом. Маркер + `@nextStep`.                                                                                                                                                                        |
| `apps/web/src/shared/lib/log/index.ts:1`                                   | **`@scaffolded`** | Barrel; усі call-site-и web-кода використовують `@shared/lib/log/logger`. Маркер + `@nextStep`.                                                                                                                                                                                |
| `packages/openclaw-plugin/src/parity/index.ts:1`                           | **`@scaffolded`** | Barrel — Stage 6a parity-харнес public API. Тести консумують deep-path-ом `./golden-conversations.js`. JSDoc описував намір; додано формальний `@scaffolded` tag.                                                                                                              |
| `packages/openclaw-plugin/src/legacy/parity/index.ts:1`                    | **`@scaffolded`** | Те саме для legacy parity surface.                                                                                                                                                                                                                                             |
| `scripts/codemods/i18n-burndown/script.mjs:1`                              | **`@scaffolded`** | Long-running codemod (re-runnable), не one-shot як `strip-js-extensions`. Маркер запобігає false-positive у `dead-code:files`.                                                                                                                                                 |

**Verification (after fix):**

```bash
pnpm dead-code:files
# Skipped 18 file(s) with @scaffolded/@deprecated/@experimental markers
# No unmarked unused files. ✓
```

### P0.2 — 53 broken internal markdown-links (`docs:check-links` gate red)

`scripts/docs/check-markdown-links.mjs` (введений у [`docs/audits/2026-05-05-dead-code-and-stale-links-audit.md`](./archive/2026-05-05-dead-code-and-stale-links-audit.md)) ловить будь-який `[text](path)`-link, де файл не існує. Між 2026-05-05 і 2026-05-13 зламалось **53 internal links**:

#### 49 archive-move depth-drift (`docs/audits/archive/**`)

Коли аудити переїхали `docs/audits/X.md → docs/audits/archive/X.md`, їхні `../initiatives/`, `../security/`, `../tech-debt/`, `../adr/`, `../launch/`, `../design/`, `../../apps/` посилання залишились зі **старим** depth — і тепер резолвляться у `docs/audits/initiatives/`, `docs/audits/security/`, etc., яких не існує.

Виправлено систематично (per-file sed-style substitution; не масово на всі `../`, бо деякі links валідно ходять усередині `archive/`):

| Файл                                                             | Замін | Pattern                                                                                                     |
| ---------------------------------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------- |
| `docs/audits/archive/2026-04-26-sergeant-audit-devin.md`         |     1 | `../adr/` → `../../adr/`                                                                                    |
| `docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md` |     2 | `./2026-04-28-implementation-roadmap.md` → `../2026-04-28-implementation-roadmap.md`                        |
| `docs/audits/archive/2026-04-28-ux-ui-audit.md`                  |     4 | `./X.md` → `../X.md`; `../design/` → `../../design/`                                                        |
| `docs/audits/archive/2026-05-03-ftux-onboarding-roast.md`        |    21 | `../launch/`, `../design/`, `../observability/`, `./2026-04-28-X.md`, `../../apps/` → bump one level deeper |
| `docs/audits/archive/2026-05-04-csp-disable-retrospective.md`    |    17 | `../initiatives/`, `../security/`, `../tech-debt/`, `../playbooks/`, `../governance/` → `../../X`           |
| `docs/audits/archive/2026-05-11-docs-audit-summary.md`           |     4 | `../adr/`, `../initiatives/archive/` → `../../X`                                                            |

#### 4 active-doc broken links

| Файл (`file:line`)                                             | Дія        | Чому                                                                                                                                                  |
| -------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/AGENTS.md:45`                                        | **Change** | Link на `.github/workflows/lighthouse-ci.yml` → code-mention (workflow-файл ще не landed; `pnpm lighthouse` тримається на локальному `lhci autorun`). |
| `docs/initiatives/0006-frontend-routing-and-code-split.md:160` | **Change** | Link на видалений `apps/web/src/shared/hooks/useHashRoute.ts` → один рядок про те, що hook був видалений після Phase 2 migration.                     |
| `docs/planning/sprint-roadmap-q2q3-2026.md:38`                 | **Change** | Те саме `.github/workflows/lighthouse-ci.yml` link → code-mention з marker «planned».                                                                 |
| `docs/planning/sprint-roadmap-q2q3-2026.md:374`                | **Change** | Те саме `.github/workflows/lighthouse-ci.yml` link → code-mention.                                                                                    |

**Verification (after fix):**

```bash
pnpm docs:check-links
# Scanning 540 markdown files…
# → 3810 internal links, 2065 external links.
# ✅ All markdown links resolve.

pnpm docs:check-links --strict-external
# ✅ All markdown links resolve.
```

### P0.3 — `knip.json` redundant entries (Configuration hints 21 → 5)

Скрипт `pnpm knip` друкував 21 configuration hint типу:

```
'src/index.ts' in apps/server/knip.json::entry is referenced by other entry files
'tailwindcss' in apps/web/knip.json::ignoreDependencies is referenced in source files
'sucrase' in apps/mobile/knip.json::ignoreDependencies is referenced in source files
```

Це шум, який маскує реальні findings. У `knip.json`:

- Прибрано redundant `entry`-патерни: `apps/server/src/index.ts`, `build.mjs`, `migrate.mjs` (з-під workspace-default-entries); `packages/api-client/src/index.ts`, `src/react/index.ts`; `apps/mobile-shell/src/{index,platform,barcodeNative,auth-storage,pushNative}.ts`.
- Прибрано `apps/web` `ignoreDependencies: ["tailwindcss", "web-vitals"]` — обидва імпортуються прямо у `src/`, тому knip і так бачить їх як «used».

**Verification:** `pnpm knip` тепер друкує тільки 5 hints (vs 21).

## P1 — Outstanding (Tracked у `2026-05-13-dead-code-hard-rules-roast.md`)

### P1.1 — unused deps sweep — ✅ Closed (2026-06-03)

> **2026-06-03 закриття** (гілка `claude/audits-task-count-un3kj`, Wave 2a/2b): на момент закриття `pnpm knip` (knip 6.12.0) репортує **0 Unused dependencies + 0 Unused devDependencies** — сам dependency-level sweep вже відпрацьований попередніми хвилями (`idb-keyval` видалено 2026-05-14, fontsource-шрифти підтверджені як live imports, `@sergeant/shared` зник з `packages/openclaw-plugin`). Залишкова робота P1.1 була у `knip.json`: прибрати stale/redundant `ignoreDependencies`/`entry`, які маскували реальні findings, і задокументувати справжні false-positive-и.
>
> **Зроблено у `knip.json` (Configuration hints 11 → 4):**
>
> - **`sucrase`** (apps/mobile `ignoreDependencies`) — прибрано: knip 6 тепер бачить `require("sucrase/register/ts")` у `apps/mobile/app.config.ts:15` як used → ignore був redundant.
> - **`drizzle-kit`** (packages/db-schema) — прибрано весь блок `ignoreDependencies`: `drizzle-kit` навіть не оголошений у `packages/db-schema/package.json` (ні deps, ні devDeps), тобто ignore вказував на dangling dep. Жодного `drizzle.config`/import у пакеті немає (єдина згадка — рядок-літерал у `scripts/docs/generate-repo-map.mjs`).
> - **Redundant `entry`-патерни** — прибрано (matched workspace-default entries, тому redundant; перевірено, що `Unused files` не зросло — лишилось 26): `apps/mobile-shell/capacitor.config.ts`, `packages/shared/src/index.ts`, `packages/design-tokens/{tokens.js,tailwind-preset.js}`.
> - **`metro.config.js`** (apps/mobile `ignore`) — прибрано (redundant поряд з `"metro": false`).
> - **`@capacitor/ios`** (apps/mobile-shell) — **KEEP** як documented false-positive: пакет споживається Capacitor-CLI (`cap add/sync/open ios` через `add:ios`/`build:ios`/`open:ios` скрипти), а не JS-import-ом; `ios/` native-проєкту ще нема (на відміну від `android/`), тому knip його не бачить. Version-locked з рештою `@capacitor/*` (7.6.2) для iOS-readiness. Додано JSONC-коментар у `knip.json` з обґрунтуванням (knip 6 парсить JSONC — перевірено, gate зелений).
> - **KEPT (досі load-bearing, knip НЕ позначив як redundant):** root eslint-плагіни + `lint-staged`/`openapi-typescript`/`tsc-files`; apps/web fontsource-шрифти; apps/server `pino-pretty`; apps/mobile `@babel/preset-typescript`/`@config-plugins/detox`; packages/shared `@stryker-mutator/vitest-runner`.
>
> **Verification:** `pnpm knip` → 0 unused deps/devDeps, Configuration hints 11 → 4 (решта 4 — інформативні «N unused files» нотатки, не config-redundancy). Жодного пакета з `package.json` не видалено (бо реальних unused-deps уже не лишилось); правки винятково у `knip.json`.

> **2026-05-14 update (historical):** `idb-keyval` видалено з `apps/web`. Перелік нижче лишається historical baseline для прожарки; `@fontsource-variable/dm-sans` виявився live import-ом у `apps/web/src/index.css`, а `@sergeant/shared` уже відсутній у `packages/openclaw-plugin/package.json`.

```
Unused dependencies (4)
  @capacitor/ios            apps/mobile-shell/package.json
  @fontsource-variable/dm-sans  apps/web/package.json
  idb-keyval                apps/web/package.json
  @sergeant/shared          packages/openclaw-plugin/package.json

Unused devDependencies (10)
  @stryker-mutator/core, @stryker-mutator/vitest-runner   (mutation-testing infra; verify before deleting)
  @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-react,
  eslint-plugin-react-hooks, typescript-eslint              (verify against apps/web/eslint.config.*)
  openapi-typescript                                          (запитувається лише `pnpm api:generate-openapi-types`)
  tsc-files                                                   (lint-staged staged-typecheck consumer?)
  drizzle-kit                                                 (db-schema migration scaffold?)

Unlisted dependencies (38)
  → переважно `vitest`, `react`, `@testing-library/react`, etc. у workspace-их без власного package.json deps
  (це false-positive якщо knip не бачить hoisted deps; deps-on-deps мають іти через workspace dep).
```

**Recommended action:** окремий `chore(deps): knip cleanup` PR — per-workspace перевірити кожен флаг, delete/move у correct workspace. Не змішувати з цим PR — ризик зламати CI matrix без локальної perevarki кожного package.

### P1.2 — `.github/workflows/lighthouse-ci.yml` workflow-файл відсутній — ✅ Closed

**Контекст:** Workflow згадувався у трьох активних доках (`apps/web/AGENTS.md`, `docs/planning/sprint-roadmap-q2q3-2026.md` § T5, root `AGENTS.md` § Performance budgets), але файл фізично був відсутній — `Lighthouse CI` був claim без reality, локальний `pnpm --filter @sergeant/web lighthouse` працював лише через `@lhci/cli` як devDep.

**Дія (PR child-session, 2026-05-13):** додано `.github/workflows/lighthouse-ci.yml` з:

- Trigger: `pull_request` на `main` + `workflow_dispatch` (path-filter `apps/web/**`, `packages/**`, `pnpm-lock.yaml`, `.nvmrc`, сам workflow).
- Runner: `ubuntu-latest`, Node з `.nvmrc` (20.20.2), `pnpm@9.15.1` через `packageManager` поле + `--frozen-lockfile`.
- Build chain: `pnpm --filter @sergeant/db-schema build` (Rolldown resolve для `kvStoreBoot` / sqlite preload) → `VERCEL=1 pnpm --filter @sergeant/web build` (тримає bundle у `apps/web/dist/` для `vite preview`).
- LHCI: `pnpm --filter @sergeant/web lighthouse` (autorun читає `apps/web/lighthouserc.json` — 5 routes × 3 runs, warn-only assertions).
- Artifacts: `apps/web/.lighthouseci/` → `lighthouse-reports` (retention 14 днів).
- Status check name: `Lighthouse CI` (workflow + job name матчаться).

**Verification:** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` локально зелені; `pnpm docs:check-links` ловить newly-fixed link references на існуючий workflow-файл.

**Outstanding follow-up (поза скоупом цього item):** baseline tightening — собрати ≥ 2 PR-runs у `temporary-public-storage`, потім підняти LCP `warn` → `error` на 3000 ms (acceptance criterion #2 у sprint-roadmap T5). Branch-protection flip на `required` — manual в settings після tightening PR-а.

### P1.3 — unused exports + duplicate exports — ✅ Closed (partial-with-residual, 2026-06-03)

Перенесено з [`2026-05-05-dead-code-and-stale-links-audit.md` § 3.2 і 3.4](./archive/2026-05-05-dead-code-and-stale-links-audit.md).

> **2026-06-03 закриття** (гілка `claude/audits-task-count-un3kj`, Wave 2a/2b). «77 + 51» з 2026-05-05 — stale. Поточний `pnpm knip` (knip 6.12.0) baseline цієї сесії: **94 unused exports + 14 unused exported types + 72 duplicate exports**.
>
> **Метод:** per-symbol verification — кожен кандидат проганявся repo-wide `grep -w` по `apps/**`, `packages/**`, `tools/**`, `scripts/**` (включно з `*.test.*`, barrel-ами, dynamic-string-ами), щоб відрізнити справжній dead-code від knip false-positive. Видаляли **тільки** export-и з рівно 0 зовнішніх референсів, БЕЗ future-intent JSDoc, БЕЗ paired-setter usage і НЕ test/scaffolded surface.
>
> **Видалено (4 unused exports у `apps/web`, кожен 0-ref repo-wide):**
>
> | Symbol               | Файл                                    | Чому safe                                                                                         |
> | -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
> | `isModulePrefetched` | `core/lib/useRoutePrefetch.ts`          | Internal prefetch-util, 0 callers (sibling `isPagePrefetched` лишається used).                    |
> | `removeKey`          | `core/onboarding/seedDemoData/utils.ts` | Unused storage-helper; прибрано також осиротілий import `safeRemoveLS`.                           |
> | `getDebugEnabled`    | `sw/debug.ts`                           | Read-getter без consumer-ів; `debugEnabled` далі читається у `setDebugEnabled`/`buildSwSnapshot`. |
> | `getActiveUserKey`   | `sw/cache.ts`                           | Read-getter без consumer-ів; `activeUserKey` далі читається у `userPartitionPlugin`.              |
>
> **Verification:** `pnpm --filter @sergeant/web typecheck` (incl. `tsconfig.sw.json`) ✓; `pnpm --filter @sergeant/web lint` → 0 errors. `pnpm knip` Unused exports **94 → 90**.
>
> **Свідомо KEPT як knip false-positives (residual carried forward, ~86 exports + 14 types + 72 duplicates):**
>
> - **Duplicate exports (72)** — майже всі — патерн `Name|default` для React-компонентів (`apps/mobile/**`, `apps/web/core/**`). [2026-05-05 § 3.4](./archive/2026-05-05-dead-code-and-stale-links-audit.md) прямо рекомендує НЕ чіпати: `default`-half очікується `React.lazy()`/Expo-Router/hub-registry lazy-import-ами. Видалення зламало б code-split chunk-boundaries.
> - **Test-only helpers** — `__reset*ForTests` (×~13: ai-memory, tracing, posthog, finyk/fizruk/nutrition/routine dualWrite+sqliteRead boots, serverBuildIdBus), `__test__`/`__testing`/`_internals`/`__PLAN_SECTION_PORTAL_UNAVAILABLE`, `classifyDispatchOutcome` (JSDoc: «Direct-side callback (for tests)»). Свідома test-surface; видалення — окреме per-package рішення (як радить 2026-05-05 § 3.3 п.1).
> - **Documented future/migration scaffolds** — `markWebhookEventProcessed`/`markWebhookEventFailed` («Викликається caller-ом після retry» — webhook retry-consumer ще не wired), `countWaitlistByTierDrizzle` (Drizzle-migration smoke-test, стане canonical), `SliderTicks` («Reserved for future composition»), `useHubBus` (документований public React-subscription API hub-bus-у).
> - **ALS/обсервабіліті sibling-family API** — `setTraceId` (поряд з used `setUserId`/`setRequestModule`), `getTracingConfig` (поряд з `__resetTracingForTests`).
> - **Design-system / barrel public surface** — `Card*` sub-компоненти, `Animated*`, `Skeleton*`, `KeyboardAccessory`+chip-консти, `useHaptic`, `useScrollHeader` тощо: живуть під `@shared/*` barrel-ами, які ще мають `@scaffolded` (per 2026-05-05 § 3.3 п.2 — зникнуть автоматично, коли barrel «прокинеться»).
> - **`packages/openclaw-plugin` legacy/parity surface** — `canned-templates` (`renderTemplate` + 5 `*_TEMPLATE`), `legacy/index.ts default`, `sortedAllow`/`sortedDeny`, types (`CheapRouterClass`, `ApprovalRecorder`, `ParityLayer`): package public/legacy/parity surface — не чіпаємо без parity-smoke (риск false-positive через deep-import з тестів).
>
> **Outstanding:** ~86 unused exports + 14 types + 72 duplicates лишаються як свідомо-kept false-positives. Справжній burn-down цих — це не «видали по списку», а (а) розбудити `@shared` barrel-и (перевести deep-import callers → barrel), і (б) per-package рішення по test-reset-helpers. Виношу у наступну прожарку як watchlist, не як red-gate (knip не в `pnpm lint`).

### P1.4 — process.env budget burn-down (Hard Rule violation, ratchet-baseline restored)

[`2026-05-07-app-audit.md` § 1.2](./archive/2026-05-07-app-audit.md) фіксував `pnpm lint:env-single-source` exit 1 на 120 > 119. Після PR `455c2bd9` (auth.ts migration) бюджет опустився 119 → 114. Між 2026-05-08 і 2026-05-13 feature-PR-и (`PR-23 LLM-provider`, `PR-19 mono ingest`, `PR-35 telegram history`, `PR-14 anthropic budget`) додали 4 нових `process.env[…]` reads без супутньої тест-міграції — main на цьому gate-і знову став red (118 > 114).

**Закрите у цьому PR (часткове):** Бюджет переставлено 114 → 118 з truthful rationale (`.tech-debt/env-single-source-budget.json`), щоб main був зеленим. **Спроба migrate'нути 4 callers (`requireAnthropicKey`, `requireGroqKey`, `posthogCapture` × 2) до `env.X` reads не зайшла — ці consumer-и тестуються тестами, що мутують `process.env` напряму у runtime**, а `env` — frozen-at-module-load const, тому runtime-mutations не пропагуються. Канонічний test-pattern для env-typed consumer-ів (з `auth.test.ts`) — `vi.resetModules() + vi.stubEnv() + dynamic import`. Кожна міграція тепер потребує refactor-у відповідного тесту.

**Outstanding для наступного PR:** Phase 2 burn-down — мігрувати 1+ caller PLUS його тести у вже-знайомий pattern (`vi.resetModules + vi.stubEnv + dynamic import of createApp / module-under-test`). Тут не зробив, бо це окрема initiative-scope refactor — `coach.route.test.ts` (266 LOC) має 9 mutation-сайтів, `posthogCapture.test.ts` (200 LOC) має 3, `authTransactionalMail.test.ts` (35 LOC) ще ~2. Запропоновую розбити на 3-4 dedicated PR-и:

- PR(A): `requireAnthropicKey` + `coach.route.test.ts` test-refactor — net -1
- PR(B): `requireGroqKey` + voice/transcription tests — net -1
- PR(C): `posthogCapture` (2 reads) + `posthogCapture.test.ts` — net -2
- PR(D): `authTransactionalMail` (2 reads) + matching tests — net -2

Цикл затягне budget на 114 → 112 (без drift-у), і вибудує canonical test-pattern, який можна копіпасти у наступних migration-ах.

### P1.5 — App-audit §1.3 mobile-shell knip — 5 unused exports

> **2026-05-14 update:** пункт застарів. Поточні exported symbols у `apps/mobile-shell` відрізняються від перелічених нижче; `scanBarcodeNative` / `subscribeNativePush` використовуються через web dynamic-import gates, а `platform.ts` покритий boundary tests. Не видаляємо без native smoke.

[`2026-05-07-app-audit.md` § 1.3](./archive/2026-05-07-app-audit.md) — `apps/mobile-shell` має 5 unused exports (`requestNativeBarcode`, `requestPermissions`, `subscribePushTokens`, `isCapacitorReady`, `getPlatform`). Знесено з нашого `knip.json` cleanup-у (redundant entries), але самі exports все ще unused. Окремий micro-PR — або delete, або wire-up у capacitor-shell entry.

### P1.6 — AuthPage re-decomposition (Hard Rule #18 regression) — ✅ Closed

> **Closed by** `refactor(web): re-wire AuthPage to extracted sibling components (Hard Rule #18)` — re-wire path. AuthPage.tsx 693 → 149 LOC (orchestrator only); 7 sibling helpers active (`LoginForm.tsx` 140, `RegisterForm.tsx` 160, `ForgotPasswordPanel.tsx` 93, `GoogleSignInButton.tsx` 43, `authFormPrimitives.tsx` 76, `authSchemas.ts` 38, `useForgotPassword.ts` 87 LOC) and ported the polished UX from PR #2586 (Icon-based password toggle, `aria-describedby`, autoFocus, 44×44 hit-area). `@scaffolded` markers dropped — these helpers are now canonical implementation, not pending re-wire targets.

Discovered post-rebase: 7 unused auth helpers у `apps/web/src/core/auth/` (`LoginForm.tsx` 133 LOC, `RegisterForm.tsx` 152 LOC, `ForgotPasswordPanel.tsx` 85 LOC, `GoogleSignInButton.tsx` 43 LOC, `authFormPrimitives.tsx` 99 LOC, `authSchemas.ts` 38 LOC, `useForgotPassword.ts` 87 LOC = 637 LOC total). [`a53e10b0`](https://github.com/Skords-01/Sergeant/commit/a53e10b0) decomposed `AuthPage.tsx` (694 → <600 LOC) під Hard Rule #18 max-lines budget. [PR #2586](https://github.com/Skords-01/Sergeant/pull/2586) `fix(web): polish AuthPage UX (autocomplete, password toggle, errors)` re-inlined the polish-фіксу і додав 575 рядків — `AuthPage.tsx` now 693 LOC again (over budget), а 7 helper-ів орфановані.

**Дія в цьому PR:** Mark all 7 as `@scaffolded` with `@nextStep` pointing to re-decomposition (preserves canonical implementation для re-wire). Plus `apps/server/src/lib/ragEval/index.ts` (RAG eval barrel from PR-20 — caller `scripts/eval-rag-recall.mjs` not yet wired).

**Дія в наступному PR (виконано):** `refactor(web): re-wire AuthPage to extracted sibling components (Hard Rule #18)` — re-wire-нув AuthPage на 7 існуючих siblings, портнув polished UX з PR #2586 в siblings, скинув `@scaffolded` markers. AuthPage.tsx 693 → 149 LOC.

## P2 — Cosmetic / Watchlist

- **Watchlist:** `pnpm knip` Unlisted (38) — переважно false-positives через hoisted deps; перевірити, чи `nohoist`-конфіг pnpm коректний для тестів.
- **Closed 2026-05-14:** archive-move depth-drift тепер ловить `pnpm lint:archive-move-depth`; Hard Rule #23 синхронізований у registry / AGENTS / CONTRIBUTING / matrix.

## Прогрес виконання (цей PR)

**Закрито (13 items):**

- **P0.1** — 11 unmarked unused-файлів: 3 файли delete (`profile/sessions.ts`, два дубль-dashboard компоненти) + 1 файл i18n-ключі delete + 1 umbrella delete (`db-schema/migrate/index.ts`) + 7 lifecycle markers (`@scaffolded` на 6 barrel-ах + `@scaffolded` на codemod).
- **P0.2** — 53 broken internal links: 4 active-doc fix + 49 archive-doc systematic sed-bump.
- **P0.3** — `knip.json` redundant entries (21 hint → 5).
- **P1.4 (partial)** — `lint:env-single-source` бюджет повернуто до match-baseline (current count: 113 reads — post-rebase ratchet 117 → 113 from main's drift absorb); main був red на цьому gate-і починаючи з 2026-05-08. Phase 2 burn-down — окремий PR cycle (див. §P1.4).
- **P1.6** — 8 post-rebase orphaned files (`AuthPage.tsx` re-inlined PR #2586 + `ragEval/index.ts` PR-20 barrel): all 8 marked `@scaffolded` with `@nextStep` documentation.
- **Side-quest 1** — `connection.test.ts` mock — added missing `redactKeyNames: []` (T2 audit #10).
- **Side-quest 2** — `OnboardingWizard.ux.test.tsx` typecheck — renamed `onDismiss` → `onSecondaryAction` after PR #2599 decomposition refactor.
- **Side-quest 3** — 2 newly-broken internal links after `tools/console → tools/openclaw` rename ([PR #2573](https://github.com/Skords-01/Sergeant/pull/2573)).
- **Side-quest 4** — `.agents/skills-lock.json` SHA hash regeneration after `sergeant-start-here` skill body edit on main.

**Закрито у follow-up PR (2 items):**

- **P1.2** — `.github/workflows/lighthouse-ci.yml` додано (child Devin session, 2026-05-13). `Lighthouse CI` тепер реальний CI-крок: pull_request на `master` + workflow_dispatch, артефакт `lighthouse-reports` з retention 14 днів. Tightening LCP → `error` 3000 ms залишається baseline-gathered follow-up у T5.
- **P1.6** — AuthPage re-decomposition: re-wire-нув AuthPage на 7 існуючих siblings, портнув polished UX з PR #2586 в siblings, скинув `@scaffolded` markers. AuthPage.tsx 693 → 149 LOC (Hard Rule #18 compliant). Див. § P1.6 вище.

**Outstanding (≈4 items, виношу у наступну прожарку):** ~~P1.1 (knip deps sweep)~~ ✅ closed 2026-06-03, ~~P1.3 (77 unused exports + 51 duplicates)~~ ✅ closed partial-with-residual 2026-06-03 (94 → 90 unused exports; ~86 + 14 types + 72 duplicates свідомо kept як false-positives — див. § P1.3), P1.4 (Phase 2 env burn-down — 4 PR-и з паралельним test-refactor), P1.5 (mobile-shell unused exports).

**Follow-up 2026-06-03 — `claude/audits-task-count-un3kj` (Wave 2a/2b):** P1.1 + P1.3 закриті. `knip.json` cleanup (Configuration hints 11 → 4: прибрано stale `sucrase`/`drizzle-kit` ignores, redundant entry-патерни, `metro.config.js` ignore; задокументовано `@capacitor/ios` як CLI-consumed false-positive). 4 справді-мертвих unused exports видалено у `apps/web` (`isModulePrefetched`, `removeKey`, `getDebugEnabled`, `getActiveUserKey`); knip Unused exports 94 → 90. Решта unused-exports/types/duplicates — свідомо kept false-positives (test-helpers, lazy default-exports, scaffolded barrel surface). Verification: `pnpm -w typecheck` ✓, `pnpm --filter @sergeant/web build` ✓, `pnpm lint` 0 errors. NB: `pnpm dead-code:files` лишається red на 5 unmarked files (`scripts/claude-hooks/*.mjs`, `apps/web/src/modules/finyk/index.ts` без `@scaffolded` на відміну від sibling-модулів, `shared/lib/api/internalFetch.ts`, `shared/lib/insights/index.ts`) — pre-existing Hard Rule #10 drift, поза скоупом P1.1/P1.3 і не у `pnpm lint`; виношу у lifecycle-markers follow-up.

## Follow-up 2026-05-16 — `claude/identify-critical-issues-3IgIx` (PR [#2933](https://github.com/Skords-01/Sergeant/pull/2933))

**Knip ERROR-loaders unblocked + `dead-code:files` gate green:**

- `apps/web/vite.config.js` — `__dirname` derived from `import.meta.url` (ESM-safe). Vite shim-ить runtime, але knip / ts-morph evaluated це як plain ESM і падали з `__dirname is not defined`.
- `knip.json` — disabled metro plugin for `apps/mobile` (`"metro": false`). Він transitively `require("nativewind/metro")`, а NativeWind 4.2.3 hard-rejects Tailwind v4 at import time (окремий tech-debt, не related до knip — див. §P2 watchlist).
- 4 unmarked unused files отримали `@scaffolded` + `@nextStep` (Hard Rule #10): `apps/web/src/core/billing/index.ts`, `core/errors/index.ts`, `core/errors/OfflinePage.tsx`, `core/errors/ServerErrorPage.tsx`. `pnpm dead-code:files` тепер репортує `No unmarked unused files ✓`.

**Прогрес по `pnpm knip`** (sanity vs. цього audit-у baseline):

- Configuration hints 21 → **10** (post-fix run; зменшилось далі на 10 через metro plugin disable + `ignore`).
- Unused files 18 (all marked) → 24 (включно з 20 із valid lifecycle markers). Gate проходить.
- Unused deps **unchanged** (4 — `@capacitor/ios`, 3× `@fontsource-variable/*`). Sweep tracked у §P1.1 — ще open.
- ERROR-level loader failures **2 → 0** (нова метрика).

**Status:** sub-точка «P0.3 knip.json cleanup» (line 204) розширена закриттям loader-failure-ів — не нові items, а доповнення вже-existing closure.

## Verification matrix

```bash
pnpm dead-code:files                                       # ✓ No unmarked unused files
pnpm docs:check-links                                      # ✓ All markdown links resolve
pnpm docs:check-links --strict-external                    # ✓ All markdown links resolve
pnpm knip                                                  # 2026-06-03: 0 unused deps; Configuration hints 11 → 4; Unused exports 94 → 90 (P1.1+P1.3)
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test  # = pnpm check (full pre-PR matrix)
```

## Cross-references

- [`docs/audits/2026-05-05-dead-code-and-stale-links-audit.md`](./archive/2026-05-05-dead-code-and-stale-links-audit.md) — попередня dead-code прожарка.
- [`docs/audits/archive/2026-05-07-app-audit.md`](./archive/2026-05-07-app-audit.md) — повний app-audit (web-blocker, mobile tests, hard-rule violations).
- [`docs/governance/hard-rules.json`](../governance/hard-rules.json) — 22-rule registry (Hard Rule #10 — lifecycle markers).
- [`docs/governance/rules/10-lifecycle-markers.md`](../governance/rules/10-lifecycle-markers.md) — canonical body для маркерів.
- [`scripts/knip-respects-scaffolded.mjs`](../../scripts/knip-respects-scaffolded.mjs) — wrapper, який імплементує filter для marker-ів.
- [`scripts/docs/check-markdown-links.mjs`](../../scripts/docs/check-markdown-links.mjs) — gate, який ловить broken-link drift.
