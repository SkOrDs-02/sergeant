# PR-31: ESLint config 1073 рядки → split per-app

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Phase 1 shipped — baseline extracted into `eslint.baseline.js` (PR-31 phase 1, ~180 рядків, byte-identical `--print-config` output verified on 7 fixture files). Phase 2 deferred: per-surface extracts (apps/web, apps/server, apps/mobile, apps/mobile-shell, tools/console, packages/\*\*) tracked separately — потребує diff-test scaffolding (`scripts/eslint-print-config-diff.mjs`) перед extraction.

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

`docs/development/eslint-config.md` — який config де живе, як додавати правила.

## Out of scope

- Перехід на BiomeJS / Oxlint — окремий ADR.
- Custom rules в `packages/eslint-plugin-sergeant-design` — окремий PR review.

## Acceptance criteria (DoD)

- [ ] Root `eslint.config.js` < 300 рядків.
- [ ] Кожен app/package має власний `eslint.config.js`.
- [ ] `pnpm lint` все ще зелений на all PR-target files.
- [ ] CI час `pnpm lint` зменшено (target: <30s через Turbo parallelism).
- [ ] `docs/development/eslint-config.md` з diagram + onboarding.

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
- `docs/development/eslint-config.md` — new

## Refs

- [ESLint flat config docs](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Turbo task pipelines](https://turbo.build/repo/docs/core-concepts/monorepos/task-dependencies)
