# ESLint config — структура та roadmap split

> **Last touched:** 2026-09-17 by @claude (шапка під зміст 2026-09; DoD phase 2 відмічено за фактом). **Next review:** 2026-12-16.
> **Status:** Active

Sergeant використовує ESLint flat-config (v9+). Цей документ описує:

1. Поточну структуру (post PR-31 phase 1).
2. Чому split на per-app виноситься у phase 2.
3. Як додавати/мігрувати правила без silent regression.

## Поточна структура (post PR-31 phase 2a)

```
eslint.config.js              (root — thin composition manifest, ~37 рядків)
eslint.baseline.js            (shared baseline — phase 1 extract, ~276 рядків)
eslint.web.js                 (apps/web blocks + i18n burndown JSON allowlist)
eslint.server.js              (apps/server blocks)
eslint.mobile.js              (apps/mobile blocks)
eslint.shell.js               (apps/mobile-shell blocks)
eslint.openclaw.js            (removed — tools/openclaw decommissioned ADR-0075; block archived)
eslint.packages.js            (eslint-plugin-sergeant-design self-lint blocks)
eslint.cross-surface.js       (blocks spanning 2+ surfaces — server+web,
                               web+mobile; historical server+openclaw block removed)
eslint.type-aware.js          (apps/** — ЄДИНИЙ блок, що питає типи в TS)
eslint.floating-promises-baseline.js  (борговий allowlist під той блок)
apps/web/eslint.i18n-allowlist.json
packages/eslint-plugin-sergeant-design/index.js
```

Кожен `eslint.<surface>.js` експортує масив `files:`-scoped блоків для своєї
поверхні; root `eslint.config.js` спредить `...baseline`, потім усі
`...<surface>Blocks`, і `eslintConfigPrettier` останнім. ESLint flat-config
мерджить `rules` за порядком масиву — композиція зберігає оригінальний
resolution, тож `eslint --print-config` byte-identical (гард
`pnpm lint:eslint-config-diff`).

**До PR-31 phase 1:** `eslint.config.js` був одним monolith-файлом на 1073
рядки. Це викликало три проблеми:

1. Один dev змінює правило для `apps/server` → впливає на all apps (рулі
   склеєні через top-level `**/*` block).
2. CI `pnpm lint` runs ALL rules для ALL files → slow (~2m9s end-to-end
   на main).
3. Per-app config easier для onboarding (one app = one place to look).

**Після PR-31 phase 1:** shared baseline винесений у `./eslint.baseline.js`
(180 рядків — `ignores`, `js.configs.recommended`, `tsRecommendedScoped`,
react/flat, jsx-a11y/flat, global `**/*` plugin/settings/rules block,
TS-only `@typescript-eslint/no-unused-vars`). Root config робить
`...baseline` spread на початку масиву, після чого ідуть surface-specific
блоки (apps/web, apps/server, apps/mobile, apps/mobile-shell,
packages/eslint-plugin-sergeant-design, jest setup,
packages/api-client, тощо — 28 file-glob blocks).

`eslint --print-config <file>` залишається **byte-identical** до pre-PR-31
state — поведінкова no-op, шар-1 розчищення під phase 2.

## Phase 2 roadmap

> **Phase 2a — DONE (root-composes per-surface extraction).** Surface блоки
> винесені у `eslint.<surface>.js` модулі (див. структуру вище); root —
> 37-рядковий composition manifest. Byte-neutral, гард `lint:eslint-config-diff`
> зелений без зміни снапшотів. Root <300 ✅.
>
> **Phase 2b — DONE (2026-06-15, per-package standalone configs + Turbo
> parallelism).** Кожен linted-пакет має власний `eslint.config.js`. Замість
> того, щоб **форкати** rule-set per-surface (self-sufficient slice → drift-
> ризик cross-surface блоків, який оригінальний spec не вирішував), кожен
> per-package config **re-export-ить незмінений root-manifest** через тонкий
> `basePath`-wrapper (`eslint.per-package.js`). Root-блоки несуть repo-root-
> relative глоби (`apps/web/src/**`, …); `basePath` повертає їх resolution до
> кореня репозиторію, навіть коли config живе у субдиректорії. Блоки, скоупнуті
> на інші поверхні, просто не матчать жоден файл під cwd пакета → інертні.
> Результат — `eslint --print-config` per-package **byte-identical** до root-
> manifest, прогнаного з кореня (гард `lint:eslint-config-diff` у cd-per-
> package режимі). Cross-surface дилема знята: жодного дублювання, єдине
> джерело правил лишається в root-модулях.

