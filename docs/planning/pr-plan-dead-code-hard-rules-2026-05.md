# PR-план — Dead Code + Hard Rules (з прожарки 2026-05-13)

> **Last validated:** 2026-05-13 by Devin (для @andrijvigrav). **Next review:** 2026-08-11.
> **Status:** Active

> **Скоуп:** виконати outstanding items з [`2026-05-13-dead-code-hard-rules-roast.md`](../audits/2026-05-13-dead-code-hard-rules-roast.md) (§ P1 — `pnpm knip` deps sweep, 77 unused exports + 51 duplicate exports, mobile-shell unused exports, env-single-source Phase 2 burn-down, AuthPage re-decomposition) і tightening hard-rule контуру (новий lint-gate проти archive-move depth-drift, який зараз тільки watchlist у § P2). Усе закрите у самій прожарці (P0.1/P0.2/P0.3, P1.2, P1.6 markers, P1.4 partial budget restore) — поза скоупом цього плану.
>
> **Cross-refs:**
>
> - [`docs/audits/2026-05-13-dead-code-hard-rules-roast.md`](../audits/2026-05-13-dead-code-hard-rules-roast.md) — джерело open items (§ P1.1, P1.3, P1.4, P1.5, P1.6 і watchlist § P2).
> - [`docs/governance/hard-rules.json`](../governance/hard-rules.json) — 22-rule registry; HR-4 додає 23-й rule + canonical body.
> - [`docs/governance/hard-rules-matrix.md`](../governance/hard-rules-matrix.md) — машино-читабельна матриця (sync gate `pnpm lint:hard-rules-registry`).
> - [`knip.json`](../../knip.json) — після P0.3 хінтів 21 → 5; DC-3 чистить дальше per-workspace.
> - [`packages/eslint-plugin-sergeant-design/index.js`](../../packages/eslint-plugin-sergeant-design/index.js) — 30 rules; жоден з нових PR-ів цього плану не додає ESLint-правил (HR-4 — окремий `node` script у `pnpm lint` chain, бо predicate працює на markdown-graph, не на AST).
> - [`scripts/check-imports.mjs`](../../scripts/check-imports.mjs) — module-boundary gate для `apps/web/src/modules/{finyk,fizruk,nutrition,routine}`; DC-4 у `apps/web/src/shared` цей gate не зачіпає, але tests тримають regression коли модулі resolv-ляться на shared-API.
> - [`scripts/knip-respects-scaffolded.mjs`](../../scripts/knip-respects-scaffolded.mjs) — wrapper, який ловить `@scaffolded` / `@deprecated` / `@experimental`; кожна нова deletion у цьому плані має або фізично видалити файл, або у follow-up зняти JSDoc-маркер.
> - [`scripts/check-env-single-source.mjs`](../../scripts/check-env-single-source.mjs) + [`.tech-debt/env-single-source-budget.json`](../../.tech-debt/env-single-source-budget.json) — ratchet-baseline для HR-1/2/3 burn-down (поточний `budget: 105`).

## TL;DR

Виходить **9 PR-карток**, розбитих на дві секції:

