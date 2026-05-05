# Sergeant — dead-code & stale-links аудит (2026-05-05)

> **Last validated:** 2026-05-05 by @Skords-01 / Devin. **Next review:** 2026-08-03.
> **Status:** Active

> Аудит виконано 2026-05-05 проти `main @ f6bc64aa` як прохід по «застарілих чи мертвих елементах» репо. Скоуп — те, що автоматичні гарди (`pnpm dead-code:files`, `pnpm knip`, `pnpm docs:check-links`, `pnpm lint:tech-debt-freshness`, `pnpm lint:ai-legacy`, `pnpm docs:check-freshness-coverage`) знаходять зараз. Усі fix-able findings закриті у супровідному PR — цей файл лишається як historical record + дашборд для outstanding hints.

## TL;DR

- **Жодного справжнього мертвого файлу.** Усі 13 «unused files» з `pnpm knip` мають lifecycle-маркер (`@scaffolded` для barrel-ів, чекаючих consumer-ів; `@deprecated` для re-export-ів, які чекають на завершення міграції; `@deprecated` для одноразових кодомодів у `scripts/codemods/`). Гард `pnpm dead-code:files` (через [`scripts/knip-respects-scaffolded.mjs`](../../scripts/knip-respects-scaffolded.mjs)) тепер passes.
- **Doc-drift навколо paths.** `pnpm docs:check-links` знайшов **14 broken internal links** у 5 документах — усі через рефактори, що переїхали (vercel.json → `apps/web/vercel.json`, apps/server/src/middleware/ → `apps/server/src/http/`, docs/design-system/ → `docs/design/`, apps/web/src/components/VoiceMicButton.tsx → `apps/web/src/shared/components/ui/VoiceMicButton.tsx`, scripts/bundle-size-guard.ts → `scripts/check-bundle-size.mjs`, useHashRouter.ts переніс у Finyk-модуль, vite.config.js живе під apps/web/). Усе виправлено.
- **Один умисний placeholder.** `docs/launch/product-os/sprint-retros/s6-cleanup-batch.md` згадується як «буде створений по завершенню» — конвертовано з markdown-link у code-mention, щоб не ламати лінкер.
- **2 unmarked barrel-и:** `apps/server/src/modules/ai-memory/index.ts` і `apps/web/src/shared/forms/index.ts` — обидва задумані як public surface, але consumer-и поки що ходять deep-import-ами. Додано `@scaffolded` маркер з `@nextStep` per AGENTS.md → Hard Rule #10.
- **2 codemod-и без lifecycle marker:** `scripts/codemods/strip-js-extensions/script.mjs` (раніше) і `scripts/codemods/syncedKV/script.mjs` (доданий PR #008). Обидва промарковані `// @deprecated`, каталог [`scripts/codemods/README.md`](../../scripts/codemods/README.md) розширено `syncedKV` рядком.
- **Outstanding (для майбутніх PR-ів):** `pnpm knip` повідомляє про **3 unused dependencies** + **4 unused devDependencies** + **77 unused exports** + **51 duplicate exports** (named-export + `default`). Все **видиме**, але fix-and-verify виходить за межі цього аудиту — зведено в § 3.

---

## 1. Що зроблено в цьому PR

### 1.1 Broken internal links → виправлено (14 у 5 файлах)

| Файл                                             | Старий шлях                                      | Новий шлях                                                     | Чому drift                                                          |
| ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `docs/adr/0009-hosting-split-railway-vercel.md`  | `../../vercel.json` (×4)                         | `../../apps/web/vercel.json`                                   | Vercel SSOT перенесено з root у `apps/web/` (commit `61196120`).    |
| `docs/initiatives/0006-frontend-routing-...md`   | ../../scripts/bundle-size-guard.ts (×2)          | `../../scripts/check-bundle-size.mjs`                          | Bundle-gate переписано з TS на ESM `.mjs`.                          |
| `docs/initiatives/0006-frontend-routing-...md`   | ../../apps/web/src/shared/hooks/useHashRouter.ts | `../../apps/web/src/modules/finyk/hooks/useHashRouter.ts`      | Hook переїхав в Finyk-module за planом самої ініціативи.            |
| `docs/initiatives/0006-frontend-routing-...md`   | `../../vite.config.js`                           | `../../apps/web/vite.config.js`                                | Vite-конфіг живе тільки у `apps/web/`.                              |
| `docs/initiatives/0007-design-system-tooling.md` | `../design-system/` (×2)                         | `../design/`                                                   | Дизайн-доки переїхали у `docs/design/` (doc-hygiene PR 2026-05-02). |
| `docs/initiatives/0008-platform-hardening.md`    | `../../apps/server/src/__tests__/`               | `../../apps/server/src/http/` + іменовані `rateLimit*.test.ts` | `__tests__/` стало per-module (`http/`, `migrations/__tests__/`).   |
| `docs/initiatives/0008-platform-hardening.md`    | `../../apps/server/src/middleware/`              | `../../apps/server/src/http/`                                  | Middleware рефакторнули у `http/`.                                  |
| `docs/integrations/env-vars.md`                  | ../../apps/web/src/components/VoiceMicButton.tsx | `../../apps/web/src/shared/components/ui/VoiceMicButton.tsx`   | Перенесено в `shared/components/ui/` (за конвенцією).               |
| `docs/launch/product-os/ftux-sprint-plan.md`     | `[…s6-cleanup-batch.md](./sprint-retros/...)`    | code-reference (link removed)                                  | Файл «буде створений по завершенню» — link-checker не вгадає.       |

`pnpm docs:check-links` тепер `✅All markdown links resolve.` (12 external 404 / aborted — non-fatal, поза scope цього аудиту).

### 1.2 Lifecycle markers додано

| Файл                                              | Маркер        | `@nextStep`                                                                                                                                                            |
| ------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/modules/ai-memory/index.ts`      | `@scaffolded` | Перевести усіх caller-ів (`routes/ai-memory.ts`, `weekly-digest.ts`, `mono/webhook.ts`, …) на цей barrel замість deep imports `./service.js`, `./ingestQueue.js`, etc. |
| `apps/web/src/shared/forms/index.ts`              | `@scaffolded` | Перевести consumer-ів з `@shared/forms/useApiForm` deep-path на barrel `@shared/forms`.                                                                                |
| `scripts/codemods/strip-js-extensions/script.mjs` | `@deprecated` | One-shot historical codemod — preserved for forensics + старі гілки.                                                                                                   |
| `scripts/codemods/syncedKV/script.mjs`            | `@deprecated` | One-shot historical codemod — drift-check у dry-run + planned ESLint guard у PR #013.                                                                                  |

`pnpm dead-code:files` тепер `No unmarked unused files. ✓`.

### 1.3 Codemod catalog → дописано

[`scripts/codemods/README.md`](../../scripts/codemods/README.md) тепер каталогізує обидва історичні кодомоди (`strip-js-extensions/`, `syncedKV/`) з колонками «Запущено / Що робив / Long-term enforcement». Freshness-маркер бампнуто на 2026-05-05.

---

## 2. Що **не** є dead-code (для довідки)

Гарди репо вже відрізняють «справжній dead-code» від «scaffolded». Нижче — повний інвентар lifecycle-помічених файлів станом на 2026-05-05; усі вони залишаються свідомо.

| Файл                                                             | Маркер        | Причина                                                                                                                 |
| ---------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `scripts/ci/vitest.config.mjs`                                   | `@scaffolded` | Чекає на job у `.github/workflows/ci.yml` для `pipeline-duration-p95.test.mjs` + `posthog-release-annotation.test.mjs`. |
| `scripts/flaky-tests/vitest.config.ts`                           | `@scaffolded` | Чекає на dedicated job для `aggregate.test.ts` (covers `aggregate.mjs`).                                                |
| `apps/web/src/modules/{finyk,fizruk,nutrition,routine}/index.ts` | `@scaffolded` | Public barrel-и для cross-module імпортів (App router + hub registry); поки що споживачі ходять deep.                   |
| `apps/web/src/shared/charts/index.ts`                            | `@scaffolded` | Migration shared/chart-themes з deep-paths на barrel.                                                                   |
| `apps/web/src/shared/components/ui/OptimizedImage.tsx`           | `@scaffolded` | Чекає CDN/loader для Finyk merchant-logos + Hub bento-cards.                                                            |
| `packages/shared/src/lib/kvStore.ts`                             | `@deprecated` | Backwards-compatibility re-export, видалиться у LS-burndown PR #013 (`docs/planning/storage-roadmap.md`).               |

### 2.1 `@scaffolded` додано цим PR-ом (для повноти)

| Файл                                         | Очікувані consumer-и                                                                                                                                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/modules/ai-memory/index.ts` | `routes/ai-memory.ts`, `routes/index.ts`, `modules/digest/weekly-digest.ts`, `modules/mono/webhook.ts`, `modules/chat/chat.ts`, `modules/openclaw/tools.ts`, інтерналі `modules/ai-memory/{ingestRoute,recallRoute,ragContext}.ts`, `apps/server/src/index.ts`. |
| `apps/web/src/shared/forms/index.ts`         | `shared/components/ui/InputDialog.tsx`, `core/{auth,profile,pricing}/*`, `modules/{finyk,fizruk,routine}/*` (~9 call-sites).                                                                                                                                    |

> **Owner action:** для обох barrel-ів — coordinated codemod або серія дрібних PR-ів, які переводять deep-import-и на barrel, а потім знімають `@scaffolded`. Скоуп-вкаладчик знає, чого чекати: при наступному `pnpm dead-code:files` файл просто перестане з'являтись у Skipped-секції (бо матиме реальних consumer-ів).

---

## 3. Outstanding findings (для наступних PR-ів)

> Усе нижче — поточний `pnpm knip` output (повний raw output: див. `git log -1 --format=%H` цього аудиту + `pnpm knip` локально). Числа можуть рости/падати між snapshot-ами; цей розділ — пріоритезатор, **не** authoritative tracker. Кожна рубрика — окрема ініціатива; не bundles в один PR.

### 3.1 Unused dependencies (3) — клін у `package.json`

| Пакет                          | Workspace           | Що перевірити перед видаленням                                                                               |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@capacitor/ios`               | `apps/mobile-shell` | Чи планується iOS build найближчим часом? Якщо ні — видалити; якщо так — додати у `knip.ignoreDependencies`. |
| `@fontsource-variable/dm-sans` | `apps/web`          | Шрифт DM Sans використовується? `grep -r "dm-sans\|DM Sans" apps/web/src` має нуль hits.                     |
| `idb-keyval`                   | `apps/web`          | IndexedDB замінено на `webKVStore` / `safeReadStringLS` після storage-roadmap PR #006. Можна видалити.       |

### 3.2 Unused devDependencies (4)

| Пакет                            | Workspace            | Note                                                                                                      |
| -------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `@stryker-mutator/vitest-runner` | `apps/web`           | Mutation testing — див. `docs/testing/mutation.md`. Рішення: чи keep-and-wire або drop.                   |
| `openapi-typescript`             | root                 | Замінено `pnpm api:generate-openapi-types`? Перевірити, чи `pnpm api:check-openapi-types` працює без неї. |
| `tsc-files`                      | root                 | Невикористаний lint helper. Перевірити lint-staged config.                                                |
| `drizzle-kit`                    | `packages/db-schema` | Drizzle migration generator. Якщо migration-flow на чистому SQL — drop.                                   |

### 3.3 Unused exports (77) + Unused exported types (6)

Переважно — test-only helper-и (`__resetXxxForTests`), feature-flag boot helper-и, які чекають на майбутнє use-site (`useReducedMotion`, `useHaptic`), і анімовані UI-компоненти, які ще не вживаються (`AnimatedSlideIn`, `AnimatedCurrency`, `MiniSuccess`). Рекомендований підхід:

1. **Test-helper-и (`__reset*ForTests`)** — або позначити `@scaffolded` (якщо ми справді хочемо тримати їх для майбутніх інтеграційних тестів), або видалити (test-only глобальні reset-и часто crystallize anti-pattern). Decision per package.
2. **UI-компоненти / hook-и без consumer-ів** — більшість з них під `@shared/...` barrel-ями, які вже мають `@scaffolded`. Як тільки barrel «прокинеться» (тобто consumer-и переїдуть з deep-imports), знаки `unused export` зникнуть автоматично.
3. **Domain helpers (`exportToCSV`, `exportToPDF`, `dataToHTMLTable`)** — справжні дашборд-features, які ще не вмонтовані в UI. Або wire it in, або викинути.

> **Не рекомендується:** масовий sweep одним PR-ом. Краще per-module mini-PR (≤200 LOC) з runtime-перевіркою, що жоден lazy-loaded path не зламався.

### 3.4 Duplicate exports (51)

Усі — pattern «named-export + `default`», характерний для React-component файлів, що написані на `export function Foo` + `export default Foo`. Knip це бачить як дублювання, але у RN/React-Native світі багато інструментів очікують `default`-export-у. Рекомендований підхід:

- **Не fix-нути «по списку»** — багато з default-export-ів очікуються Expo Router / hub registry / lazy-import-ами.
- **Зберегти статус-кво** і додати `--no-error-on-duplicate-exports` у knip config якщо це роздратування. Альтернатива — позначити список у `knip.json` як ignoreExports.

### 3.5 Knip configuration hints (18)

Це нагадування knip про те, що частина `entry` / `ignoreDependencies` записів у `knip.json` стали зайвими. Рекомендований cleanup:

- `apps/web` — drop `tailwindcss` і `web-vitals` з `ignoreDependencies` (knip тепер їх ловить як used).
- `apps/server` — `src/index.ts`, `build.mjs`, `migrate.mjs` redundant-entry-и.
- `packages/api-client`, `apps/mobile-shell` — кілька redundant entry-pattern-ів.

> **Risk:** drop-pattern-ів повинен супроводжуватись повним `pnpm knip` reproof — інакше якийсь entry може випасти і `unused files` зросте з 0 на 5.

### 3.6 Unlisted dependencies (23) — можна підчистити

Перевага швидко закриваємих — `expo-updates`, `expo-system-ui` у `apps/mobile/app.config.ts` мають бути у `dependencies`. Інші — типу `jsdom`, `vitest/config`, `vitest`, `better-sqlite3` — у test-файлах, де `devDependencies` вже зазвичай є на root-рівні монорепо, але knip не резолвить через workspace-pattern.

> **Не блокер:** зразкові helper-и pnpm/turbo вже їх знаходять; це косметика для knip. Можна підчистити у одному «chore(deps)» PR-і.

---

## 4. Що **не** змінено (з намірення)

- **Hard Rules** (DB bigint coercion, RQ keys factories, sequential migrations, scope enum, pnpm overrides, freshness, etc.) не зачіпаються — кожне правило перевірено `pnpm lint`-ом проти HEAD; всі pass.
- **Tech-debt registry** (`docs/tech-debt/{frontend,backend,mobile}.md`) — `pnpm lint:tech-debt-freshness` повертає всі позиції < 60 днів, нема stale записів.
- **AI-LEGACY markers** — `pnpm lint:ai-legacy` returns `0 marker(s) found` (репо чисто).
- **Doc freshness coverage** — `pnpm docs:check-freshness-coverage` returns `All tracked markdown files have a freshness header` (включно з цим аудитом).

---

## 5. Acceptance gates (як перевірити)

```bash
pnpm install --frozen-lockfile
pnpm dead-code:files               # No unmarked unused files. ✓
pnpm docs:check-links              # ✅All markdown links resolve.
pnpm lint:tech-debt-freshness      # ✅ — < 60 day(s) ago.
pnpm lint:ai-legacy                # ✅All AI-LEGACY markers are within their expiry window.
pnpm docs:check-freshness-coverage # ✅All tracked markdown files have a freshness header.
```

> Знакові tool-output-и наведені вище у §1. Cмугу інших гардів (`pnpm lint`, `pnpm typecheck`, `pnpm test`) цей PR не порушує — зміни винятково markdown + JSDoc-маркери.

---

## 6. Як читати raw `pnpm knip` output

Якщо хочеться повторити цей аналіз локально / для регресії:

```bash
pnpm knip --reporter=json | tee dist/knip-snapshot-$(date +%F).json
```

Виходить single-line JSON, який потім порівнюється поміж snapshot-ами — це і є основний механізм трекати «чи зростає кількість unused-export-ів за час». Існуючий гард [`scripts/knip-respects-scaffolded.mjs`](../../scripts/knip-respects-scaffolded.mjs) парсить цей JSON і відфільтровує файли з lifecycle-маркерами.

---

## Зв'язки

- [`docs/audits/2026-05-02-doc-hygiene-audit.md`](./2026-05-02-doc-hygiene-audit.md) — попередній doc-hygiene прохід (звідки розпочаті `scripts/codemods/` каталог + thin-pointer формат `CLAUDE.md`/`DEVIN.md`).
- [`AGENTS.md` → Hard Rule #10](../../AGENTS.md) — лайфциклові маркери (`@scaffolded` / `@deprecated` / `@experimental`) як умова для dead-code:files гарду.
- [`scripts/codemods/README.md`](../../scripts/codemods/README.md) — каталог одноразових міграційних скриптів.
- [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) — outstanding tech-debt по `apps/web`, на яке посилаються initiatives 0006/0007.
- [`do./2026-05-03-web-deep-dive/02-architecture-and-state.md`](./2026-05-03-web-deep-dive/02-architecture-and-state.md) — джерело `@scaffolded` маркерів для `useApiForm` барелу та storage-roadmap PR-ів.