Поточна структура **2b** (standalone per-package `eslint.config.js`):

```
eslint.config.js              (root manifest — спредить baseline + усі
                               surface-блоки + cross-surface; джерело правил)
eslint.baseline.js            (shared baseline)
eslint.<surface>.js           (web / server / mobile / shell / packages /
                               cross-surface — surface-scoped блоки)
eslint.per-package.js         (packageConfig(basePath) — обгортає root array
                               у defineConfig([{ basePath, extends: root }]))
apps/{web,server,mobile,mobile-shell}/eslint.config.js   (2-line re-export)
packages/{shared,api-client,db-schema,finyk-domain,fizruk-domain,
          nutrition-domain,routine-domain,
          eslint-plugin-sergeant-design}/eslint.config.js (2-line re-export)
```

Кожен per-package файл — це `export default packageConfig("../..")`. ESLint
flat-config discovery зупиняється на цьому файлі при лінті з cwd пакета
(`turbo run lint`), тож config має бути self-sufficient — і він є, бо
`packageConfig` віддає повний root-array. Правила редагуються у
`eslint.baseline.js` / `eslint.<surface>.js`, **ніколи** у per-package
lint-скрипта (turbo його не лінтить). `tools/openclaw` видалено (ADR-0075);
cross-surface security-правила для server живуть у `eslint.server.js`.

### Acceptance criteria (DoD) для phase 2

> Відмічено 2026-09-17 за фактом (phase 2a/2b DONE вище): `wc -l eslint.config.js` = 37; `ls apps/*/eslint.config.* packages/*/eslint.config.*` — кожен linted-пакет; гард `pnpm lint:eslint-config-diff` — крок CI у джобі `check`.

- [x] Root `eslint.config.js` < 300 рядків.
- [x] Кожен app/package має власний `eslint.config.js`.
- [x] `pnpm lint` все ще зелений на all PR-target files.
- [ ] CI час `pnpm lint` зменшено (target: <30s через Turbo parallelism) — не заміряно окремо; кеш лінту на двох рівнях описано в [ADR-0093](../../governance/adr/0093-eslint-kept-lint-pipeline-cached.md).
- [x] Diff-test: для 7+ fixture-файлів pre-extraction vs post-extraction
      `eslint --print-config` produce byte-identical output —
      [`scripts/eslint-print-config-diff.mjs`](../../../scripts/eslint-print-config-diff.mjs) (`pnpm lint:eslint-config-diff`).

### Why phase 1 first

Root config has 28 file-glob blocks з subtle interactions:

- `apps/server` security rules у `eslint.server.js` (historical: shared з `tools/openclaw`, removed ADR-0075).
- `apps/web` + `apps/mobile` share i18n burndown allowlist (line ~960).
- `apps/web` + `apps/mobile` share module-accent containment (line ~870).
- `apps/server/src/**` + `apps/web/src/**` share `no-restricted-imports`
  (line ~790).

Лiфтинг piecewise потребує diff-test scaffolding which doesn't yet exist.
Phase 1 ships the scaffolding (baseline file + this doc + the
print-config fixture pattern in `/tmp/pr31-baseline/` під час dev) без
per-surface ризику.

## Type-aware зріз (`eslint.type-aware.js`)

Усі блоки вище читають лише AST. `eslint.type-aware.js` — виняток: він
вмикає `parserOptions.projectService`, тобто парсер будує TS-програму і
правила бачать типи. Наразі там одне правило —
`@typescript-eslint/no-floating-promises`, увімкнене 2026-09-16 рішенням
власника на `apps/**` (не на `packages/**`).

**Навіщо.** Це рівно той клас багів, який PR #82 лагодив руками: чотири
дзеркалення в SQLite на мобільному запускались без `.catch`, і невдалий
запис зникав без логу, без Sentry і без видимого симптому. AST-лінтер такого
не бачить — треба знати, що вираз має тип `Promise`.

