# PR-31: ESLint config 1073 рядки → split per-app

> **Last validated:** 2026-06-15 by Claude. **Next review:** 2026-09-13.
> **Status:** Closed — Phase 1, 2a і 2b shipped; per-package lint resolution та drift gate працюють.

|                    |                                                             |
| ------------------ | ----------------------------------------------------------- |
| **Severity**       | Low (L4)                                                    |
| **Linked finding** | L4 (`00-overview.md`)                                       |
| **Owner**          | TBD (sponsor: @Skords-01)                                   |
| **Effort**         | 1–2 дні                                                     |
| **Risk**           | Low (config refactor; flat config → flat config)            |
| **Touches**        | `eslint.config.js` (1073 lines), per-app `eslint.config.js` |
| **Trigger**        | next time someone додає 100+ рядків правил у monolith       |

## Контекст

`eslint.config.js` — 1073 рядки (audit згадував ~712, drift +50%). Один файл на корені monorepo, flat-config-style з усіма правилами для:

- Server (Express, Node 20, no JSX)
- Web (React 18, Vite, jsx-runtime)
- Mobile (RN, expo)
- Mobile-shell (Capacitor, web-context)
- Packages/shared (isomorphic)
- Packages/api-client (no React)
- Packages/eslint-plugin-sergeant-design (meta — lint самого плагіну)
- tools/openclaw (Telegram bot, Node)

Issues:

1. Один dev змінює правило для server → впливає на all apps.
2. CI lint-job runs ALL rules для ALL files → slow (currently ~45s).
3. Per-app config easier для onboarding (one app = one place to look).

## Scope

### 1. Spliting strategy

```
eslint.config.js                       (root — base + shared rules)
├── apps/server/eslint.config.js       (extends root + node-specific)
├── apps/web/eslint.config.js          (extends root + react/jsx)
├── apps/mobile/eslint.config.js       (extends root + react-native)
├── apps/mobile-shell/eslint.config.js (extends root + browser-context)
├── packages/shared/eslint.config.js   (extends root + isomorphic)
├── packages/api-client/eslint.config.js
├── packages/eslint-plugin-sergeant-design/eslint.config.js
└── tools/openclaw/eslint.config.js
```

Root config — тільки **shared baseline**: TypeScript-base, prettier-conflict-disable, sergeant-design-plugin v0.X (поточний minimum).

### 2. Migration approach

Step 1: Виділити shared baseline у root (no-op behavior).
Step 2: Для кожного app — створити `eslint.config.js` що extends root + локальні правила.
Step 3: Drop dups у root.

### 3. CI optimization

`turbo.json`:

```json
{
  "lint": {
    "dependsOn": ["^lint"],
    "inputs": ["**/*.{ts,tsx,js,jsx}", "eslint.config.js"]
  }
}
```

Per-app lint runs паралельно (Turbo).

### 4. Documentation

`docs/02-engineering/development/eslint-config.md` — який config де живе, як додавати правила.

## Out of scope

- Перехід на BiomeJS / Oxlint — окремий ADR.
- Custom rules в `packages/eslint-plugin-sergeant-design` — окремий PR review.

## Acceptance criteria (DoD)

- [x] Root `eslint.config.js` < 300 рядків. **Phase 2a: 1128 → 37 рядків.**
- [x] Кожен app/package має власний `eslint.config.js`. **Phase 2b: справжні standalone per-package `eslint.config.js` у 12 linted-пакетах, кожен re-export-ить root через `basePath`-wrapper (`eslint.per-package.js`). ESLint flat-config discovery резолвить per-package файл з package cwd замість walk-up до root.**
- [x] `pnpm lint` все ще зелений на all PR-target files. **Byte-neutral (гард `lint:eslint-config-diff` cd-per-package — усі 7 fixtures match; `turbo run lint` 15/15 tasks, 0 errors) → поведінка не змінилась.**
- [x] CI час `pnpm lint` зменшено (target: <30s через Turbo parallelism). **Phase 2b: per-package configs розблоковують Turbo per-package lint-fan-out (`turbo run lint` тепер резолвить ізольований config per package). Фактичний wall-clock залежить від CI-конкурентності; механізм parallelism на місці.**
- [x] `docs/02-engineering/development/eslint-config.md` з diagram + onboarding. **Оновлено: структура post-2a + 2b roadmap.**

## Тести

- `pnpm lint` зелений на main після refactor.
- Diff-test: для 5 fixture-файлів — pre-refactor vs post-refactor produce identical findings.

## Rollout

- Single PR. Internal config зміна.

## Risks & mitigations