- **Dead code removal (5 PR):** DC-1 (XS quick-win — 3 unused deps), DC-2 (S — mobile-shell 5 unused exports), DC-3 (M — knip devDeps sweep × 10), DC-4 (L — `apps/web/src/shared` unused/duplicate exports phase-1), DC-5 (M — AuthPage re-decomposition decision).
- **Hard rules tightening / new rules (4 PR):** HR-1/HR-2/HR-3 (по S — env-single-source Phase 2 burn-down: `requireAnthropicKey`, `requireGroqKey`, `posthogCapture` × 2, кожен з canonical `vi.resetModules + vi.stubEnv + dynamic import` test-refactor), HR-4 (M — новий `pnpm lint:archive-move-depth` gate + Hard Rule #23 у registry).

Order: DC-1 (XS) → HR-1 (locks canonical test-pattern) → паралельно HR-2/HR-3 + DC-2 + DC-3 → DC-4 → DC-5 → HR-4. Кожен PR — окремий, не змішувати з фіча-роботою.

## Dead code removal

### DC-1 — `chore(deps): drop 3 confirmed-unused web/plugin deps`

- **Title:** `chore(deps): drop idb-keyval, @fontsource-variable/dm-sans, @sergeant/shared (apps/web + openclaw-plugin)`
- **Scope-файли:**
  - `apps/web/package.json` — видалити `idb-keyval` і `@fontsource-variable/dm-sans` з `dependencies`.
  - `packages/openclaw-plugin/package.json` — видалити `@sergeant/shared` з `dependencies` (внутрішнього імпорту немає; `grep -rE "from ['\"]@sergeant/shared" packages/openclaw-plugin/src/` повертає 0).
  - `pnpm-lock.yaml` — `pnpm install --frozen-lockfile=false` локально, `pnpm install --frozen-lockfile` у CI.
- **Acceptance:**
  - `pnpm knip` секція `Unused dependencies` — 4 → 1 (залишається `@capacitor/ios` у `apps/mobile-shell` — окремий sweep DC-2).
  - `pnpm install --frozen-lockfile` зелений.
  - `pnpm --filter @sergeant/web typecheck && pnpm --filter @sergeant/web build` зелені (catches latent imports, які knip не побачив).
  - `pnpm test` зелений; `pnpm dead-code:files` без regression.
- **Розмір:** XS (quick-win — три рядки в `dependencies`, один `pnpm install`).
- **Пріоритет:** P1.
- **Залежності:** немає (відштовхуємось від цього PR — закриває dependency dirt-floor першим).
- **Owner:** _TBD (backend-engineer / frontend-engineer)_.

### DC-2 — `chore(mobile-shell): drop or wire 5 unused exports (capacitor-shell)`

- **Title:** `chore(mobile-shell): delete (or wire-up) 5 unused exports — requestNativeBarcode, requestPermissions, subscribePushTokens, isCapacitorReady, getPlatform`
- **Scope-файли:**
  - `apps/mobile-shell/src/barcodeNative.ts` — `requestNativeBarcode`, `requestPermissions`.
  - `apps/mobile-shell/src/pushNative.ts` — `subscribePushTokens`.
  - `apps/mobile-shell/src/platform.ts` — `isCapacitorReady`, `getPlatform`.
  - `knip.json` — без changes (`apps/mobile-shell.entry` вже мінімальний після P0.3 — `["capacitor.config.ts"]`).
  - `apps/mobile-shell/src/index.ts` — оновити barrel якщо exports мігровані, інакше додати JSDoc-маркер `@scaffolded` з `@nextStep`.
- **Acceptance:**
  - PR-description явно фіксує decision per-export (delete vs wire-up через capacitor lifecycle hook у `apps/mobile-shell/src/index.ts` / `apps/mobile/app/_layout.tsx`).
  - `pnpm knip` Unused exports у `apps/mobile-shell` зменшено на 5.
  - `pnpm --filter @sergeant/mobile-shell typecheck` зелений.
  - Detox / native smoke (barcode scan + push permission grant + platform branch) — manual run або posted у PR thread якщо CI gate ще не shipped.
- **Розмір:** S (1 PR, ≈5 deletions АБО ≈5 lifecycle-wires + smoke).
- **Пріоритет:** P1.
- **Залежності:** немає.
- **Owner:** _TBD (mobile-engineer)_.

### DC-3 — `chore(deps): knip devDependency sweep (10 unused devDeps verified per-workspace)`

- **Title:** `chore(deps): knip devDependency sweep — @stryker-mutator/*, eslint-plugin trio, openapi-typescript, tsc-files, drizzle-kit`
- **Scope-файли:**
  - `package.json` (root) — verify і прибрати з `devDependencies` лише ті, що **не** використовуються a) `npm script`-ами, b) Husky/lint-staged config, c) ESLint flat-config, d) CI matrix.
  - `apps/web/package.json` — `eslint-plugin-jsx-a11y`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `typescript-eslint` — звірити з `apps/web/eslint.config.*`; перенести у root якщо resolved лише з root chain.
  - `apps/server/package.json` — `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` — verify через `package.json:test:mutation` / `apps/server/stryker.conf.json`; видалити **лише** якщо mutation testing офіційно retired.
  - Workspace-перевірка для `openapi-typescript` (`pnpm api:generate-openapi-types`), `tsc-files` (`scripts/staged-typecheck.mjs`), `drizzle-kit` (`packages/db-schema/migrations/*` scaffolding).
  - `pnpm-lock.yaml`.