**Ціна** (замір 2026-09-16, `apps/web/src`, 2752 файли):

| Прогін                       | Було | Стало |
| ---------------------------- | ---- | ----- |
| холодний (`--no-cache`)      | 84 с | 139 с |
| теплий (`--cache`, без змін) | —    | 6 с   |

Тобто CI платить один холодний прохід на воркспейс (turbo кешує), а
щоденний локальний лінт — ні.

**Сліпі зони.** Type-aware лінт потребує tsconfig, який МІСТИТЬ файл; інакше
парсер валить файл цілком (`was not found by the project service`). Тому блок
має список `PROJECT_SERVICE_BLIND_SPOTS` — і кожен запис там це справжній
пробіл, не смак. Найбільший: `apps/web/tests/**` (Playwright-специ, 51 файл)
поза `include: src/**/*`. Закривати їх — окрема робота, бо розширення
tsconfig тягне за собою і `typecheck`.

**Борг.** `eslint.floating-promises-baseline.js` тримає 83 файли (198 знахідок
станом на 2026-09-16), для яких правило вимкнене. Це храповик: список може
меншати, не рости. Виправив файл — прожени
`node scripts/ci/check-floating-promises-baseline.mjs --bump`. Гейт
`pnpm lint:floating-promises` (у ланцюжку `pnpm lint`) падає, коли запис у
baseline більше не потрібен: інакше виправлений файл тихо лишався б без
правила, і регресія в ньому пройшла б лінт.

## Як додавати нове правило

1. **Якщо правило застосовується до всіх файлів** (TS, JSX, server, web,
   mobile, console) → додай у `eslint.baseline.js` всередині `baseline`
   масиву, у відповідний блок (global `**/*` rules / TS-only / тощо).
2. **Якщо правило surface-specific** → додай у root `eslint.config.js`
   всередині існуючого блока (фільтрованого по `files:` глобу) АБО створи
   новий блок з відповідним `files:` після `...baseline`.
3. **Якщо правило для `packages/eslint-plugin-sergeant-design`-custom rule**
   → додай саме правило у `packages/eslint-plugin-sergeant-design/rules/`,
   реєструй у `index.js`, enable в baseline/root по scope.
4. **Якщо правилу потрібні типи** (`no-floating-promises`, `no-misused-promises`,
   `await-thenable`, …) → додай у `eslint.type-aware.js`. Не вмикай type-aware
   парсер у решті блоків: один зріз тримає всю ціну TS-програми в одному місці.

Завжди:

- Дай rule пояснювальний коментар (як кодова база уже робить — див.
  `react-hooks/set-state-in-effect`, `sergeant-design/rq-keys-only-from-factory`, etc.) з посиланням на ADR/playbook де релевантно.
- Якщо rule severity `warn` тимчасово, додай `TODO(<initiative>):
<ETA>` коментар поряд.
- Запусти `pnpm lint` локально перед commit.
- **Створив новий кореневий `eslint.*.js` — додай його в `turbo.json` →
  `globalDependencies`.** Інакше зміна правила в ньому не інвалідує кеш, і
  `turbo run lint` рапортує `cached` на дереві, яке `--force` валить. З
  2026-09-16 це перевіряє тест у
  `scripts/ci/__tests__/check-floating-promises-baseline.test.mjs`.

## Pre-existing failures

Станом на 2026-05-13 (після dead-code purge): `@sergeant/web` лінт чистий. Попереднє pre-existing
failure (`sergeant-design/no-low-contrast-text-on-fill` — правило згодом retired [ADR-0081](../../governance/adr/0081-repository-simplification.md) — на видаленому зараз віджеті dashboard) вирішено
при dead-code purge у PR ПО слідам [audit `2026-05-13-dead-code-hard-rules-roast.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-05-13-dead-code-hard-rules-roast.md).

## Refs

- [ESLint flat config docs](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Turbo task pipelines](https://turbo.build/repo/docs/core-concepts/monorepos/task-dependencies)
- `docs/work/specs/initiatives/stack-pulse-2026-05/pr-31-eslint-config-split.md` — оригінальний spec.
- `packages/eslint-plugin-sergeant-design/index.js` — custom design rules.
