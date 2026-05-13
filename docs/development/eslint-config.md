# ESLint config — структура та roadmap split

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Sergeant використовує ESLint flat-config (v9+). Цей документ описує:

1. Поточну структуру (post PR-31 phase 1).
2. Чому split на per-app виноситься у phase 2.
3. Як додавати/мігрувати правила без silent regression.

## Поточна структура

```
eslint.config.js              (root — surface-specific overrides, ~920 рядків)
eslint.baseline.js            (shared baseline, ~180 рядків — phase 1 extract)
apps/web/eslint.i18n-allowlist.json
apps/web/eslint.localstorage-allowlist.json
packages/eslint-plugin-sergeant-design/index.js
```

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
packages/eslint-plugin-sergeant-design, tools/console, jest setup,
packages/api-client, тощо — 28 file-glob blocks).

`eslint --print-config <file>` залишається **byte-identical** до pre-PR-31
state — поведінкова no-op, шар-1 розчищення під phase 2.

## Phase 2 roadmap

Phase 2 (deferred, separate PR) виносить surface-specific блоки у
per-app `eslint.config.js`:

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
tools/console/eslint.config.js         (extends baseline + telegram/grammy)
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
      `eslint --print-config` produce byte-identical output (див.
      `scripts/eslint-print-config-diff.mjs` — phase 2 includes цей
      гард).

### Why phase 1 first

Root config has 28 file-glob blocks з subtle interactions:

- `apps/server` + `tools/console` share `security/*` rules (line ~700).
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

`@sergeant/web` має 1 pre-existing lint **error** на main (станом на
2026-05-13): `sergeant-design/no-low-contrast-text-on-fill` у
`apps/web/src/modules/fizruk/components/dashboard/WeeklyGoalCard.tsx`
line 34 (`bg-fizruk` + `text-white`). Треба замінити на
`bg-fizruk-strong`. Не fix-ив у PR-31 (out of scope), tracked окремо.

## Refs

- [ESLint flat config docs](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Turbo task pipelines](https://turbo.build/repo/docs/core-concepts/monorepos/task-dependencies)
- `docs/initiatives/stack-pulse-2026-05/pr-31-eslint-config-split.md` — оригінальний spec.
- `packages/eslint-plugin-sergeant-design/index.js` — custom design rules.