- **Acceptance:**
  - PR-description фіксує per-item decision (delete з обґрунтуванням АБО move into correct workspace АБО keep + додати entry у `knip.json::ignoreDependencies` з comment).
  - `pnpm knip` секція `Unused devDependencies` — 10 → ≤ 2 (з документованим залишком).
  - `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — усі зелені.
  - `pnpm api:generate-openapi-types` (якщо `openapi-typescript` залишається) — manual smoke.
  - CI matrix workflows (mutation testing job, openapi sync, db-schema build) verified у PR — посилання на job IDs.
- **Розмір:** M (10 items, кожен з окремою верифікацією).
- **Пріоритет:** P2.
- **Залежності:** DC-1 (порядок merge — менше lockfile-конфліктів).
- **Owner:** _TBD (any-engineer)_.

### DC-4 — `refactor(web): unused/duplicate exports sweep — apps/web/src/shared (phase 1)`

- **Title:** `refactor(web): drop unused/duplicate exports — apps/web/src/shared (phase 1 of 2)`
- **Scope-файли:**
  - `apps/web/src/shared/**` — barrel-`index.ts` файли + per-symbol файли (`shared/lib/format/*`, `shared/lib/api/queryKeys.ts`, `shared/components/ui/*`, `shared/hooks/*` тощо).
  - `apps/web/src/core/**` і `apps/web/src/modules/**` — як consumers, виправити deep-import-сайти, що залишилися на duplicate exports.
  - `knip.json` — без зміни workspace-entries; перевірити, що жодне нове `ignoreExportsUsedInFile: true` не маскує real dead-export.
- **Acceptance:**
  - Початковий стан (із roast § P1.3): 77 unused exports + 51 duplicate exports. Phase-1 ціль: ≥ 50% reduction (від ≈128 до ≤ 64 знайдень `pnpm knip`).
  - **Pre-delete verification per export:** `grep -rE "(<symbol>)\b" apps/ packages/ scripts/ tools/` повертає 0 (deep-import-callers), inhalt уважно прочитаний для late-binding (`require`, `import()`-promise).
  - `pnpm dead-code:files` без regression (немає нових unmarked unused-файлів через осиротілий barrel).
  - `pnpm --filter @sergeant/web typecheck && pnpm --filter @sergeant/web test` зелені; smoke `apps/web` dev-build + `vite preview` для каркасного routing.
  - Phase 2 (модулі `finyk` / `fizruk` / `nutrition` / `routine` + duplicate exports у `packages/*`) — окремий PR DC-4b (поза цим планом, відкривається після DC-4 merge).
- **Розмір:** L (≥ 60 deletions з per-symbol verification).
- **Пріоритет:** P1.
- **Залежності:** DC-3 (менше шуму в `pnpm knip`).
- **Owner:** _TBD (frontend-engineer)_.

### DC-5 — `refactor(web): re-decompose AuthPage.tsx under Hard Rule #18 (OR delete 7 scaffolded helpers)`

- **Title:** `refactor(web): re-decompose AuthPage.tsx <600 LOC (re-wire 7 helpers) OR delete 637 LOC of scaffolded auth helpers`
- **Scope-файли:**
  - `apps/web/src/core/auth/LoginForm.tsx` (133 LOC), `RegisterForm.tsx` (152 LOC), `ForgotPasswordPanel.tsx` (85 LOC), `GoogleSignInButton.tsx` (43 LOC), `authFormPrimitives.tsx` (99 LOC), `authSchemas.ts` (38 LOC), `useForgotPassword.ts` (87 LOC) — usn 7 helper-ів, зараз marked `@scaffolded`.
  - `apps/web/src/core/auth/AuthPage.tsx` (зараз 693 LOC, over Hard Rule #18 budget).
  - Якщо delete-branch: `apps/server/src/lib/ragEval/index.ts` (RAG eval barrel, post-rebase orphan з PR-20) розглянути окремо — поза скоупом DC-5 (`apps/web` only).
- **Acceptance:** PR-description must фіксує **одну** з двох гілок:
  - **Re-wire branch:** AuthPage.tsx < 600 LOC, усі 7 `@scaffolded`-маркерів зняті, deep-imports у `AuthPage.tsx` rewired на existing helper-modules; `pnpm lint` (Hard Rule #18 gate) і `pnpm test` зелені.
  - **Delete branch:** усі 7 файлів видалено (637 LOC), AuthPage.tsx залишається inlined (693 LOC) — Hard Rule #18 violation тоді тримається у `eslint.config.js::overrides` allowlist з deadline-коментарем, що цілить у [`docs/initiatives/0013-module-decomposition-round-2.md`](../initiatives/0013-module-decomposition-round-2.md) Sprint 2 backlog.
  - UX smoke у preview-deploy: login (email+password + Google), register, forgot-password full flow + error states (wrong password, expired magic link).
  - `pnpm dead-code:files` без regression.
- **Розмір:** M (re-wire branch — 7 file-edits + AuthPage.tsx refactor + tests; delete branch — 7 deletions + eslint allowlist update).
- **Пріоритет:** P1.
- **Залежності:** немає (стоїть паралельно решті DC-\*).
- **Owner:** _TBD (frontend-engineer)_.

## Hard rules tightening / new rules

### HR-1 — `refactor(server): env-single-source burn-down PR-A (requireAnthropicKey)`

- **Title:** `refactor(server): migrate requireAnthropicKey to env.X + canonical vi.stubEnv test-pattern`
- **Scope-файли:**
  - `apps/server/src/lib/ai/*.ts` — caller `requireAnthropicKey` (1 read `process.env.ANTHROPIC_API_KEY` → `env.ANTHROPIC_API_KEY`).
  - `apps/server/src/env/env.ts` — verify, що поле вже декларовано у Zod-схемі.
  - `apps/server/src/modules/coach/coach.route.test.ts` (266 LOC, 9 mutation-сайтів) — refactor на `vi.resetModules() + vi.stubEnv() + dynamic import of createApp / module-under-test` pattern (canonical reference: `apps/server/src/auth.test.ts`).
  - `.tech-debt/env-single-source-budget.json` — bump `budget: 105 → 104` + rationale-line.
- **Acceptance:**
  - `pnpm lint:env-single-source` рахує 104 reads, gate зелений.
  - `pnpm test --filter @sergeant/server` зелений (зокрема `coach.route.test.ts`).
  - PR-description явно фіксує canonical pattern як reference для HR-2/HR-3 (copy-paste-ready).
- **Розмір:** S (1 caller + 1 test-refactor, ~200 LOC).
- **Пріоритет:** P1.
- **Залежності:** немає (canonical pattern уже існує у `auth.test.ts`).
- **Owner:** _TBD (backend-engineer)_.

### HR-2 — `refactor(server): env-single-source burn-down PR-B (requireGroqKey)`

- **Title:** `refactor(server): migrate requireGroqKey to env.X + voice/transcription test-refactor`
- **Scope-файли:**
  - `apps/server/src/lib/ai/*.ts` — caller `requireGroqKey` (1 read `process.env.GROQ_API_KEY` → `env.GROQ_API_KEY`).
  - `apps/server/src/modules/voice/**/*.test.ts` (transcription / voice-input fixtures) — `vi.stubEnv` migration.
  - `.tech-debt/env-single-source-budget.json` — bump `budget: 104 → 103`.
- **Acceptance:** `pnpm lint:env-single-source` рахує 103; voice-tests зелені (`pnpm --filter @sergeant/server test --grep voice`); manual smoke `POST /api/voice/transcribe` у dev-server.
- **Розмір:** S.
- **Пріоритет:** P1.
- **Залежності:** HR-1 (canonical pattern locked-in).
- **Owner:** _TBD (backend-engineer)_.

### HR-3 — `refactor(server): env-single-source burn-down PR-C (posthogCapture × 2 reads)`

- **Title:** `refactor(server): migrate posthogCapture × 2 reads to env.X + posthogCapture.test.ts refactor`
- **Scope-файли:**
  - `apps/server/src/lib/obs/posthogCapture.ts` — 2 reads (`POSTHOG_KEY`, `POSTHOG_HOST` або еквівалент) → `env.X`.
  - `apps/server/src/lib/obs/posthogCapture.test.ts` (200 LOC, 3 mutation-сайтів) — `vi.stubEnv` migration.
  - `.tech-debt/env-single-source-budget.json` — bump `budget: 103 → 101`.
- **Acceptance:** `pnpm lint:env-single-source` рахує 101; `posthogCapture.test.ts` зелений; manual smoke `posthog-node` flush у dev (`POSTHOG_*` env set).
- **Розмір:** S.
- **Пріоритет:** P1.
- **Залежності:** HR-1.
- **Owner:** _TBD (backend-engineer)_.

### HR-4 — `feat(governance): pnpm lint:archive-move-depth — catch archive-move depth-drift`

- **Title:** `feat(governance): new pnpm lint:archive-move-depth gate + Hard Rule #23 (archive-move depth integrity)`
- **Scope-файли:**
  - `scripts/check-archive-move-depth.mjs` — новий скрипт. Логіка: для кожного `docs/audits/archive/*.md` (і будь-якого `docs/**/archive/**.md`, якщо інший archive-pattern існує), парсить `[text](path)` і fail-stop коли relative `path` resolv-ться у `docs/audits/X/`, який не існує (а існує `docs/X/`); пропонує fix (`bump-depth-by-one`).
  - `package.json` — додати `"lint:archive-move-depth": "node scripts/check-archive-move-depth.mjs"` і вписати у root `lint` chain (поряд з `lint:tech-debt-freshness` / `lint:initiative-status-sync`).
  - `docs/governance/hard-rules.json` — додати rule id `23`, title `Archive-move depth integrity — no broken ../X links in docs/audits/archive/**`, `category: "lint-enforced-convention"`, `enforced_by: [{kind: "ci", ref: "pnpm lint:archive-move-depth"}]`.
  - `docs/governance/rules/23-archive-move-depth.md` — canonical body з BAD (`../initiatives/foo.md` у `docs/audits/archive/X.md`) / GOOD (`../../initiatives/foo.md`) прикладами.
  - `AGENTS.md` — секція _Hard rules (do not break)_, додати row #23 у таблицю (per-rule file link, category).
  - `CONTRIBUTING.md` — секція _Hard rules_ — синхронний bump (3-way sync gate `pnpm lint:hard-rules-registry` валідує).
