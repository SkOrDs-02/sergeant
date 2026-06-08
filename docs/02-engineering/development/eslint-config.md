# ESLint config — структура та roadmap split

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Sergeant використовує ESLint flat-config (v9+). Цей документ описує:

1. Поточну структуру (post PR-31 phase 1).
2. Чому split на per-app виноситься у phase 2.
3. Як додавати/мігрувати правила без silent regression.

## Поточна структура (post PR-31 phase 2a)

```
eslint.config.js              (root — thin composition manifest, ~37 рядків)
eslint.baseline.js            (shared baseline — phase 1 extract, ~276 рядків)
eslint.web.js                 (apps/web blocks + 3 burndown JSON allowlists)
eslint.server.js              (apps/server blocks)
eslint.mobile.js              (apps/mobile blocks)
eslint.shell.js               (apps/mobile-shell blocks)
eslint.openclaw.js            (tools/openclaw blocks)
eslint.packages.js            (eslint-plugin-sergeant-design self-lint blocks)
eslint.cross-surface.js       (blocks spanning 2+ surfaces — server+web,
                               web+mobile, server+openclaw)
apps/web/eslint.i18n-allowlist.json
apps/web/eslint.toast-error-action-allowlist.json
apps/web/eslint.bare-fixed-inset-modal-allowlist.json
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
packages/eslint-plugin-sergeant-design, tools/openclaw, jest setup,
packages/api-client, тощо — 28 file-glob blocks).

`eslint --print-config <file>` залишається **byte-identical** до pre-PR-31
state — поведінкова no-op, шар-1 розчищення під phase 2.

## Phase 2 roadmap

> **Phase 2a — DONE (root-composes per-surface extraction).** Surface блоки
> винесені у `eslint.<surface>.js` модулі (див. структуру вище); root —
> 37-рядковий composition manifest. Byte-neutral, гард `lint:eslint-config-diff`
> зелений без зміни снапшотів. Root <300 ✅.
>
> **Phase 2b — DEFERRED (per-package standalone configs + Turbo parallelism).**
> Наступний крок — справжні `apps/<x>/eslint.config.js`, self-sufficient
> (`...baseline` + cross-surface-for-X + X-only, package-relative globs), щоб
> per-package `eslint .` (Turbo) резолвив власний конфіг замість walk-up до
> root. Це **змінює resolution-model**: треба модифікувати diff-gate (cd
> per-package замість print-config з кореня) + re-baseline снапшоти у CI-env.
> Cross-surface дилема (~10 блоків) при цьому вимагає дублювання правил у
> кожен app-конфіг (drift-ризик) — рішення приймається у 2b.

Наведений нижче діаграма-варіант — це ціль **2b** (per-app `eslint.config.js`):

```
eslint.config.js                       (root — мінімум, тільки re-export
                                        baseline + cross-surface правила
                                        для `packages/**`)
eslint.baseline.js                     (shared baseline)
apps/server/eslint.config.js           (extends baseline + node + security)
apps/web/eslint.config.js              (extends baseline + i18n + dark-mode
                                        + module accents + `apps/web`-only)
apps/mobile/eslint.config.js           (extends baseline + RN + nativewind)
apps/mobile-shell/eslint.config.js     (extends baseline + capacitor)
tools/openclaw/eslint.config.js         (extends baseline + telegram/grammy)
packages/shared/eslint.config.js       (extends baseline + isomorphic)
packages/api-client/eslint.config.js   (extends baseline + no-react)
packages/eslint-plugin-sergeant-design/eslint.config.js  (extends + meta)
```

ESLint flat-config discovery walks up from the linted file to the closest
`eslint.config.js`, тому per-app configs працюють без `extends:` ланцюжків
або monorepo-plumbing — тільки `import { baseline } from
"../../eslint.baseline.js"`.

### Acceptance criteria (DoD) для phase 2

- [ ] Root `eslint.config.js` < 300 рядків.
- [ ] Кожен app/package має власний `eslint.config.js`.
- [ ] `pnpm lint` все ще зелений на all PR-target files.
- [ ] CI час `pnpm lint` зменшено (target: <30s через Turbo parallelism).
- [ ] Diff-test: для 7+ fixture-файлів pre-extraction vs post-extraction
      `eslint --print-config` produce byte-identical output — phase 2
      введе цей гард (планований script `scripts/eslint-print-config-diff` (`.mjs`)).

### Why phase 1 first

Root config has 28 file-glob blocks з subtle interactions:

- `apps/server` + `tools/openclaw` share `security/*` rules (line ~700).
- `apps/web` + `apps/mobile` share i18n burndown allowlist (line ~960).
- `apps/web` + `apps/mobile` share module-accent containment (line ~870).
- `apps/server/src/**` + `apps/web/src/**` share `no-restricted-imports`
  (line ~790).

Лiфтинг piecewise потребує diff-test scaffolding which doesn't yet exist.
Phase 1 ships the scaffolding (baseline file + this doc + the
print-config fixture pattern in `/tmp/pr31-baseline/` під час dev) без
per-surface ризику.

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

Завжди:

- Дай rule пояснювальний коментар (як кодова база уже робить — див.
  `react-hooks/set-state-in-effect`, `sergeant-design/no-low-contrast-
text-on-fill`, etc.) з посиланням на ADR/playbook де релевантно.
- Якщо rule severity `warn` тимчасово, додай `TODO(<initiative>):
<ETA>` коментар поряд.
- Запусти `pnpm lint` локально перед commit.

## Pre-existing failures

Станом на 2026-05-13 (після dead-code purge): `@sergeant/web` лінт чистий. Попереднє pre-existing
failure (`sergeant-design/no-low-contrast-text-on-fill` на видаленому зараз віджеті dashboard) вирішено
при dead-code purge у PR ПО слідам [audit `2026-05-13-dead-code-hard-rules-roast.md`](../../90-work/audits/2026-05-13-dead-code-hard-rules-roast.md).

## Refs

- [ESLint flat config docs](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Turbo task pipelines](https://turbo.build/repo/docs/core-concepts/monorepos/task-dependencies)
- `docs/90-work/initiatives/stack-pulse-2026-05/pr-31-eslint-config-split.md` — оригінальний spec.
- `packages/eslint-plugin-sergeant-design/index.js` — custom design rules.