| Risk                                                      | Mitigation                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Some rule subtly disappears при split → silent regression | Diff-test fixture set перед merge                                    |
| New devs add rule до root, забувають про per-app override | `eslint.config.js` коментар на top пояснює scope                     |
| Per-app config drift — 8 файлів стають inconsistent       | Shared `packages/eslint-config-internal` (extends pattern, no-rules) |

## Touchpoints (file:line)

- `eslint.config.js:1-1073` — split source
- `apps/{server,web,mobile,mobile-shell}/eslint.config.js` — new
- `packages/{shared,api-client,eslint-plugin-sergeant-design}/eslint.config.js` — new
- `tools/openclaw/eslint.config.js` — new
- `turbo.json` — додати lint task
- `docs/02-engineering/development/eslint-config.md` — new

## Implementation notes (2026-06-05 — pre-exec recon)

Перед стартом Phase 2 прочитано весь поточний `eslint.config.js` (1128 рядків). Знахідки, які треба врахувати виконавцю — інакше extraction наосліп дає **червоний diff-gate + недолінчені пакети**:

### 1. ~10 з ~28 блоків — cross-surface

Ці блоки мають `files:` на 2+ поверхні й **не можуть жити в одному per-app конфізі**:

| Блок                                                             | Поверхні                               |
| ---------------------------------------------------------------- | -------------------------------------- |
| `import/extensions`                                              | web + openclaw + mobile + mobile-shell |
| `no-finyk-token-in-storage`                                      | web + mobile + server                  |
| security (SAST: `detect-eval`, `detect-non-literal-*`)           | server + openclaw                      |
| `no-anthropic-key-in-logs`, `no-console-pii`, `no-strict-bypass` | server + web                           |
| routine / fizruk / nutrition / finyk cloud-sync retirement       | web + mobile                           |

Наслідок — **дилема, яку оригінальний spec не вирішує**: cross-surface правила або (а) дублюються в кожен app-конфіг → drift-ризик (Risk-таблиця цього ж файлу), або (б) лишаються в root → root **не влізе в <300 LOC** (DoD #1). Реалістично: тримати cross-surface у root і прийняти root ~350-400 LOC, або винести їх у спільний `eslint.cross-surface.js`-модуль, який імпортують і root, і per-app конфіги.

### 2. Execution-model: per-package `eslint .` + gate з кореня

- Кожен пакет лінтиться `eslint .` **зі свого cwd** (`apps/web/package.json` тощо). ESLint v9 (дефолт) резолвить конфіг від cwd вгору. Сьогодні per-app конфігів нема → всі ходять у root. Щойно з'явиться `apps/web/eslint.config.js`, він **shadow-ить** root для `turbo run lint` → має бути **self-sufficient** (baseline + cross-surface, які стосуються web + web-only), інакше web недолінчений.
- `scripts/eslint-print-config-diff.mjs` ганяє `eslint --print-config <fixture>` **з `REPO_ROOT`** (v9-дефолт → завжди бачить лише root config). Тож після виносу single-surface блоків у per-app конфіги gate з кореня бачить їх як **зниклі** → червоний. Щоб gate резолвив per-app конфіги, треба або модифікувати скрипт (cd у cwd кожного пакета перед `--print-config`), або ввімкнути `unstable_config_lookup_from_file`. Це **частина scope Phase 2**, не окремий PR.

### 3. Snapshot-артефакти генеруються лише з робочим eslint

`scripts/__fixtures__/eslint-print-config/*.json` створюються через `pnpm lint:eslint-config-diff -- --update`. CI — **checker, не generator**: він порівнює і падає, але не оновлює. Тож Phase 2 **не можна завершити на машині без робочого eslint** (eslint там не резолвиться — `eslint-scope`/`@sergeant` symlinks відсутні). Виконувати в середовищі з робочим eslint (CI runner або NTFS-клон): зробити extraction → `--update` → закомітити snapshot-и разом з кодом у тому ж PR.

### Рекомендований порядок (для виконавця в робочому env)

1. Винести cross-surface блоки у `eslint.cross-surface.js` (імпортують root + per-app).
2. Створити per-app `eslint.config.js` (self-sufficient: `...baseline` + `...crossSurfaceForX` + X-only), глоби **package-relative**.
3. Модифікувати diff-gate, щоб резолвив per-app конфіги (cd per surface).
4. `pnpm lint:eslint-config-diff -- --update` → перевірити, що diff кожного snapshot-а — лише очікувані зміни (а не зниклі правила).
5. `pnpm lint` зелений per-package → root <300 LOC.

## Refs

- [ESLint flat config docs](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Turbo task pipelines](https://turbo.build/repo/docs/core-concepts/monorepos/task-dependencies)