- **Acceptance:**
  - `pnpm lint:hard-rules-registry` зелений (3-way sync пройшов).
  - `pnpm lint:archive-move-depth` зелений на `main` (всі archive-move-fix-и з P0.2 roast уже залендені).
  - Negative-smoke: створити `docs/audits/archive/_smoke.md` з `[x](../initiatives/foo.md)`, прогнати `pnpm lint:archive-move-depth` — exit 1 з actionable error; видалити smoke-файл.
  - `pnpm docs:check-links` зелений (overlap з новим gate-ом — обидва pass).
- **Розмір:** M (новий script + registry-tri-sync + smoke).
- **Пріоритет:** P2.
- **Залежності:** немає.
- **Owner:** _TBD (any-engineer)_.

## Ризик-секція — «видалили щось живе»

Кожна `delete`-операція у DC-секції має проходити **триступеневу verification**, щоб не повторити app-audit § 1.1 (`db-schema/migrate` umbrella, який жив у package.json `exports` після logical-removal):

| Verification step                | Що ловить                                                                                                                  | Канонічний gate                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **1. `pnpm knip`**               | Unused exports/deps/files на static-analysis level. Бачить `import` / `require` (ESM + CJS), не бачить `import()` dynamic. | `pnpm knip` + `pnpm dead-code:files` (wrapper, що поважає lifecycle-маркери)                                    |
| **2. `grep` deep-imports**       | Late-binding callers: `import("@x/y")` runtime promises, `require("…")` у `scripts/*.mjs`, raw-string referenc у JSDoc.    | `grep -rE "(<symbol>\|<path>)\b" apps/ packages/ scripts/ tools/ docs/` (per-symbol перед deletion)             |
| **3. Integration / smoke tests** | Runtime regressions, які не ловить TypeScript (lazy-import у capacitor-shell, RQ keys factory, RAG eval harness).          | `pnpm test`, per-app `pnpm --filter @sergeant/<app> test`, manual UX smoke у preview-deploy для UI-видимих змін |

Конкретний risk-profile per PR:

- **DC-1 (deps):** найнижчий ризик — три деп-видалення з `package.json`. Step 1 уже зелений у roast § P1.1; step 2 — `grep -rE "(idb-keyval\|@fontsource-variable/dm-sans\|@sergeant/shared)" apps/web packages/openclaw-plugin` має повертати 0; step 3 — `pnpm build` зелений (catches `import "idb-keyval"` у латентних модулях).
- **DC-2 (mobile-shell):** native lifecycle ризик — capacitor може wire-up-ити exports через side-effect manifest, який knip не бачить. Step 3 — Detox / Capacitor smoke (barcode + push) обов'язковий.
- **DC-3 (devDeps):** ризик зламати CI matrix (mutation testing job, openapi gen). Step 3 — кожен видалений devDep має документований smoke-link на job ID у PR-description.
- **DC-4 (apps/web/src/shared):** найвищий ризик — 60+ deletion-ів, deep-imports у консумерських модулях. **Hard requirement:** per-symbol `grep` (step 2) обов'язковий **перед** deletion, не пост-фактум; PR-author залишає `grep` output у PR thread як evidence.
- **DC-5 (AuthPage):** UX-flow ризик — login / register / forgot-password regression тільки видно у preview-deploy. Step 3 — повна UX smoke (всі три flow) обов'язкова.
- **HR-1/HR-2/HR-3 (env burn-down):** регресія через `process.env` runtime-mutations. **Hard requirement:** canonical `vi.resetModules + vi.stubEnv + dynamic import` pattern (reference: `apps/server/src/auth.test.ts`) — не міняти test-shape без `vi.resetModules`, інакше module-cache тримає старі `env`-readings.
- **HR-4 (lint gate):** false-positive ризик — gate може фейлити на валідних `../X` links, що ходять усередині `archive/`. Skript має explicit allowlist для links, target яких — теж у `docs/audits/archive/`.

## Quick-wins

| PR     | Чому quick-win                                                                                                                 | Очікуваний impact                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `DC-1` | XS — три рядки видалити з `package.json`, knip уже довів unused-стан у roast § P1.1. Прибирає 75% dependency-dirt у одному PR. | `pnpm knip` Unused dependencies 4 → 1; baseline `pnpm install` швидший на N MB lockfile-дельти. |
| `HR-1` | S — закладає canonical `vi.stubEnv` pattern, який HR-2/HR-3 копіпастять. Окремо — звільняє 1 callsite з budget-ratchet drift.  | Budget 105 → 104; pattern lock-in для майбутніх phase-2 env-migrations.                         |

## Послідовність / merge order

```
DC-1 ──┐
       ├── HR-1 ──┬── HR-2 ──┐
DC-2 ──┘          └── HR-3 ──┤
                             │
DC-3 ────────────────────────┼── DC-4 ──┐
                             │          ├── (DC-4b phase 2 — поза цим планом)
HR-4 ────────────────────────┘          │
                                        DC-5
```

Не блокери (`HR-4`, `DC-5`) — можна лендити паралельно у будь-якій точці потоку. Залежності у DC-3 → DC-4 — суто soft (менше шуму в `pnpm knip`); якщо DC-3 затримується, DC-4 можна стартувати з ad-hoc per-export verification.

## Verification matrix (для усіх 9 PR-ів)

```bash
pnpm install --frozen-lockfile      # lockfile coherence (DC-1/DC-3)
pnpm format:check                   # markdown + код (всі PR)
pnpm lint                           # ESLint + custom gates (включаючи нові)
pnpm lint:hard-rules-registry       # 3-way sync (HR-4)
pnpm lint:env-single-source         # budget gate (HR-1/HR-2/HR-3)
pnpm lint:archive-move-depth        # новий gate (HR-4)
pnpm typecheck                      # TS у всіх workspaces
pnpm test                           # vitest у всіх workspaces
pnpm build                          # turbo (catches latent imports)
pnpm dead-code:files                # knip-respects-scaffolded (всі DC)
pnpm knip                           # raw knip output для PR-evidence
pnpm docs:check-links               # markdown internal links (HR-4 overlap)
```

## Cross-references

- [`docs/audits/2026-05-13-dead-code-hard-rules-roast.md`](../audits/2026-05-13-dead-code-hard-rules-roast.md) — джерело open items.
- [`docs/audits/2026-05-05-dead-code-and-stale-links-audit.md`](../audits/2026-05-05-dead-code-and-stale-links-audit.md) — попередня dead-code прожарка (origin §3.2 і §3.4).
- [`docs/audits/2026-05-07-app-audit.md`](../audits/2026-05-07-app-audit.md) — app-audit (web-blocker `db-schema/migrate` umbrella, mobile-shell §1.3).
- [`docs/governance/hard-rules.json`](../governance/hard-rules.json) — 22-rule registry; HR-4 додає 23-й rule.
- [`docs/governance/rules/10-lifecycle-markers.md`](../governance/rules/10-lifecycle-markers.md) — canonical body для `@scaffolded` маркерів (use-case у DC-2).
- [`docs/governance/rules/18-module-size-discipline-600.md`](../governance/rules/18-module-size-discipline-600.md) — Hard Rule #18 (DC-5 AuthPage decision).
- [`docs/initiatives/0013-module-decomposition-round-2.md`](../initiatives/0013-module-decomposition-round-2.md) — Sprint-2 backlog для DC-5 delete-branch fallback.
- [`docs/initiatives/stack-pulse-2026-05/pr-01-unify-env-modules.md`](../initiatives/stack-pulse-2026-05/pr-01-unify-env-modules.md) — origin для HR-1/HR-2/HR-3 budget ratchet.
- [`scripts/knip-respects-scaffolded.mjs`](../../scripts/knip-respects-scaffolded.mjs), [`scripts/check-env-single-source.mjs`](../../scripts/check-env-single-source.mjs), [`scripts/check-imports.mjs`](../../scripts/check-imports.mjs), [`scripts/check-hard-rules-registry.mjs`](../../scripts/check-hard-rules-registry.mjs).
- [`knip.json`](../../knip.json), [`packages/eslint-plugin-sergeant-design/index.js`](../../packages/eslint-plugin-sergeant-design/index.js).
